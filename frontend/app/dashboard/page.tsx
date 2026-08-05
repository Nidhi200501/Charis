"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { accountStorageKey } from "../../lib/storage";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const seedConsultations = [
  { date: "12 May 2026", recipient: "A birthday for Mira", detail: "A collector of small beautiful things", status: "Recommendations ready" },
  { date: "28 April 2026", recipient: "An anniversary for Daniel", detail: "Something lasting, quietly personal", status: "Saved for later" },
];

const savedGifts = [
  { name: "The Pearl Strand", type: "Jewellery", price: "$280", image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=700&q=85" },
  { name: "Santal 33 Candle", type: "Home ritual", price: "$95", image: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=700&q=85" },
  { name: "The Linen Journal", type: "Keepsake", price: "$68", image: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=700&q=85" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id?: number; name?: string; email: string } | null>(null);
  const [consultations, setConsultations] = useState(seedConsultations);

  useEffect(() => {
    const savedUser = window.localStorage.getItem("charis_user");
    if (!savedUser) {
      router.replace("/auth");
      return;
    }
    const savedUserData = JSON.parse(savedUser) as { id?: number; name?: string; email: string };
    setUser(savedUserData);
    const savedConsultations = window.localStorage.getItem(accountStorageKey("consultations"));
    if (savedConsultations) setConsultations([...JSON.parse(savedConsultations), ...seedConsultations]);
    if (savedUserData.id) {
      fetch(`${API_URL}/api/consultations/${savedUserData.id}`).then((response) => response.ok ? response.json() : []).then((rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        setConsultations([...rows.map((row: { id: number; answers: Record<string, string>; status: string; created_at: string }) => ({ date: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(row.created_at)), recipient: row.answers.recipient || "A thoughtful someone", detail: `${row.answers.occasion || "A meaningful moment"} · ${row.answers.relationship || "A special relationship"}`, status: row.status === "recommendations_ready" ? "Recommendations ready" : row.status })), ...seedConsultations]);
      }).catch(() => undefined);
    }
  }, [router]);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".dashboard-reveal");
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  function signOut() {
    window.localStorage.removeItem("charis_user");
    router.push("/");
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav"><a className="wordmark" href="/">CHARIS<span>.</span></a><div><span className="dashboard-email">{user?.email}</span><button className="dashboard-signout" onClick={signOut}>Sign out</button></div></nav>
      <div className="motion-ticker" aria-label="CHARIS gifting philosophy"><div className="ticker-track"><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i><span>Made for their story</span><i>✦</i><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i><span>Made for their story</span><i>✦</i></div></div>

      <section className="dashboard-welcome" id="new-gift">
        <div><p className="eyebrow wine-text">Your private edit</p><h1>{user?.name ? <>Welcome back,<br /><em>{user.name}.</em></> : <>Welcome to your<br /><em>thoughtful beginning.</em></>}</h1><p>Start a new curation or revisit the moments you&apos;ve already made meaningful.</p><a className="button button-light" href="/consultation">Start a new gift <span>↗</span></a></div>
        <div className="dashboard-visual"><img src="https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=800&q=85" alt="A luxury perfume bottle waiting to be gifted" /><div className="dashboard-stamp" aria-hidden="true"><span>CHARIS</span><b>✦</b><small>GIVING, CONSIDERED</small></div><span className="dashboard-visual-label">A considered edit / 2026</span></div>
      </section>

      <section className="dashboard-overview dashboard-reveal" aria-label="Your CHARIS overview"><div><strong>02</strong><span>Previous<br />consultations</span></div><div><strong>03</strong><span>Saved<br />gifts</span></div><div><strong>∞</strong><span>Moments<br />made meaningful</span></div><p>Thoughtfulness<br /><em>looks good on you.</em></p></section>

      <section className="dashboard-section dashboard-reveal" aria-labelledby="consultations-title"><div className="dashboard-section-heading"><div><p className="eyebrow wine-text">Your journey so far</p><h2 id="consultations-title">Previous<br /><em>consultations.</em></h2></div><a className="text-link" href="/history">View history <span>↗</span></a></div><div className="consultation-list">{consultations.map((consultation, index) => <article className="consultation-row" key={`${consultation.recipient}-${consultation.date}-${index}`}><span className="consultation-date">{consultation.date}</span><div><h3>{consultation.recipient}</h3><p>{consultation.detail}</p></div><a className="consultation-status consultation-link" href="/recommendations">{consultation.status} <b>↗</b></a></article>)}</div></section>

      <section className="dashboard-section saved-section dashboard-reveal" aria-labelledby="saved-title"><div className="dashboard-section-heading"><div><p className="eyebrow wine-text">Your considered edit</p><h2 id="saved-title">Saved<br /><em>gifts.</em></h2></div><a className="text-link" href="#saved-title">Explore the collection <span>↗</span></a></div><div className="saved-grid">{savedGifts.map((gift) => <article className="saved-card" key={gift.name}><div className="saved-card-image"><img src={gift.image} alt={gift.name} /></div><div className="saved-card-info"><div><p>{gift.type}</p><h3>{gift.name}</h3></div><strong>{gift.price}</strong></div></article>)}</div></section>

      <section className="dashboard-philosophy dashboard-reveal"><div><p className="eyebrow">A note from CHARIS</p><h2>The best gifts<br /><em>feel inevitable.</em></h2></div><div className="dashboard-philosophy-copy"><span>CHARIS / 01</span><p>Not because they were obvious, but because they carry a little piece of the person who gives them. Keep looking for that feeling.</p><a className="button button-light" href="/consultation">Start a new curation <span>↗</span></a></div></section>

      <footer className="dashboard-footer"><a className="wordmark" href="/">CHARIS<span>.</span></a><p>Gifts with a point of view.</p><span>© 2026 CHARIS</span></footer>
    </main>
  );
}
