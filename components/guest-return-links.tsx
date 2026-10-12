"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { forgetGuestLink, GUEST_LINKS_STORAGE_KEY, guestReturnPath, parseGuestLinks, rememberGuestLink, sameGuestLink, type GuestLinkKind, type GuestReturnLink } from "../lib/guest-return-links";

const changed = "shindig:private-links-changed";
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === GUEST_LINKS_STORAGE_KEY) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changed, callback);
  const timer = window.setInterval(callback, 60_000);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(changed, callback); window.clearInterval(timer); };
}
function snapshot() {
  try { return JSON.stringify(parseGuestLinks(window.localStorage.getItem(GUEST_LINKS_STORAGE_KEY))); } catch { return null; }
}
const serverSnapshot = () => null;
function useGuestLinks() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return parseGuestLinks(raw);
}
function changeLink(link: Omit<GuestReturnLink, "savedAt">, remove: boolean) {
  try {
    const ok = remove ? forgetGuestLink(window.localStorage, link) : rememberGuestLink(window.localStorage, link);
    if (ok) window.dispatchEvent(new Event(changed));
    return ok;
  } catch { return false; }
}

export function RememberGuestLink({ eventSlug, kind, token }: { eventSlug: string; kind: GuestLinkKind; token: string }) {
  const links = useGuestLinks(), [error, setError] = useState("");
  const identity = { eventSlug, kind, token };
  const saved = links.some(link => sameGuestLink(link, identity));
  return <div className="mt-4 border-t border-current/15 pt-3 text-left text-xs leading-5">
    <button type="button" className="min-h-11 font-semibold underline underline-offset-4" onClick={() => {
      setError(changeLink(identity, saved) ? "" : "This browser couldn’t change your saved links. Keep a copy of your private link instead, or forget an old shortcut and try again.");
    }}>{saved ? "Forget this saved link" : "Remember this private link on this device"}</button>
    <p>{saved ? "Saved in this browser. Find it on the invitation or Event Hub. Forgetting the link does not cancel anything." : "Optional — anyone using this browser can access it. Don’t save on a shared device. Keep the private link for other devices."}</p>
    {error && <p role="alert" className="mt-2">{error}</p>}
  </div>;
}

export function SavedGuestLinks({ eventSlug, publicSlug, potluckEnabled = false }: { eventSlug: string; publicSlug?: string; potluckEnabled?: boolean }) {
  const all = useGuestLinks(), [error, setError] = useState("");
  const links = all.filter(link => link.eventSlug === eventSlug && (link.kind === "rsvp" || potluckEnabled));
  if (!links.length) return null;
  return <aside aria-label="Your saved private links" className="my-5 rounded-2xl border border-[#355f9e]/20 bg-[#e9f2f8]/60 px-4 py-3 text-[#202523] sm:px-5">
    <h2 className="text-sm font-semibold">Welcome back</h2>
    <p className="mt-1 text-xs leading-5 text-[#202523]/65">Private links you chose to save in this browser. No need to start over.</p>
    <ul className="mt-2 divide-y divide-[#355f9e]/10">{links.map(link => {
      const peers = links.filter(item => item.kind === link.kind);
      const label = `${link.kind === "rsvp" ? "View / update my RSVP" : "Manage my signup"}${peers.length > 1 ? ` ${peers.indexOf(link) + 1}` : ""}`;
      return <li key={`${link.kind}:${link.token}`} className="flex items-center justify-between gap-3">
        <Link prefetch={false} referrerPolicy="no-referrer" href={guestReturnPath(link, publicSlug)} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#214e91] underline underline-offset-4">{label}</Link>
        <button type="button" aria-label={`Forget link: ${label}`} className="min-h-11 shrink-0 text-xs underline underline-offset-4" onClick={() => setError(changeLink(link, true) ? "" : "Couldn’t forget that link. Please try again.")}>Forget</button>
      </li>;
    })}</ul>
    <p className="text-[11px] leading-5 text-[#202523]/60">Forgetting a shortcut doesn’t cancel your RSVP or signup. Saved links expire here after 180 days and won’t follow you to another browser or device.</p>
    {error && <p role="alert" className="mt-2 text-xs">{error}</p>}
  </aside>;
}
