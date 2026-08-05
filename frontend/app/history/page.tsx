"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "../../lib/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type Conversation = { role: "assistant" | "user"; text: string };
type HistoryItem = { id: number; answers: Record<string, string>; conversation: Conversation[]; status: string; created_at: string };

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getStoredUser();
    if (!user?.id) {
      router.replace("/auth");
      return;
    }
    fetch(`${API_URL}/api/consultations/${user.id}/history`).then((response) => response.ok ? response.json() : []).then((data) => setItems(Array.isArray(data) ? data : [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="history-page"><nav className="history-nav"><a className="wordmark" href="/dashboard">CHARIS<span>.</span></a><a className="consultation-exit" href="/dashboard">Back to dashboard <span>↗</span></a></nav><header className="history-header"><p className="eyebrow wine-text">A record of your thoughtfulness</p><h1>Conversation<br /><em>history.</em></h1><p>Every detail you shared, kept close for the next meaningful moment.</p></header><section className="history-list" aria-label="Consultation history">{loading ? <div className="history-loading">Loading your conversations...</div> : items.length === 0 ? <div className="history-empty"><span>✦</span><h2>Your story starts here.</h2><a className="button button-dark" href="/consultation">Start a consultation <span>↗</span></a></div> : items.map((item) => <article className="history-card" key={item.id}><div className="history-card-meta"><span>{new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.created_at))}</span><small>{item.status.replaceAll("_", " ")}</small></div><div className="history-card-heading"><h2>For {item.answers.recipient || "someone special"}</h2><p>{item.answers.occasion || "A meaningful moment"} · {item.answers.relationship || "A close relationship"}</p></div><div className="history-answers">{Object.entries(item.answers).map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><p>{value}</p></div>)}</div>{item.conversation.length > 0 ? <div className="history-conversation">{item.conversation.map((message, index) => <div className={`history-message ${message.role}`} key={`${item.id}-${index}`}><span>{message.role === "assistant" ? "C" : "You"}</span><p>{message.text}</p></div>)}</div> : <div className="history-no-transcript">This consultation was saved before conversation transcripts were enabled. Your answers are safely preserved above.</div>}</article>)}</section></main>
  );
}
