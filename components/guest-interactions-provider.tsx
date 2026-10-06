"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadGuestInteractions } from "../app/event/interaction-actions";
import type { GuestInteractionState, GuestPollState, InteractionResult } from "../lib/guest-interactions";

type Interactions = GuestInteractionState & {
  eventSlug?: string;
  ready: boolean; error: string | null;
  recordApplause: (key: string, active: boolean) => void;
  recordPoll: (key: string, state: GuestPollState) => void;
};
const Context = createContext<Interactions>({ ready: false, error: null, applauded: [], polls: {}, recordApplause: () => {}, recordPoll: () => {} });
// One initialization for all modules, including Strict Mode remounts. The token
// itself never reaches JavaScript; only this browser's selected public keys do.
const initializations = new Map<string, Promise<InteractionResult<GuestInteractionState>>>();

export function GuestInteractionsProvider({ children, enabled, eventSlug }: { children: ReactNode; enabled: boolean; eventSlug?: string }) {
  const [state, setState] = useState<GuestInteractionState>({ applauded: [], polls: {} });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const key = eventSlug ?? "legacy";
    if (!initializations.has(key)) initializations.set(key, (eventSlug ? loadGuestInteractions(eventSlug) : loadGuestInteractions()).finally(() => { initializations.delete(key); }));
    void initializations.get(key)!.then((result) => {
      if (!active) return;
      if (result.ok) { setState(result.data); setReady(true); }
      else { setError(result.message); }
    }).catch(() => { if (active) setError("Your choices couldn’t load. Please refresh to try again."); });
    return () => { active = false; };
  }, [enabled, eventSlug]);
  return <Context.Provider value={{ ...state, ready, error, eventSlug,
    recordApplause: (key, selected) => setState((previous) => ({ ...previous, applauded: selected ? [...new Set([...previous.applauded, key])] : previous.applauded.filter((item) => item !== key) })),
    recordPoll: (key, selection) => setState((previous) => ({ ...previous, polls: { ...previous.polls, [key]: selection } })),
  }}>{children}</Context.Provider>;
}
export const useGuestInteractions = () => useContext(Context);
