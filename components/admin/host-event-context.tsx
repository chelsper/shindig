"use client";
import { createContext, useContext, type ReactNode } from "react";
const Context = createContext<{ slug?: string; timeZone: string }>({ timeZone: "America/New_York" });
export function HostEventProvider({ slug, timeZone, children }: { slug: string; timeZone: string; children: ReactNode }) {
  return <Context.Provider value={{ slug, timeZone }}>{children}</Context.Provider>;
}
export function useHostEvent() {
  const context = useContext(Context);
  return { ...context, args: context.slug ? [context.slug] as [string] : [] as [] };
}
