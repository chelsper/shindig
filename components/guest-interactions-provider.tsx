"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadGuestInteractions } from "../app/event/interaction-actions";
import type { GuestInteractionState, GuestPollState, InteractionResult } from "../lib/guest-interactions";

type Interactions = GuestInteractionState & {
  ready: boolean; error: string | null;
  recordApplause: (key: string, active: boolean) => void;
  recordPoll: (key: string, state: GuestPollState) => void;
};
const Context = createContext<Interactions>({ ready: false, error: null, applauded: [], polls: {}, recordApplause: () => {}, recordPoll: () => {} });
// One initialization for all modules, including Strict Mode remounts. The token
// itself never reaches JavaScript; only this browser's selected public keys do.
let initialization: Promise<InteractionResult<GuestInteractionState>> | null = null;

export function GuestInteractionsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [state, setState] = useState<GuestInteractionState>({ applauded: [], polls: {} });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    initialization ??= loadGuestInteractions().finally(() => { initialization = null; });
    void initialization.then((result) => {
      if (!active) return;
      if (result.ok) { setState(result.data); setReady(true); }
      else { setError(result.message); initialization = null; }
    }).catch(() => { if (active) setError("Your choices couldn’t load. Please refresh to try again."); initialization = null; });
    return () => { active = false; };
  }, [enabled]);
  return <Context.Provider value={{ ...state, ready, error,
    recordApplause: (key, selected) => setState((previous) => ({ ...previous, applauded: selected ? [...new Set([...previous.applauded, key])] : previous.applauded.filter((item) => item !== key) })),
    recordPoll: (key, selection) => setState((previous) => ({ ...previous, polls: { ...previous.polls, [key]: selection } })),
  }}>{children}</Context.Provider>;
}
export const useGuestInteractions = () => useContext(Context);
