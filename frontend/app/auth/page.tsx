"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem("charis_accounts");
    if (window.localStorage.getItem("charis_user")) router.replace("/dashboard");
  }, [router]);

  function completeSignIn(user: { email: string; name?: string; provider: string; id?: string }) {
    window.localStorage.setItem("charis_user", JSON.stringify({ ...user, signedInAt: new Date().toISOString() }));
    router.push("/dashboard");
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (mode === "signup" && !name.trim()) {
      setError("Enter your name to create an account.");
      return;
    }
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Your password must be at least 6 characters.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode === "signup" ? "signup" : "signin"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(mode === "signup" ? { name: name.trim() } : {}), email: normalizedEmail, password, provider: "email" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to authenticate.");
      completeSignIn(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the CHARIS server.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Google guest", email: "you@charis.example", provider: "google" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to authenticate with Google.");
      completeSignIn(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the CHARIS server.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <a className="auth-back" href="/">← Back to CHARIS</a>
      <div className="auth-panel auth-panel-copy">
        <p className="eyebrow">The personal gifting concierge</p>
        <h1>Good gifts<br /><em>begin with knowing.</em></h1>
        <p>Save your thoughtful discoveries and return to your curation whenever inspiration finds you.</p>
        <div className="auth-orbit" aria-hidden="true"><span>✦</span></div>
      </div>
      <section className="auth-panel auth-form-panel" aria-labelledby="auth-title">
        <div className="auth-brand">CHARIS<span>.</span></div>
        <p className="eyebrow">Welcome in</p>
        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode"><button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); }} role="tab" aria-selected={mode === "signin"}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }} role="tab" aria-selected={mode === "signup"}>Create account</button></div>
        <h2 id="auth-title">{mode === "signin" ? <>Your considered<br /><em>gift edit awaits.</em></> : <>Make gifting<br /><em>more personal.</em></>}</h2>
        <form onSubmit={handleEmailSignIn} noValidate>
          {mode === "signup" && <><label htmlFor="name">Your name</label><input id="name" name="name" type="text" autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} /></>}
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={error ? "auth-error" : undefined} />
          <label className="password-label" htmlFor="password">Password</label>
          <div className="password-field"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="At least 6 characters" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
          {error && <p className="auth-error" id="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={isLoading}>{isLoading ? "Opening your edit..." : mode === "signin" ? "Sign in with email" : "Create my account"}<span>↗</span></button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="google-button" type="button" onClick={handleGoogleSignIn} disabled={isLoading}><b>G</b> Continue with Google</button>
        <p className="auth-note">Your account is stored in CHARIS PostgreSQL. This prototype keeps the session in your browser.</p>
      </section>
    </main>
  );
}
