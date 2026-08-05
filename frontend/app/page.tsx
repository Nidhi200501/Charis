"use client";

import { useEffect, useState, type CSSProperties } from "react";

const steps = [
  { number: "01", title: "Tell us about them", text: "A few thoughtful questions help us understand the person behind the occasion." },
  { number: "02", title: "Let us curate", text: "Our concierge connects the details to a considered edit of meaningful pieces." },
  { number: "03", title: "Give beautifully", text: "Choose your gift, add a personal note, and make the moment unforgettable." },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<{ name?: string; email: string } | null>(null);

  useEffect(() => {
    window.localStorage.removeItem("charis_accounts");
    const savedUser = window.localStorage.getItem("charis_user");
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  function signOut() {
    window.localStorage.removeItem("charis_user");
    setUser(null);
    setMenuOpen(false);
  }

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>(".reveal");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.14 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <nav className="nav-shell" aria-label="Main navigation">
        <a className="wordmark" href="#top" aria-label="CHARIS home">CHARIS<span>.</span></a>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Toggle navigation">
          <span /><span />
        </button>
        <div className={`nav-links ${menuOpen ? "is-open" : ""}`}>
          <a href="#about" onClick={() => setMenuOpen(false)}>Our philosophy</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          {user ? <><span className="nav-user">Hi, {user.name || user.email.split("@")[0]}</span><button className="nav-login nav-signout" onClick={signOut}>Sign out</button></> : <a className="nav-login" href="/auth" onClick={() => setMenuOpen(false)}>Sign in <span>↗</span></a>}
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy fade-up">
          <p className="eyebrow">The personal gifting concierge</p>
          <h1>Give a gift<br /><em>that lingers.</em></h1>
          <p className="hero-intro">The right gift says what words sometimes cannot. CHARIS helps you find the one that feels unmistakably theirs.</p>
          <a className="button button-light" href={user ? "/dashboard" : "/auth"}>Find their gift <span>↗</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="halo" />
          <div className="hero-orb orb-one" />
          <div className="hero-orb orb-two" />
          <div className="gift-card">
            <div className="gift-card-top"><span>CHARIS</span><span>01 / 24</span></div>
            <div className="gift-card-image"><img src="https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=700&q=85" alt="Gold jewelry selected for a meaningful gift" /></div>
            <p>For the ones who<br /><i>make life beautiful.</i></p>
          </div>
          <div className="vertical-note">A considered edit <span>✦</span> just for them</div>
        </div>
        <div className="hero-scroll"><span>Scroll to explore</span><i /></div>
      </section>

      <div className="motion-ticker" aria-label="CHARIS gifting philosophy">
        <div className="ticker-track"><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i><span>Made for their story</span><i>✦</i><span>Curated with intention</span><i>✦</i><span>Given with feeling</span><i>✦</i><span>Made for their story</span><i>✦</i></div>
      </div>

      <section className="intro-section reveal" id="about">
        <p className="eyebrow wine-text">A little more thought</p>
        <div className="intro-grid">
          <h2>Because the most<br /><em>beautiful gifts</em><br />are personal.</h2>
          <div className="intro-body">
            <p>We believe gifting is an art form. Not a race to the checkout, but a quiet moment of consideration — a way to show someone you truly see them.</p>
            <p>CHARIS brings a little more meaning to the ritual. Tell us who they are, and we&apos;ll help you discover what to give.</p>
            <a className="text-link" href="#how-it-works">Discover our philosophy <span>↗</span></a>
          </div>
        </div>
      </section>

      <section className="feature-section reveal">
        <div className="feature-image"><img src="https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1200&q=85" alt="A gold necklace resting in an open jewelry box" /><span>THE ART OF GIVING WELL</span></div>
        <div className="feature-copy"><p className="eyebrow">Not just another gift guide</p><h2>Thoughtful,<br /><em>by design.</em></h2><p>Every recommendation is guided by intention — their story, your relationship, and the feeling you want to leave behind.</p><a className="button button-outline" href="#how-it-works">See our approach <span>↗</span></a><div className="quote-mark">“</div></div>
      </section>

      <section className="steps-section reveal" id="how-it-works">
        <div className="section-heading"><p className="eyebrow wine-text">The CHARIS way</p><h2>Meaningful gifts,<br /><em>made simple.</em></h2></div>
        <div className="steps-grid">{steps.map((step, index) => <article className="step" style={{ "--step-delay": `${index * 120}ms` } as CSSProperties} key={step.number}><span className="step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.text}</p><a href="#start" aria-label={`Start step ${step.number}`}>Explore <span>↗</span></a></div></article>)}</div>
      </section>

      <section className="cta-section reveal" id="start">
        <div className="cta-sparkle">✦</div><p className="eyebrow">Your next meaningful gift</p><h2>Start with<br /><em>who they are.</em></h2><p>It only takes a few minutes to find something that feels just right.</p><a className="button button-dark" href={user ? "/dashboard" : "/auth"}>Begin your curation <span>↗</span></a>
      </section>

      <footer><a className="wordmark" href="#top">CHARIS<span>.</span></a><p>For moments that matter.</p><span>© 2026 CHARIS</span></footer>
    </main>
  );
}
