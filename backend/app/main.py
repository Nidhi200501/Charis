import os
import hashlib
import hmac
import secrets
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import bleach
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from .catalog import retrieve_gifts

try:
    import psycopg
    from psycopg.types.json import Jsonb
except ImportError:  # Database is optional while the prototype is being configured.
    psycopg = None
    Jsonb = None

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="CHARIS Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REQUIRED_FIELDS = ["recipient", "relationship", "occasion", "budget", "personality", "interests", "impact"]
SUGGESTIONS = {
    "recipient": ["My partner", "A close friend", "A parent", "A colleague"],
    "relationship": ["They know me best", "We're growing closer", "They've always been there", "A new beginning"],
    "occasion": ["Birthday", "Anniversary", "A thank you", "Just because"],
    "budget": ["Under $100", "$100 – $250", "$250 – $500", "$500 and beyond"],
    "personality": ["Quietly refined", "Curious and playful", "Warm and sentimental", "Bold and expressive"],
    "interests": ["Art and design", "Travel and discovery", "Wellness and ritual", "Food and entertaining"],
    "impact": ["I see you", "I'm grateful", "You deserve something beautiful", "I'll always be here"],
}


def sanitize_text(value: str, maximum: int) -> str:
    cleaned = bleach.clean(str(value), tags=[], attributes={}, strip=True)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", cleaned).strip()
    if not cleaned:
        raise ValueError("Text cannot be empty.")
    if len(cleaned) > maximum:
        raise ValueError(f"Text must be {maximum} characters or fewer.")
    return cleaned


def sanitize_answers(value: dict[str, str]) -> dict[str, str]:
    unknown_fields = set(value) - set(REQUIRED_FIELDS)
    if unknown_fields:
        raise ValueError("Unknown consultation fields.")
    return {key: sanitize_text(item, 300) for key, item in value.items()}


class SecureModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConciergeRequest(SecureModel):
    field: Literal["recipient", "relationship", "occasion", "budget", "personality", "interests", "impact"]
    message: str = Field(min_length=1, max_length=1000)
    answers: dict[str, str] = Field(default_factory=dict)
    quick_reply: bool = False
    start: bool = False

    _clean_message = field_validator("message", mode="before")(lambda value: sanitize_text(value, 1000))

    @field_validator("answers")
    @classmethod
    def clean_answers(cls, value: dict[str, str]) -> dict[str, str]:
        return sanitize_answers(value)


class GiftMessageRequest(SecureModel):
    mode: Literal["improve", "generate"]
    text: str | None = Field(default=None, max_length=5000)
    gift: dict[str, str] = Field(default_factory=dict)
    answers: dict[str, str] = Field(default_factory=dict)

    @field_validator("text", mode="before")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return sanitize_text(value, 5000) if value is not None else None

    @field_validator("gift")
    @classmethod
    def clean_gift(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {"id", "name", "meaning", "category", "price"}
        if set(value) - allowed:
            raise ValueError("Unknown gift fields.")
        return {key: sanitize_text(item, 300) for key, item in value.items()}

    @field_validator("answers")
    @classmethod
    def clean_message_answers(cls, value: dict[str, str]) -> dict[str, str]:
        return sanitize_answers(value)


class AuthRequest(SecureModel):
    name: str | None = Field(default=None, max_length=120)
    email: EmailStr
    password: str | None = Field(default=None, min_length=6, max_length=128)
    provider: Literal["email", "google"] = "email"

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        return sanitize_text(value, 120)


class ConsultationCreate(SecureModel):
    user_id: int = Field(gt=0)
    answers: dict[str, str] = Field(default_factory=dict)
    conversation: list[dict[str, str]] = Field(default_factory=list, max_length=100)
    status: Literal["recommendations_ready", "saved_for_later"] = "recommendations_ready"

    @field_validator("answers")
    @classmethod
    def clean_consultation_answers(cls, value: dict[str, str]) -> dict[str, str]:
        return sanitize_answers(value)

    @field_validator("conversation")
    @classmethod
    def clean_conversation(cls, value: list[dict[str, str]]) -> list[dict[str, str]]:
        cleaned = []
        for message in value:
            if set(message) - {"role", "text"} or message.get("role") not in {"assistant", "user"}:
                raise ValueError("Invalid conversation message.")
            cleaned.append({"role": message["role"], "text": sanitize_text(message.get("text", ""), 2000)})
        return cleaned


class SavedGiftCreate(SecureModel):
    user_id: int = Field(gt=0)
    gift_id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)


class GiftMessageCreate(SecureModel):
    user_id: int = Field(gt=0)
    gift_id: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    body: str = Field(min_length=1, max_length=5000)
    source: Literal["manual", "ai", "fallback"] = "manual"

    _clean_body = field_validator("body", mode="before")(lambda value: sanitize_text(value, 5000))


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def database_connection():
    if not os.getenv("DATABASE_URL") or psycopg is None:
        raise HTTPException(status_code=503, detail="PostgreSQL is not configured.")
    try:
        return psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=5)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Unable to connect to PostgreSQL.") from error


def infer_context(message: str, current_field: str, answers: dict[str, str]) -> dict[str, str]:
    # Keep each required field explicit; intent informs the model wording but
    # must not silently skip a concierge question.
    return {**answers, current_field: message}


def next_question(field: str, answers: dict[str, str]) -> str:
    person = answers.get("recipient", "them")
    prompts = {
        "recipient": "Let's start with them. Who are we finding a gift for?",
        "relationship": f"And what is your relationship with {person.lower()}? I want to understand the feeling between you, not just the label.",
        "occasion": "What is bringing you to this moment of giving?",
        "budget": "How much would you like to spend on something considered?",
        "personality": f"If you had to capture {person.lower()}'s energy, which feeling comes closest?",
        "interests": "What do they naturally make time for? Tell me a little about their world.",
        "impact": "Finally, what would you love the gift to say without saying a word?",
    }
    return prompts[field]


def acknowledge(field: str, answers: dict[str, str]) -> str:
    person = answers.get("recipient", "them")
    acknowledgements = {
        "recipient": f"Lovely. I can already picture the kind of thoughtfulness {person.lower()} might appreciate.",
        "relationship": "That helps me understand the emotional distance, and the closeness, behind this gift.",
        "occasion": "The occasion gives us a beautiful starting point. We can make the gesture feel specific to this moment.",
        "budget": "That gives me the right creative boundaries. Beautiful does not have to mean predictable.",
        "personality": "I like that direction. It tells me how the gift should feel in their hands.",
        "interests": "I have a much clearer sense of their world now. I can start connecting the details.",
        "impact": "That is the feeling I was hoping to find. I have enough to curate with intention.",
    }
    return acknowledgements[field]


async def model_reply(context: Any, max_tokens: int = 80) -> str | None:
    endpoint = os.getenv("CHARIS_LLM_URL", "").replace("://localhost:", "://127.0.0.1:")
    if not endpoint:
        return None


    headers = {"Content-Type": "application/json"}
    if os.getenv("CHARIS_LLM_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['CHARIS_LLM_API_KEY']}"
    is_concierge = context.get("mode") == "concierge" if isinstance(context, dict) else False
    system_prompt = (
        "You are CHARIS, an elegant luxury gifting concierge. Reply in no more than 25 words. "
        "Acknowledge the answer warmly and ask only the next missing question. Never write a gift message or a product recommendation yet."
        if is_concierge else
        "You are CHARIS, an elegant and emotionally intelligent luxury gifting concierge."
    )
    payload = {
        "model": os.getenv("CHARIS_LLM_MODEL", "qwen2.5:3b"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": str(context)},
        ],
        "stream": False,
        "keep_alive": "10m",
        "options": {"num_predict": max_tokens, "temperature": 0.55, "top_p": 0.9},
    }
    if "api.groq.com" in endpoint:
        payload.pop("keep_alive", None)
        payload.pop("options", None)
        payload["max_tokens"] = max_tokens
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(endpoint, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content") or data.get("choices", [{}])[0].get("message", {}).get("content")
    except (httpx.HTTPError, KeyError, IndexError, TypeError):
        return None


def clean_gift_message(value: str) -> str:
    cleaned = value.strip().replace("```text", "").replace("```", "").strip()
    cleaned = re.sub(r"^(?:certainly|sure|of course)[!,.\s]+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:here(?:'s| is)\s+(?:an improved|the final|your)\s+(?:version|message)[^:\n]*:\s*)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^(?:improved version|gift message)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    if len(cleaned) >= 2 and cleaned[0] in {'"', "“"} and cleaned[-1] in {'"', "”"}:
        cleaned = cleaned[1:-1].strip()
    cleaned = re.split(r"\n\s*(?:this keeps|this version|i hope this helps|let me know)", cleaned, maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return sanitize_text(cleaned, 5000)


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url or psycopg is None:
        return {"ok": True, "database": "not_connected"}
    try:
        with psycopg.connect(database_url, connect_timeout=3) as connection:
            connection.execute("SELECT 1")
        return {"ok": True, "database": "connected"}
    except Exception:
        return {"ok": True, "database": "not_connected"}


@app.post("/api/auth/signup")
def signup(request: AuthRequest) -> dict[str, str]:
    email = request.email.strip().lower()
    name = (request.name or "").strip()
    if not name or not request.password or len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Name, valid email, and a 6-character password are required.")
    try:
        with database_connection() as connection:
            row = connection.execute(
                "INSERT INTO users (name, email, password_hash, provider) VALUES (%s, %s, %s, 'email') RETURNING id, name, email",
                (name, email, password_hash(request.password)),
            ).fetchone()
        return {"id": str(row[0]), "name": row[1], "email": row[2], "provider": "email"}
    except HTTPException:
        raise
    except Exception as error:
        if "duplicate key" in str(error).lower() or "unique" in str(error).lower():
            raise HTTPException(status_code=409, detail="An account with this email already exists.") from error
        raise HTTPException(status_code=500, detail="Unable to create account.") from error


@app.post("/api/auth/signin")
def signin(request: AuthRequest) -> dict[str, str]:
    email = request.email.strip().lower()
    if not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    with database_connection() as connection:
        row = connection.execute("SELECT id, name, email, password_hash, provider FROM users WHERE email = %s", (email,)).fetchone()
    if not row or not row[3] or not password_matches(request.password, row[3]):
        raise HTTPException(status_code=401, detail="That email or password is not recognised.")
    return {"id": str(row[0]), "name": row[1], "email": row[2], "provider": row[4]}


@app.post("/api/auth/google")
def google_signin(request: AuthRequest) -> dict[str, str]:
    email = request.email.strip().lower()
    name = (request.name or "Google guest").strip()
    with database_connection() as connection:
        row = connection.execute(
            "INSERT INTO users (name, email, provider) VALUES (%s, %s, 'google') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, provider",
            (name, email),
        ).fetchone()
    return {"id": str(row[0]), "name": row[1], "email": row[2], "provider": row[3]}


@app.post("/api/consultations")
def create_consultation(request: ConsultationCreate) -> dict[str, Any]:
    with database_connection() as connection:
        row = connection.execute(
            "INSERT INTO consultations (user_id, answers, conversation, status) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
            (request.user_id, Jsonb(request.answers), Jsonb(request.conversation), request.status),
        ).fetchone()
    return {"id": row[0], "created_at": row[1].isoformat(), "answers": request.answers, "status": request.status}


@app.get("/api/consultations/{user_id}")
def list_consultations(user_id: int) -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT id, answers, status, created_at FROM consultations WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [{"id": row[0], "answers": row[1], "status": row[2], "created_at": row[3].isoformat()} for row in rows]


@app.get("/api/consultations/{user_id}/latest")
def latest_consultation(user_id: int) -> dict[str, Any] | None:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT id, answers, conversation, status, created_at FROM consultations WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "answers": row[1], "conversation": row[2], "status": row[3], "created_at": row[4].isoformat()}


@app.get("/api/consultations/{user_id}/history")
def consultation_history(user_id: int) -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute(
            "SELECT id, answers, conversation, status, created_at FROM consultations WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [{"id": row[0], "answers": row[1], "conversation": row[2], "status": row[3], "created_at": row[4].isoformat()} for row in rows]


@app.post("/api/saved-gifts")
def save_gift(request: SavedGiftCreate) -> dict[str, Any]:
    with database_connection() as connection:
        row = connection.execute(
            "INSERT INTO saved_gifts (user_id, gift_id) VALUES (%s, %s) ON CONFLICT (user_id, gift_id) DO UPDATE SET gift_id = EXCLUDED.gift_id RETURNING id, gift_id, created_at",
            (request.user_id, request.gift_id),
        ).fetchone()
    return {"id": row[0], "gift_id": row[1], "created_at": row[2].isoformat()}


@app.get("/api/saved-gifts/{user_id}")
def list_saved_gifts(user_id: int) -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute("SELECT id, gift_id, created_at FROM saved_gifts WHERE user_id = %s ORDER BY created_at DESC", (user_id,)).fetchall()
    return [{"id": row[0], "gift_id": row[1], "created_at": row[2].isoformat()} for row in rows]


@app.post("/api/gift-messages")
def save_gift_message(request: GiftMessageCreate) -> dict[str, Any]:
    with database_connection() as connection:
        row = connection.execute(
            "INSERT INTO gift_messages (user_id, gift_id, body, source) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
            (request.user_id, request.gift_id, request.body, request.source),
        ).fetchone()
    return {"id": row[0], "created_at": row[1].isoformat()}


@app.get("/api/gift-messages/{user_id}")
def list_gift_messages(user_id: int) -> list[dict[str, Any]]:
    with database_connection() as connection:
        rows = connection.execute("SELECT id, gift_id, body, source, created_at FROM gift_messages WHERE user_id = %s ORDER BY created_at DESC", (user_id,)).fetchall()
    return [{"id": row[0], "gift_id": row[1], "body": row[2], "source": row[3], "created_at": row[4].isoformat()} for row in rows]


@app.post("/api/concierge")
async def concierge(request: ConciergeRequest) -> dict[str, Any]:
    if not os.getenv("CHARIS_LLM_URL"):
        raise HTTPException(status_code=503, detail="CHARIS_LLM_URL is not configured.")
    field = request.field if request.field in REQUIRED_FIELDS else "recipient"
    message = request.message.strip()
    answers = infer_context(message, field, request.answers)
    missing_field = next((item for item in REQUIRED_FIELDS if not answers.get(item)), None)
    ready = missing_field is None
    retrieved = retrieve_gifts(answers) if ready else []
    ai_reply = None if request.quick_reply else await model_reply({"mode": "concierge", "field": field, "message": message, "answers": answers, "retrieved_products": retrieved}, max_tokens=60)
    if not request.quick_reply and os.getenv("CHARIS_LLM_URL") and not ai_reply:
        raise HTTPException(status_code=502, detail="The configured open-source model is unavailable.")
    if ready:
        reply = ai_reply.strip() if ai_reply and len(ai_reply.strip()) < 420 else f"I have a clear sense of {answers.get('recipient', 'them')} now. This is enough to create a small, meaningful edit for the {answers.get('occasion', 'occasion')}."
        return {"ready": True, "answers": answers, "reply": reply, "nextField": None, "suggestions": [], "source": "ai" if ai_reply else "fallback"}
    acknowledgement = ai_reply.strip() if ai_reply and len(ai_reply.strip()) < 220 else acknowledge(field, answers)
    reply = f"{acknowledgement} {next_question(missing_field, answers)}"
    return {"ready": False, "answers": answers, "reply": reply, "nextField": missing_field, "suggestions": SUGGESTIONS[missing_field], "source": "ai" if ai_reply else "fallback"}


@app.post("/api/recommendations")
def recommendations(request: ConsultationCreate) -> dict[str, Any]:
    return {"recommendations": retrieve_gifts(request.answers, limit=4), "retrieval": "cosine_keyword_vectors"}


async def concierge_events(request: ConciergeRequest):
    if not os.getenv("CHARIS_LLM_URL"):
        yield f"data: {json.dumps({'type': 'error', 'message': 'CHARIS_LLM_URL is not configured.'})}\n\n"
        return
    field = request.field
    message = request.message.strip()
    answers = {} if request.start else infer_context(message, field, request.answers)
    missing_field = next((item for item in REQUIRED_FIELDS if not answers.get(item)), None)
    ready = missing_field is None
    fallback = (
        f"I have a clear sense of {answers.get('recipient', 'them')} now. This is enough to create a small, meaningful edit for the {answers.get('occasion', 'occasion')}."
        if ready else "Hello. I'm glad you're here. Let's find something that feels unmistakably theirs. Who are we finding a gift for?" if request.start else f"{acknowledge(field, answers)} {next_question(missing_field, answers)}"
    )
    endpoint = os.getenv("CHARIS_LLM_URL", "").replace("://localhost:", "://127.0.0.1:")
    streamed = False
    if endpoint and not request.quick_reply:
        headers = {"Content-Type": "application/json"}
        if os.getenv("CHARIS_LLM_API_KEY"):
            headers["Authorization"] = f"Bearer {os.environ['CHARIS_LLM_API_KEY']}"
        payload = {
            "model": os.getenv("CHARIS_LLM_MODEL", "qwen2.5:3b"),
            "messages": [
                {"role": "system", "content": "You are CHARIS, an elegant luxury gifting concierge. Reply in no more than 18 words. Start with a warm welcome and do not ask a question; the server will append the exact question." if request.start else "You are CHARIS, an elegant luxury gifting concierge. Reply in no more than 18 words. Acknowledge the answer only. Do not ask a question or recommend a product; the server will append the exact next question."},
                {"role": "user", "content": json.dumps({"field": field, "message": message, "answers": answers})},
            ],
            "stream": True,
            "keep_alive": "10m",
            "options": {"num_predict": 60, "temperature": 0.55, "top_p": 0.9},
        }
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        raw_line = line[5:].strip() if line.startswith("data:") else line
                        if raw_line == "[DONE]":
                            continue
                        data = json.loads(raw_line)
                        token = data.get("message", {}).get("content", "") or data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if token:
                            streamed = True
                            yield f"data: {json.dumps({'type': 'token', 'value': token})}\n\n"
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError):
            streamed = False
    if endpoint and not request.quick_reply and not streamed:
        yield f"data: {json.dumps({'type': 'error', 'message': 'The configured open-source model is unavailable.'})}\n\n"
        return
    if not streamed:
        yield f"data: {json.dumps({'type': 'token', 'value': fallback})}\n\n"
    elif not ready:
        yield f"data: {json.dumps({'type': 'token', 'value': ' ' + next_question(missing_field, answers)})}\n\n"
    yield f"data: {json.dumps({'type': 'done', 'ready': ready, 'answers': answers, 'reply': fallback, 'nextField': missing_field, 'suggestions': [] if ready else SUGGESTIONS[missing_field], 'source': 'ai' if streamed else 'fallback'})}\n\n"


@app.post("/api/concierge/stream")
async def stream_concierge(request: ConciergeRequest):
    return StreamingResponse(concierge_events(request), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/gift-message")
async def gift_message(request: GiftMessageRequest) -> dict[str, str]:
    if not os.getenv("CHARIS_LLM_URL"):
        raise HTTPException(status_code=503, detail="CHARIS_LLM_URL is not configured.")
    if request.mode == "improve" and (not request.text or not request.text.strip()):
        raise HTTPException(status_code=400, detail="Write a few words first, and I will help you shape them.")
    if request.mode == "improve":
        prompt = f"Improve this gift message while preserving the sender's voice. Keep it warm, personal, concise, and never overly generic. Return ONLY the final message text. Do not add an introduction, explanation, label, quotation marks, or commentary.\n\n{request.text}"
    else:
        prompt = f"Write a warm, elegant gift message for {request.answers.get('recipient', 'someone special')}. The occasion is {request.answers.get('occasion', 'a meaningful moment')}. The gift is {request.gift.get('name', 'a thoughtful gift')}, symbolizing {request.gift.get('meaning', 'care and appreciation')}. Keep it under 80 words and do not use clichés. Return ONLY the final message text. Do not write 'Certainly', an introduction, an explanation, a label, quotation marks, or commentary."
    ai_message = await model_reply({"mode": "gift-message", "prompt": prompt}, max_tokens=160)
    if os.getenv("CHARIS_LLM_URL") and not ai_message:
        raise HTTPException(status_code=502, detail="The configured open-source model is unavailable.")
    fallback = f"{request.text.strip()}\n\nWith love, always." if request.mode == "improve" else f"For {request.answers.get('recipient', 'you')},\n\nOn {request.answers.get('occasion', 'this moment').lower()}, I wanted to give you something that felt as thoughtful and singular as you are. I hope {request.gift.get('name', 'this gift').lower()} reminds you that you are seen, appreciated, and deeply loved.\n\nWith all my love."
    message = clean_gift_message(ai_message) if ai_message else fallback
    return {"message": message, "source": "ai" if ai_message else "fallback"}
