"use client";

import { FormEvent, useEffect, useState } from "react";
import { gifts } from "../../lib/gifts";
import { accountStorageKey, getStoredUser } from "../../lib/storage";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function GiftMessagePage() {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"manual" | "improve" | "generate">("manual");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [context, setContext] = useState<{ gift: typeof gifts[number]; answers: Record<string, string> } | null>(null);

  useEffect(() => {
    async function loadMessageContext() {
      const user = getStoredUser();
      const savedConsultation = JSON.parse(window.localStorage.getItem(accountStorageKey("latest_consultation")) || "null");
      const requestedGiftId = new URLSearchParams(window.location.search).get("gift");
      let selectedGiftId = requestedGiftId || window.localStorage.getItem(accountStorageKey("selected_gift")) || "";
      let latestConsultation = savedConsultation;
      let savedMessage = window.localStorage.getItem(accountStorageKey("gift_message")) || "";
      if (user?.id) {
        try {
          const [consultationResponse, giftsResponse, messagesResponse] = await Promise.all([fetch(`${API_URL}/api/consultations/${user.id}/latest`), fetch(`${API_URL}/api/saved-gifts/${user.id}`), fetch(`${API_URL}/api/gift-messages/${user.id}`)]);
          if (consultationResponse.ok) latestConsultation = await consultationResponse.json();
          if (!selectedGiftId && giftsResponse.ok) selectedGiftId = (await giftsResponse.json())[0]?.gift_id || "";
          if (messagesResponse.ok) savedMessage = (await messagesResponse.json())[0]?.body || savedMessage;
        } catch {
          // Use the account-scoped local fallback if the API is temporarily unavailable.
        }
      }
      const selectedGift = gifts.find((gift) => gift.id === selectedGiftId) || gifts[0];
      if (selectedGiftId) window.localStorage.setItem(accountStorageKey("selected_gift"), selectedGift.id);
      setContext({ gift: selectedGift, answers: latestConsultation?.answers || {} });
      setMessage(savedMessage);
      setIsSaved(Boolean(savedMessage));
    }
    void loadMessageContext();
  }, []);

  async function generateMessage(event?: FormEvent<HTMLFormElement>, requestedMode: "improve" | "generate" = mode === "improve" ? "improve" : "generate") {
    event?.preventDefault();
    if (requestedMode === "improve" && !message.trim()) {
      setNotice("Write a few words first, and I will help you shape them.");
      return;
    }
    setNotice("");
    setMode(requestedMode);
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/gift-message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: requestedMode, text: message, gift: context ? { id: context.gift.id, name: context.gift.name, meaning: context.gift.meaning, category: context.gift.category, price: context.gift.price } : {}, answers: context?.answers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create message");
      setMessage(data.message);
      setIsSaved(true);
    window.localStorage.setItem(accountStorageKey("gift_message"), data.message);
      void saveMessageToDatabase(data.message, data.source);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function saveManualMessage() {
    window.localStorage.setItem(accountStorageKey("gift_message"), message);
    setIsSaved(true);
    void saveMessageToDatabase(message, "manual");
    setNotice("Your message has been saved to your edit.");
  }

  async function saveMessageToDatabase(body: string, source: string) {
    const user = JSON.parse(window.localStorage.getItem("charis_user") || "null") as { id?: number } | null;
    if (!user?.id || !body.trim()) return;
    try {
      await fetch(`${API_URL}/api/gift-messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, gift_id: context?.gift.id, body, source }) });
    } catch {
      // Keep the local message when the database is temporarily unavailable.
    }
  }

  return (
    <main className="message-page">
      <nav className="message-nav"><a className="wordmark" href="/dashboard">CHARIS<span>.</span></a><a className="consultation-exit" href="/recommendations">Back to your gift <span>↗</span></a></nav>
      <div className="message-layout"><aside className="message-aside"><p className="eyebrow">The final touch</p><h1>Say it<br /><em>beautifully.</em></h1><p>A few honest words can turn a considered gift into a moment they keep.</p><div className="message-aside-mark">✦</div></aside><section className="message-studio"><p className="eyebrow wine-text">Your gift message</p><h2>Make it<br /><em>personal.</em></h2>{context && <div className="message-gift-context"><img src={context.gift.image} alt={context.gift.name} /><div><span>FOR {context.answers.recipient || "THEM"}</span><strong>{context.gift.name}</strong><small>{context.gift.price}</small></div></div>}<div className="message-mode-tabs"><button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Write manually</button><button onClick={() => generateMessage(undefined, "improve")}>Improve with AI</button><button onClick={() => generateMessage(undefined, "generate")}>Generate with AI</button></div><form className="message-form" onSubmit={(event) => { event.preventDefault(); saveManualMessage(); }}><textarea value={message} onChange={(event) => { setMessage(event.target.value); setIsSaved(false); setMode("manual"); }} placeholder="Dear..." aria-label="Gift message" /><div className="message-form-footer"><span>{isSaved ? "SAVED LOCALLY" : `${message.length} / 500`}</span><button type="submit">{isSaved ? "Message saved" : "Save message"} <span>{isSaved ? "✓" : "↗"}</span></button></div></form>{notice && <p className="message-notice" role="status">{isLoading ? "Your concierge is writing..." : notice}</p>}<div className="message-actions"><button className="message-ai-button" onClick={() => generateMessage(undefined, "improve")} disabled={isLoading}>{isLoading && mode === "improve" ? "Improving..." : "Improve my words"}</button><button className="message-ai-button filled" onClick={() => generateMessage(undefined, "generate")} disabled={isLoading}>{isLoading && mode === "generate" ? "Writing..." : "Generate a message"}</button></div></section></div>
    </main>
  );
}
