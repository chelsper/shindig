import Link from "next/link";
import type { ReactNode } from "react";
import type { EventFeatures } from "../../lib/oyster-roast-event";
import { HUB_CONTENT_MODULES, type HubContentView } from "../../lib/event-hub-content";
import { EventSetupNavigation } from "./event-setup-navigation";
import { HostEventProvider } from "./host-event-context";

export function EventHubContent({ id, title, timeZone, slug, view, enabled, live, publishedBefore, features, children }: {
  id: string; title: string; timeZone: string; slug: string; view: HubContentView;
  enabled: boolean; live: boolean; publishedBefore: boolean; features: EventFeatures; children: ReactNode;
}) {
  const base = `/admin/events/${id}`;
  const active = HUB_CONTENT_MODULES.find(({ id }) => id === view)!;
  const link = "inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4";
  return <main className="relative min-h-screen bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
    <div aria-hidden="true" className="page-texture" />
    <div className="relative mx-auto min-w-0 max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5"><Link href="/admin/events" className="font-serif text-2xl">Shindig</Link><Link href={`${base}/setup`} className={link}>Back to event setup</Link></header>
      <section className="pt-7"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#355f9e]">Event setup · Hub Content</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">A few things for the gathering</h1><p className="mt-3 break-words text-sm leading-6 text-[#202523]/65">The little details for {title}. Prepare what guests can bring, give them choices, and keep your notes together.</p></section>
      <EventSetupNavigation id={id} current="content" />
      <nav aria-label="Hub content sections" className="my-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{HUB_CONTENT_MODULES.map(module => <Link key={module.id} href={`${base}/content?view=${module.id}`} aria-current={module.id === view ? "page" : undefined} className={`flex min-h-14 min-w-0 flex-col justify-center rounded-2xl border px-4 py-3 text-sm text-[#214e91] ${module.id === view ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#355f9e]/20 bg-[#fffaf1]/80"}`}><span className="font-semibold">{module.label}</span><span className="mt-1 text-xs text-[#202523]/60">{features[module.id] ? "Enabled in saved setup" : "Off in saved setup"}</span></Link>)}</nav>
      <section aria-label="Content visibility" className={`mb-6 rounded-2xl border p-4 text-sm leading-6 ${live ? "border-[#b78228]/25 bg-[#fff4d8]" : "border-[#355f9e]/20 bg-[#e9f2f8]/65"}`}>
        <p className="font-semibold">{live ? "This section is live" : "This section is private"}</p>
        <p>{live ? "Saved content changes here affect the live Hub immediately. Event details, artwork and feature switches still use Review & publish." : "You can prepare content now. Guests cannot see it until the event is published with this feature enabled. Saving here does not publish the event."}</p>
        {!enabled && <p className="mt-2">{active.label} is off in your saved setup. Enable it in RSVP &amp; Hub when you want it included.</p>}
        <Link className={`${link} mt-1`} href={`${base}/settings#hub-settings-heading`}>Choose Hub features →</Link>
      </section>
      <section aria-labelledby="hub-content-heading" className="min-w-0"><h2 id="hub-content-heading" className="font-serif text-3xl">{active.label}</h2><p className="mb-5 mt-2 text-sm leading-6 text-[#202523]/65">{active.description}</p>
        <HostEventProvider slug={slug} timeZone={timeZone} contentLive={live}>{children}</HostEventProvider>
      </section>
      <footer className="mt-8 flex flex-wrap gap-x-6 border-t border-[#202523]/12 py-5"><Link className={link} href={`${base}/preview`}>Preview guest pages →</Link><Link className={link} href={`${base}/publish`}>Review &amp; publish →</Link>{publishedBefore && <Link className={link} href={`${base}/guests`}>Manage guest responses →</Link>}</footer>
    </div>
  </main>;
}
