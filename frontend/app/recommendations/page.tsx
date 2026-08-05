"use client";

import { useEffect, useState } from "react";
import { gifts } from "../../lib/gifts";
import { accountStorageKey, getStoredUser } from "../../lib/storage";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RecommendationsPage() {
  const [recipient, setRecipient] = useState("them");
  const [occasion, setOccasion] = useState("this moment");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [recommendationGifts, setRecommendationGifts] = useState(gifts);

  useEffect(() => {
    const saved = window.localStorage.getItem(accountStorageKey("latest_consultation"));
    if (saved) {
      const consultation = JSON.parse(saved);
      setRecipient(consultation.recipient || "them");
      setOccasion(consultation.answers?.occasion || "this moment");
    }
    const user = getStoredUser();
    if (user?.id) {
      fetch(`${API_URL}/api/consultations/${user.id}/latest`).then((response) => response.ok ? response.json() : null).then((consultation) => {
        if (!consultation) return;
        setRecipient(consultation.answers?.recipient || "them");
        setOccasion(consultation.answers?.occasion || "this moment");
        window.localStorage.setItem(accountStorageKey("latest_consultation"), JSON.stringify({ ...consultation, recipient: consultation.answers?.recipient }));
        return fetch(`${API_URL}/api/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, answers: consultation.answers, conversation: [], status: "recommendations_ready" }) });
      }).then((response) => response && response.ok ? response.json() : null).then((retrieved) => {
        if (!retrieved?.recommendations) return;
        const ordered = retrieved.recommendations.map((item: { id: string; reason: string; meaning: string }) => {
          const base = gifts.find((gift) => gift.id === item.id);
          return base ? { ...base, reason: item.reason, meaning: item.meaning } : null;
        }).filter(Boolean);
        if (ordered.length) setRecommendationGifts(ordered as typeof gifts);
      }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 500);
    return () => window.clearTimeout(timer);
  }, []);

  async function chooseGift(giftId: string) {
    setSelected(giftId);
    window.localStorage.setItem(accountStorageKey("selected_gift"), giftId);
    const user = getStoredUser();
    if (!user?.id) return;
    try {
      await fetch(`${API_URL}/api/saved-gifts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, gift_id: giftId }) });
    } catch {
      // Keep the local selection when the database is temporarily unavailable.
    }
  }

  const visibleGifts = recommendationGifts.filter((gift) => `${gift.name} ${gift.category} ${gift.reason} ${gift.meaning}`.toLowerCase().includes(query.toLowerCase().trim()));

  return (
    <main className="recommendations-page">
      <nav className="recommendations-nav"><a className="wordmark" href="/dashboard">CHARIS<span>.</span></a><a className="consultation-exit" href="/dashboard">Back to your edit <span>↗</span></a></nav>
      <div className="motion-ticker" aria-label="CHARIS gifting philosophy"><div className="ticker-track"><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i><span>Made for their story</span><i>✦</i><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i></div></div>
      <header className="recommendations-header"><p className="eyebrow wine-text">Your considered edit</p><h1>For {recipient},<br /><em>with feeling.</em></h1><p>Four pieces chosen for {occasion}. Each one says something worth remembering.</p><div className="recommendation-count">{String(visibleGifts.length).padStart(2, "0")} <span>CURATED POSSIBILITIES</span></div><div className="search-wrap"><p className="search-kicker">Search the collection</p><label className="gift-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try 'ritual', 'jewellery'..." aria-label="Search gift recommendations" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label></div></header>
      {isLoading ? <section className="gift-grid" aria-label="Loading gift recommendations" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <article className="gift-skeleton" key={index}><div className="skeleton-image" /><div className="skeleton-copy"><i /><b /><span /><span /><em /></div></article>)}</section> : visibleGifts.length > 0 ? <section className="gift-grid" aria-label="Gift recommendations">{visibleGifts.map((gift, index) => <article className={`gift-recommendation ${selected === gift.id ? "is-selected" : ""}`} key={gift.id}><div className="gift-recommendation-image"><img src={gift.image} alt={gift.name} /><span>0{index + 1}</span></div><div className="gift-recommendation-content"><p className="eyebrow wine-text">{gift.category}</p><div className="gift-title-row"><h2>{gift.name}</h2><strong>{gift.price}</strong></div><p className="gift-reason">{gift.reason}</p><div className="gift-meaning"><span>THE EMOTIONAL MEANING</span><p>{gift.meaning}</p></div><button className="gift-cta" onClick={() => void chooseGift(gift.id)}>{selected === gift.id ? "Added to cart" : "Add to your cart"}<span>{selected === gift.id ? "✓" : "↗"}</span></button><a className="gift-details-link" href={`/product/${gift.id}`}>Read the full story <span>↗</span></a></div></article>)}</section> : <div className="no-gifts"><span>✦</span><h2>No gifts found.</h2><p>Try searching for a feeling, ritual, or material.</p></div>}
      {selected && <div className="selection-note" role="status">{gifts.find((gift) => gift.id === selected)?.name} has been added to your cart. <a href="/dashboard">Return to dashboard ↗</a></div>}
    </main>
  );
}
