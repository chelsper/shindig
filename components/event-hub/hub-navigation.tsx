"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { EventFeatures } from "../../lib/oyster-roast-event";
import { hubSectionPath } from "../../lib/hub-navigation";
import { useHubSection, type HubNavigationContext } from "./use-hub-section";

export type HubModule = {
  id: keyof EventFeatures;
  label: string;
  icon: "guests" | "weather" | "playlist" | "questions" | "updates" | "polls" | "potluck";
  content: ReactNode;
};

function ModuleIcon({ icon }: { icon: HubModule["icon"] }) {
  return (
    <svg aria-hidden="true" className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {icon === "potluck" ? (
        <><path d="M3 9h18l-2 11H5L3 9Zm5 0 4-7 4 7M9 13v3m6-3v3" /></>
      ) : icon === "polls" ? (
        <><path d="M5 19V9m7 10V4m7 15v-7M3 21h18" /></>
      ) : icon === "guests" ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" />
        </>
      ) : icon === "playlist" ? (
        <>
          <path d="M9 17V5l12-2v12M9 9l12-2" />
          <ellipse cx="6" cy="18" rx="3" ry="2.5" />
          <ellipse cx="18" cy="16" rx="3" ry="2.5" />
        </>
      ) : icon === "questions" ? (
        <>
          <path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z" />
          <path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01" />
        </>
      ) : icon === "updates" ? (
        <>
          <path d="m3 10 17-6v16L3 14v-4Zm5 6 1 5h4l-2-4M20 9h2m-2 6h2" />
        </>
      ) : (
        <>
          <path d="M8 3v2M2 9H1m2-5 1.5 1.5M13 4l-1.5 1.5M4.5 12A4 4 0 1 1 12 9" />
          <path d="M8 20a4 4 0 0 1-.4-8 5 5 0 0 1 9.7-1A4.5 4.5 0 1 1 18.5 20H8Z" />
        </>
      )}
    </svg>
  );
}

// Module content is composed on the server. This boundary only switches panels.
export function HubNavigation({ modules, eyebrow = "Around the roast", navigation }: { modules: HubModule[]; eyebrow?: string; navigation?: HubNavigationContext }) {
  const [selectedId, setSelectedId] = useState(modules[0]?.id);
  const [copyFeedback, setCopyFeedback] = useState<{ section: string; message: string } | null>(null);
  const publicNavigation = useHubSection(navigation, modules.map(module => module.id));
  const tabRefs = useRef<Partial<Record<HubModule["id"], HTMLButtonElement | null>>>({});
  const activeId = navigation ? publicNavigation.active : modules.some((module) => module.id === selectedId)
    ? selectedId
    : modules[0]?.id;

  if (modules.length === 0) return null;

  function select(id: HubModule["id"]) {
    setCopyFeedback(null);
    if (navigation) publicNavigation.select(id);
    else setSelectedId(id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % modules.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + modules.length) % modules.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = modules.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextId = modules[nextIndex].id;
    select(nextId);
    tabRefs.current[nextId]?.focus();
  }

  return (
    <div className="mt-7 sm:mt-9">
      <nav aria-label="Event Hub features" className="mb-4 sm:mb-5">
        <p className="mb-3 px-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#202523]/55">
          {eyebrow}
        </p>
        <div aria-label="Explore the event" className="flex flex-wrap gap-2.5" role="tablist">
          {modules.map((module, index) => (
            <button
              aria-controls={`hub-panel-${module.id}`}
              aria-selected={activeId === module.id}
              className={`flex min-h-12 min-w-0 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e] sm:flex-none sm:px-6 ${
                activeId === module.id
                  ? "border-[#355f9e] bg-[#355f9e] text-[#fffaf1] shadow-[0_4px_12px_rgb(53_95_158_/_0.12)]"
                  : "border-[#355f9e]/20 bg-[#fffaf1]/70 text-[#355f9e] hover:border-[#355f9e]/50 hover:bg-[#e9f2f8]"
              }`}
              id={`hub-tab-${module.id}`}
              key={module.id}
              onClick={() => select(module.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => { tabRefs.current[module.id] = element; }}
              role="tab"
              tabIndex={activeId === module.id ? 0 : -1}
              type="button"
            >
              <ModuleIcon icon={module.icon} />
              {module.label}
            </button>
          ))}
        </div>
        {navigation && activeId && <div className="mt-2 flex flex-wrap items-center gap-x-3 px-1 text-xs text-[#355f9e]">
          <button type="button" className="min-h-11 text-left underline underline-offset-4" onClick={async () => {
            try {
              await navigator.clipboard.writeText(new URL(hubSectionPath(navigation.hubPath, activeId), window.location.origin).href);
              setCopyFeedback({ section: activeId, message: "Section link copied — safe to share with guests." });
            } catch { setCopyFeedback({ section: activeId, message: "Copy isn’t available. Open the section link and copy its address." }); }
          }}>Copy link to this section</button>
          {copyFeedback?.section === activeId && <p role="status" className="basis-full pb-2 leading-5">{copyFeedback.message} <a href={hubSectionPath(navigation.hubPath, activeId)} className="inline-flex min-h-11 items-center underline">Open section link</a></p>}
        </div>}
      </nav>

      {modules.map((module) => (
        <div
          aria-labelledby={`hub-tab-${module.id}`}
          className="rounded-[1.75rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]"
          hidden={activeId !== module.id}
          id={`hub-panel-${module.id}`}
          key={module.id}
          role="tabpanel"
          tabIndex={0}
        >
          {module.content}
        </div>
      ))}
    </div>
  );
}
