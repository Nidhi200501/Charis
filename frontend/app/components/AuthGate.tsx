"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const privateRoutes = ["/dashboard", "/consultation", "/recommendations", "/product", "/gift-message", "/history"];

export default function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const isPrivateRoute = privateRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    setAuthenticated(Boolean(window.localStorage.getItem("charis_user")));
    setChecked(true);
  }, [pathname]);

  const showLoginGate = checked && isPrivateRoute && !authenticated;

  return <>{children}{showLoginGate && <div className="auth-gate" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title"><div className="auth-gate-card"><span className="auth-gate-mark">✦</span><p className="eyebrow wine-text">A private CHARIS space</p><h1 id="auth-gate-title">Sign in to<br /><em>continue.</em></h1><p>Your thoughtful edit, consultations, and saved gifts are waiting for you.</p><button className="button button-dark" onClick={() => router.push("/auth")}>Sign in or create account <span>↗</span></button></div></div>}</>;
}
