import type { ReactNode } from "react";
import { DRAFT_HUB_MODULES, type DraftSettings } from "../../lib/event-draft-settings";
import type { HubContentPreview, PreviewSection } from "../../lib/event-hub-preview";
import { pollPercentage } from "../../lib/polls";
import { HubNavigation } from "../event-hub/hub-navigation";

// Pure presentation only: no guest providers, action imports, cookies, effects,
// forms, weather/music requests, or links into public guest workflows.
function Frame({ title, section, children }: { title: string; section: PreviewSection<unknown>; children: ReactNode }) {
  return <section aria-label={`${title} preview`} className="min-w-0 rounded-[1.75rem] border border-[#202523]/10 bg-white/48 p-5 sm:p-7">
    <p className="text-[0.66rem] font-bold uppercase tracking-[0.15em] text-[#355f9e]">Read-only preview · {section.live === null ? "Live status unavailable" : section.live ? "Content already live" : "Prepared privately"}</p>
    <h2 className="mt-2 font-serif text-3xl sm:text-4xl">{title}</h2>
    {section.state !== "ready" ? <p role="status" className="py-6 text-sm leading-6 text-[#202523]/65">Saved content couldn’t load. Reload this preview to try again; nothing has changed.</p> : children}
  </section>;
}

export function SavedPotluckPreview({ section }: { section: HubContentPreview["potluck"] }) {
  return <Frame title="Bring something" section={section}>
    <p className="mt-2 text-sm leading-6 text-[#202523]/65">Pick a little something to bring. We’ll keep track of what’s covered.</p>
    {!section.items.length ? <p className="py-8 font-serif text-xl">Nothing needed just yet. The host will add a few ideas here.</p> : <ul className="mt-5 divide-y divide-[#202523]/10">{section.items.map((item, index) => {
      const remaining = Math.max(0, item.needed - item.claimed);
      return <li key={index} className="min-w-0 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words font-serif text-xl">{item.title}</h3>{item.note && <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-[#202523]/65">{item.note}</p>}<p className="mt-2 text-xs font-semibold text-[#355f9e]">{remaining ? `${remaining} still needed · ${item.claimed} of ${item.needed} covered` : "All covered — thank you!"}</p></div><button type="button" disabled className="min-h-11 rounded-full border border-[#355f9e]/25 bg-[#e9f2f8] px-4 text-sm font-semibold text-[#214e91] opacity-50">{remaining ? "I’ll bring this" : "Covered"}</button></div></li>;
    })}</ul>}
    <p className="mt-3 text-xs leading-5 text-[#202523]/55">Preview only. Signups are disabled and guest names are not shown.</p>
  </Frame>;
}

export function SavedPollsPreview({ section }: { section: HubContentPreview["polls"] }) {
  return <Frame title="Important Research" section={section}>
    <div className="divide-y divide-[#202523]/10">{section.items.map((poll, index) => <article key={index} className="py-5">
      <p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">{poll.eyebrow || "Important research"}{poll.status === "CLOSED" ? " · Final results" : ""}</p>
      <h3 className="mt-2 break-words font-serif text-2xl">{poll.question}</h3>
      {poll.status === "OPEN" ? <fieldset disabled className="mt-4 space-y-2"><legend className="mb-3 text-xs text-[#202523]/60">{poll.allowMultiple ? "Choose all that apply." : "Pick one. This is very serious science."}</legend>
        {poll.options.map((option, n) => <label key={n} className="flex min-h-12 items-center gap-3 rounded-xl border border-[#202523]/10 bg-[#fffaf1]/65 px-3 py-2 text-sm"><input disabled type={poll.allowMultiple ? "checkbox" : "radio"} name={`preview-poll-${index}`} className="size-4 shrink-0 accent-[#355f9e]" /><span className="min-w-0 break-words">{option.text}</span></label>)}<button type="button" disabled className="primary-button mt-2">Vote</button>
      </fieldset> : <div className="mt-4"><ul aria-label="Poll results" className="space-y-3">{poll.options.map((option, n) => {
        const percentage = pollPercentage(option.count ?? 0, poll.responses ?? 0);
        return <li key={n}><div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words">{option.text}</span><span className="shrink-0 text-[#355f9e]">{percentage}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#355f9e]/8"><div className="h-full rounded-full bg-[#355f9e]/55" style={{ width: `${percentage}%` }} /></div></li>;
      })}</ul><p className="mt-4 text-xs text-[#202523]/65">{poll.responses} highly scientific {poll.responses === 1 ? "response" : "responses"}</p>{poll.allowMultiple && <p className="mt-1 text-xs text-[#202523]/55">Percent of respondents choosing each option. Totals can exceed 100%.</p>}<p className="mt-4 text-xs text-[#202523]/60">This poll is closed. Thanks for weighing in.</p></div>}
    </article>)}</div>
    <p className="text-xs leading-5 text-[#202523]/55">All guest-ready polls are shown for review. Guests browse one at a time. Voting is disabled here.</p>
  </Frame>;
}

export function SavedUpdatesPreview({ section, timeZone }: { section: HubContentPreview["updates"]; timeZone: string }) {
  return <Frame title="Host Updates" section={section}>
    <p className="mt-2 text-sm text-[#202523]/65">The latest little details for the gathering.</p>
    {!section.items.length ? <p className="py-10 text-center font-serif text-2xl text-[#202523]/70">All quiet for now. We’ll share any updates here.</p> : <ol aria-label="Host updates" className="divide-y divide-[#202523]/10">{section.items.map((update, index) => <li key={index} className="break-words py-5">
      <time className="text-xs text-[#355f9e]" dateTime={update.publishedAt}>{new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(update.publishedAt))}</time>
      {update.heading && <h3 className="mt-2 font-serif text-2xl">{update.heading}</h3>}<p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#202523]/80">{update.message}</p>
    </li>)}</ol>}
  </Frame>;
}

export function SavedQuestionsPreview({ section }: { section: HubContentPreview["questions"] }) {
  return <Frame title="Ask the Host" section={section}>
    <p className="mt-2 text-sm text-[#202523]/65">Wondering about something? Just ask.</p>
    <button disabled type="button" className="mt-5 min-h-12 rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/80 px-5 text-sm font-semibold text-[#214e91] opacity-50">+ Ask a Question</button>
    {!section.items.length ? <p className="py-10 text-center font-serif text-2xl text-[#202523]/70">Good questions deserve good answers. We’ll share them here.</p> : <div className="mt-4 divide-y divide-[#202523]/10">{section.items.map((item, index) => <details key={index} className="break-words py-2"><summary className="min-h-12 cursor-pointer py-4 font-serif text-xl marker:text-[#355f9e]">{item.question}</summary><div className="mb-4 border-l-2 border-[#355f9e]/25 pl-4"><p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#355f9e]">From the host</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#202523]/80">{item.answer}</p></div></details>)}</div>}
    <p className="mt-3 text-xs leading-5 text-[#202523]/55">Only approved answers appear. Sending questions is disabled in this preview.</p>
  </Frame>;
}

export function SavedHubPreview({ settings, content, timeZone }: { settings: DraftSettings; content: HubContentPreview; timeZone: string }) {
  const modules = DRAFT_HUB_MODULES.filter(({ id }) => settings.features[id])
    .filter(({ id }) => id !== "polls" || content.polls.state !== "ready" || content.polls.items.length > 0)
    .map(module => ({ id: module.id, label: module.guestLabel, icon: module.icon, content:
      module.id === "potluck" ? <SavedPotluckPreview section={content.potluck} /> :
      module.id === "polls" ? <SavedPollsPreview section={content.polls} /> :
      module.id === "updates" ? <SavedUpdatesPreview section={content.updates} timeZone={timeZone} /> :
      module.id === "questions" ? <SavedQuestionsPreview section={content.questions} /> :
      <section className="rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#355f9e]">Layout preview only</p><h2 className="mt-2 font-serif text-2xl">{module.guestLabel}</h2><p className="mt-3 text-sm leading-6 text-[#202523]/65">{module.preview}</p></section>,
    }));
  return <div aria-label="Saved Event Hub preview">
    {modules.length ? <HubNavigation modules={modules} eyebrow="Around the Shindig" /> : <p className="rounded-xl border border-dashed border-[#355f9e]/25 p-4 text-sm leading-6 text-[#202523]/65">The Hub will show just your event details; no optional modules are selected or ready to display.</p>}
    <p className="mt-4 text-xs leading-5 text-[#202523]/55">Saved Hub content is read-only. Guest lists, songs and weather remain layout previews; no guest activity or external data is loaded for them.</p>
  </div>;
}
