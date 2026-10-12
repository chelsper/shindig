"use client";
import { createContext, useContext, type ReactNode } from "react";
type ContentSetup = { id: string; enabled: boolean };
const Context = createContext<{ slug?: string; timeZone: string; contentLive: boolean; contentSetup?: ContentSetup }>({ timeZone: "America/New_York", contentLive: true });
export function HostEventProvider({ slug, timeZone, contentLive = true, contentSetup, children }: { slug: string; timeZone: string; contentLive?: boolean; contentSetup?: ContentSetup; children: ReactNode }) {
  return <Context.Provider value={{ slug, timeZone, contentLive, contentSetup }}>{children}</Context.Provider>;
}
export function useHostEvent() {
  const context = useContext(Context);
  return { ...context, args: context.slug ? [context.slug] as [string] : [] as [] };
}
