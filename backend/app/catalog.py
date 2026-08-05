import math
import re
from collections import Counter
from typing import Any


CATALOG: list[dict[str, Any]] = [
    {
        "id": "pearl-strand", "name": "The Pearl Strand", "category": "A quiet classic", "price": "$280",
        "image": "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=85",
        "meaning": "A reminder that the most enduring things do not need to ask for attention.",
        "reason": "A luminous piece with enough restraint for every day, chosen for someone whose presence already says a lot.",
        "tags": "jewellery pearl refined classic sentimental parent partner anniversary elegant timeless",
    },
    {
        "id": "santal-candle", "name": "Santal 33 Candle", "category": "For their ritual", "price": "$95",
        "image": "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85",
        "meaning": "A little permission to pause, exhale, and make an ordinary evening feel intentional.",
        "reason": "A warm, tactile ritual for the person who finds beauty in slow mornings and the details of home.",
        "tags": "home candle ritual wellness refined quiet friend parent thank you just because warm",
    },
    {
        "id": "linen-journal", "name": "The Linen Journal", "category": "For their ideas", "price": "$68",
        "image": "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=900&q=85",
        "meaning": "A place for what they have not said yet, and for the future they are quietly making.",
        "reason": "Thoughtfully made space for the ideas, lists, sketches, and observations that make their world distinct.",
        "tags": "journal notebook ideas art design curious playful colleague friend graduation creative",
    },
    {
        "id": "travel-case", "name": "The Weekender Case", "category": "For the curious", "price": "$320",
        "image": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
        "meaning": "An invitation to keep choosing the next chapter, wherever it leads.",
        "reason": "A beautifully considered companion for someone always carrying a story toward somewhere new.",
        "tags": "travel discovery leather bold expressive partner friend colleague birthday adventure",
    },
]


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.lower())


def _cosine(left: Counter[str], right: Counter[str]) -> float:
    shared = set(left) & set(right)
    numerator = sum(left[token] * right[token] for token in shared)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    return numerator / (left_norm * right_norm) if left_norm and right_norm else 0


def retrieve_gifts(answers: dict[str, str], limit: int = 4) -> list[dict[str, Any]]:
    query = " ".join(answers.values())
    query_vector = Counter(_tokens(query))
    scored = []
    for gift in CATALOG:
        document = f"{gift['name']} {gift['category']} {gift['meaning']} {gift['reason']} {gift['tags']}"
        score = _cosine(query_vector, Counter(_tokens(document)))
        scored.append((score, gift))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [{**gift, "retrieval_score": round(score, 4)} for score, gift in scored[:limit]]
