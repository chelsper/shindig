"use client";
import Image from "next/image";
import { useState } from "react";

export function HostAccountButton({ signOut = false }: { signOut?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/auth/${signOut ? "sign-out" : "sign-in/social"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signOut ? {} : { provider: "google" }),
      });
      if (!response.ok) throw new Error("unavailable");
      // Full navigation discards the private client-router cache on logout.
      if (signOut) { window.location.assign(new URL("/host/sign-in", window.location.origin).href); return; }
      const result = await response.json();
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" || url.username || url.password) throw new Error("invalid response");
      window.location.assign(url.href);
    } catch { setError(signOut ? "We couldn’t sign you out. Please try again." : "We couldn’t start sign-in. Please try again."); setPending(false); }
  }
  return <div>
    <button type="button" onClick={submit} disabled={pending} aria-busy={pending} className={signOut ? "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4 disabled:opacity-50" : "mx-auto mt-7 block min-h-12 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e] disabled:opacity-50"}>
      {signOut ? pending ? "Signing out…" : "Sign out" : <Image src="/google-sign-in.png" alt="Sign in with Google" width={216} height={48} unoptimized />}
    </button>
    {!signOut && pending && <p role="status" className="mt-2 text-center text-xs text-[#202523]/65">Opening Google…</p>}
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-[#94452e]">{error}</p>}
  </div>;
}
