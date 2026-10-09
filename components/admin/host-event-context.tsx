"use client";
import { createContext, useContext, type ReactNode } from "react";
const Context = createContext<{ slug?: string; timeZone: string; contentLive: boolean }>({ timeZone: "America/New_York", contentLive: true });
export function HostEventProvider({ slug, timeZone, contentLive = true, children }: { slug: string; timeZone: string; contentLive?: boolean; children: ReactNode }) {
  return <Context.Provider value={{ slug, timeZone, contentLive }}>{children}</Context.Provider>;
}
export function useHostEvent() {
  const context = useContext(Context);
  return { ...context, args: context.slug ? [context.slug] as [string] : [] as [] };
}
