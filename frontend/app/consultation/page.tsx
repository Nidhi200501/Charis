"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { accountStorageKey, getStoredUser } from "../../lib/storage";

type Message = { role: "assistant" | "user"; text: string };
type ConciergeResponse = { ready: boolean; reply: string; answers: Record<string, string>; nextField: string | null; suggestions: string[] };
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function streamConcierge(body: object, onToken: (token: string) => void): Promise<ConciergeResponse> {
  const response = await fetch(`${API_URL}/api/concierge/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok || !response.body) throw new Error("Concierge unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let result: ConciergeResponse | null = null;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6)) as { type: "token" | "done" | "error"; value?: string; message?: string } & Partial<ConciergeResponse>;
      if (event.type === "error") throw new Error(event.message || "The concierge is unavailable.");
      if (event.type === "token" && event.value) {
        streamedText += event.value;
        onToken(event.value);
      }
      if (event.type === "done") result = event as unknown as ConciergeResponse;
    }
  }
  if (!result) throw new Error("Concierge stream ended unexpectedly");
  return { ...result, reply: result.reply };
}

const questions = [
  { key: "recipient", label: "The person", prompt: "Let's start with them. Who are we finding a gift for?", options: ["My partner", "A close friend", "A parent", "A colleague"] },
  { key: "relationship", label: "Your relationship", prompt: "Beautiful. And how would you describe your relationship with them?", options: ["They know me best", "We're growing closer", "They've always been there", "A new beginning"] },
  { key: "occasion", label: "The occasion", prompt: "What is bringing you to this moment of giving?", options: ["Birthday", "Anniversary", "A thank you", "Just because"] },
  { key: "budget", label: "Your budget", prompt: "How much would you like to spend on something considered?", options: ["Under $100", "$100 – $250", "$250 – $500", "$500 and beyond"] },
  { key: "personality", label: "Their personality", prompt: "If you had to capture their energy, which feels closest?", options: ["Quietly refined", "Curious and playful", "Warm and sentimental", "Bold and expressive"] },
  { key: "interests", label: "Their world", prompt: "What do they naturally make time for? Tell me a little about their world.", options: ["Art and design", "Travel and discovery", "Wellness and ritual", "Food and entertaining"] },
  { key: "impact", label: "The feeling", prompt: "Finally, what would you love the gift to say without saying a word?", options: ["I see you", "I&apos;m grateful", "You deserve something beautiful", "I&apos;ll always be here"] },
];

export default function ConsultationPage() {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "Hello. I'm glad you're here. Let's find something that feels unmistakably theirs." }]);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState(questions[0].options);
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const finished = step >= questions.length;
  const question = questions[step];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  useEffect(() => {
    let cancelled = false;
    setIsThinking(true);
    setMessages([{ role: "assistant", text: "" }]);
    streamConcierge({ field: "recipient", message: "Begin this consultation with a warm welcome.", answers: {}, quick_reply: false, start: true }, (token) => {
      if (cancelled) return;
      setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, text: `${item.text}${token}` } : item));
    }).then((result) => {
      if (cancelled) return;
      setSuggestions(result.suggestions || questions[0].options);
      setStep(0);
    }).catch(() => {
      if (!cancelled) setMessages([{ role: "assistant", text: "I couldn't reach your AI concierge. Please check that Ollama is running, then refresh and try again." }]);
    }).finally(() => {
      if (!cancelled) setIsThinking(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function submitAnswer(event?: FormEvent<HTMLFormElement>, selectedAnswer?: string) {
    event?.preventDefault();
    const value = (selectedAnswer || answer).trim();
    if (!value || !question || isThinking) return;
    const nextStep = step + 1;
    const nextAnswers = { ...answers, [question.key]: value };
    setAnswers(nextAnswers);
    setMessages((current) => [...current, { role: "user", text: value }]);
    setMessages((current) => [...current, { role: "assistant", text: "" }]);
    setAnswer("");
    setIsThinking(true);
    try {
      let streamedText = "";
      const result = await streamConcierge({ field: question.key, message: value, answers: nextAnswers, quick_reply: false, start: false }, (token) => {
        streamedText += token;
        setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, text: streamedText } : item));
      });
      setAnswers(result.answers);
      const nextPrompt = result.nextField ? questions.find((item) => item.key === result.nextField)?.prompt : "";
      const conciergeReply = !result.ready && result.reply.length > 240 ? `I have noted that beautifully. ${nextPrompt}` : result.reply;
      setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, text: conciergeReply } : item));
      setSuggestions(result.suggestions || []);
      const nextIndex = result.ready ? questions.length : questions.findIndex((item) => item.key === result.nextField);
      setStep(nextIndex >= 0 ? nextIndex : nextStep);
      if (result.ready) void saveConsultation(result.answers, [...messages, { role: "user", text: value }, { role: "assistant", text: conciergeReply }]);
    } catch {
      const errorMessage = "I couldn't reach your AI concierge. Please check that Ollama is running, then try again.";
      setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, text: errorMessage } : item));
      setSuggestions([]);
      setStep(step);
    } finally {
      setIsThinking(false);
    }
  }

  async function saveConsultation(finalAnswers: Record<string, string>, conversation: Message[]) {
    const savedConsultations = JSON.parse(window.localStorage.getItem(accountStorageKey("consultations")) || "[]");
    const consultation = {
      id: Date.now(),
      date: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date()),
      recipient: finalAnswers.recipient || "A thoughtful someone",
      detail: `${finalAnswers.occasion || "A meaningful moment"} · ${finalAnswers.relationship || "A special relationship"}`,
      status: "Recommendations ready",
      answers: finalAnswers,
    };
    window.localStorage.setItem(accountStorageKey("consultations"), JSON.stringify([consultation, ...savedConsultations]));
    window.localStorage.setItem(accountStorageKey("latest_consultation"), JSON.stringify(consultation));
    const savedUser = getStoredUser();
    if (savedUser?.id) {
      try {
        await fetch(`${API_URL}/api/consultations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: savedUser.id, answers: finalAnswers, conversation, status: "recommendations_ready" }) });
      } catch {
        // Keep the local copy when the database is temporarily unavailable.
      }
    }
  }

  return (
    <main className="consultation-page">
      <nav className="consultation-nav"><a className="wordmark" href="/">CHARIS<span>.</span></a><a className="consultation-exit" href="/dashboard">Save and exit <span>×</span></a></nav>
      <div className="consultation-layout">
        <aside className="consultation-aside"><p className="eyebrow">Your private curation</p><h1>Let&apos;s find<br /><em>the feeling.</em></h1><p>A few thoughtful questions. One gift that feels like it could only belong to them.</p><div className="consultation-progress"><div><span>CURATION</span><strong>{String(Math.min(step + 1, questions.length)).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}</strong></div><i><b style={{ width: `${Math.min((step / questions.length) * 100, 100)}%` }} /></i></div><div className="consultation-mark">✦</div></aside>
        <section className="chat-panel" aria-label="Gift consultation chat"><div className="chat-messages">{messages.map((message, index) => { const activeTyping = isThinking && index === messages.length - 1 && message.role === "assistant" && !message.text; return <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="message-avatar">{message.role === "assistant" ? "C" : "You"}</span><p className={activeTyping ? "typing-dots" : ""}>{activeTyping ? <><i /><i /><i /></> : message.text}</p></div>; })}{!finished && !isThinking && <div className="chat-question"><p className="chat-label">{question.label}</p><div className="quick-replies">{suggestions.map((option) => <button type="button" key={option} onClick={() => submitAnswer(undefined, option)}>{option}</button>)}</div><form className="chat-input" onSubmit={submitAnswer}><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Or tell me in your own words..." aria-label={question.label} /><button type="submit" aria-label="Send answer">↗</button></form></div>}{finished && <div className="consultation-complete"><span>✦</span><p className="eyebrow">The picture is coming together</p><h2>Your edit is<br /><em>ready to begin.</em></h2><p>We&apos;ll use what you shared to find gifts with meaning, not just a price tag.</p><a className="button button-dark" href="/recommendations">See my recommendations <span>↗</span></a></div>}<div ref={bottomRef} /></div></section>
      </div>
    </main>
  );
}
