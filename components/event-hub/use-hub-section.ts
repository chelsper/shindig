"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { hubSectionStorageKey, resolveHubSection, type HubSection } from "../../lib/hub-navigation";

export type HubNavigationContext = { eventSlug: string; hubPath: string };
const changeEvent = "shindig:hub-navigation";
const serverSnapshot = () => "";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

export function useHubSection(context: HubNavigationContext | undefined, enabled: HubSection[]) {
  const eventSlug = context?.eventSlug;
  // A primitive snapshot keeps hydration deterministic and works with Back/Forward.
  const snapshot = useSyncExternalStore(subscribe, useCallback(() => {
    if (!eventSlug) return "";
    let remembered = null;
    try { remembered = window.sessionStorage.getItem(hubSectionStorageKey(eventSlug)); } catch { /* URL navigation still works. */ }
    return resolveHubSection(window.location.hash, enabled, remembered) ?? "";
  }, [eventSlug, enabled]), serverSnapshot);
  const active = (snapshot || enabled[0]) as HubSection | undefined;

  useEffect(() => {
    if (!eventSlug || !active) return;
    // Give the original history entry a section too, so Back does not restore
    // the newer sessionStorage selection over the original panel.
    const url = new URL(window.location.href);
    let remembered = null;
    try { remembered = window.sessionStorage.getItem(hubSectionStorageKey(eventSlug)); } catch { /* Optional memory only. */ }
    const resolved = resolveHubSection(url.hash, enabled, remembered);
    if (!resolved) return;
    url.hash = resolved;
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    try { window.sessionStorage.setItem(hubSectionStorageKey(eventSlug), resolved); } catch { /* Storage may be disabled. */ }
  }, [eventSlug, active, enabled]);

  function select(section: HubSection) {
    if (!context || !enabled.includes(section)) return;
    const url = new URL(window.location.href);
    url.hash = section;
    if (url.href !== window.location.href) window.history.pushState(window.history.state, "", url);
    window.dispatchEvent(new Event(changeEvent));
  }
  return { active, select };
}
