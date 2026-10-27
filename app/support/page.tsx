import type { Metadata } from "next";
import Link from "next/link";
import { informationLinkClass, SiteInformationLayout } from "../../components/site-information-layout";
import { SHINDIG_BUSINESS, SHINDIG_SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: "Support | Shindig",
  description: "Get help with Shindig invitations, RSVPs, host accounts, and privacy questions.",
  alternates: { canonical: new URL("support", SHINDIG_SITE.url).href },
};

const guestQuestions = [
  ["How do I change my RSVP?", "Use the private Update RSVP link from your confirmation, a shortcut you chose to save on this device, or your calendar entry if you added it there. Changes follow the event’s RSVP rules. If you cannot find your link, ask the host to help—submitting a new RSVP may create a second response."],
  ["Can I keep my name off the guest list?", "Yes. Uncheck “Show my name on the guest list” when you RSVP, or change that choice through your private RSVP link while edits are open. Your party still counts toward attendance. The host can still see your response."],
  ["How do I stop sharing my phone number or email?", "Open your private RSVP link and the “Keep in touch” form. Uncheck the channel and save to remove that contact detail from the active contact record. This remains available after RSVPs close while the event is published. If the link or event is unavailable, ask the host or contact support. Also ask the host to stop messages and remove any copies they have saved elsewhere."],
  ["Is my calendar entry safe to share?", "Check it first. Calendar entries can include your private RSVP edit link. Anyone with that link may be able to change your RSVP or contact choices. Share the public invitation or Event Hub link instead."],
] as const;
const hostQuestions = [
  ["Which Google account should I use?", "Use the same Google account you used to create your Shindig host account. If sign-in says hosting is invitation-only, use the invited address. If new accounts are paused, existing eligible hosts can still sign in. A Google identity-verification challenge must be completed directly with Google; never share your password or verification codes with support."],
  ["I saved changes. Why can’t guests see them?", "Saving an event draft and publishing it are separate steps. Review your draft and use the event’s publish controls to make changes live. For optional Hub sections, check that the feature is enabled and any content that requires publishing is published. Open the guest-facing link to check what guests actually see."],
  ["How do I remove data or close my account?", "Use the available host controls to remove individual records or clear collected contact details. Archiving or unpublishing an event does not delete its records. For account closure, access requests, or deletion beyond those controls, email support. These requests are reviewed manually, and we may need to verify that you own the account or data."],
] as const;

function HelpQuestions({ id, title, questions }: { id: string; title: string; questions: readonly (readonly [string, string])[] }) {
  return <section aria-labelledby={id} className="mt-10">
    <h2 id={id} className="font-serif text-3xl tracking-[-0.025em]">{title}</h2>
    <div className="mt-5 divide-y divide-[#202523]/15 border-y border-[#202523]/15">
      {questions.map(([question, answer]) => <details key={question} className="group py-1">
        <summary className="min-h-12 cursor-pointer py-3 pr-2 text-sm font-semibold leading-6 marker:text-[#355f9e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#355f9e]">{question}</summary>
        <p className="pb-5 pr-2 text-sm leading-7 text-[#202523]/80">{answer}</p>
      </details>)}
    </div>
  </section>;
}

export default function SupportPage() {
  return <SiteInformationLayout eyebrow="We’re here to help" title="A little help with your Shindig." introduction="For questions about the party, start with your host. For help with the app or your information, get in touch with us.">
    <section aria-labelledby="contact-heading" className="mt-8 rounded-2xl border border-[#355f9e]/15 bg-[#e9f2f8]/70 p-5 sm:p-7">
      <h2 id="contact-heading" className="font-serif text-2xl tracking-[-0.02em]">Let’s sort it out.</h2>
      <a href={`mailto:${SHINDIG_BUSINESS.supportEmail}`} className={`mt-3 inline-flex min-h-12 max-w-full items-center py-2 text-base font-semibold ${informationLinkClass}`}><span className="min-w-0 break-words">{SHINDIG_BUSINESS.supportEmail}</span></a>
      <p className="mt-2 text-sm leading-6 text-[#202523]/80">Include what happened, your browser or device, and the public event link if it helps. Please don’t send passwords, verification codes, private RSVP or signup edit links, or guest lists.</p>
      <p className="mt-4 text-xs leading-6 text-[#202523]/70">Opens your email app; nothing is sent automatically. Messages are forwarded to our support inbox, and replies may come from our Gmail support account.</p>
    </section>
    <HelpQuestions id="guest-help" title="Joining a Shindig?" questions={guestQuestions} />
    <HelpQuestions id="host-help" title="Hosting a Shindig?" questions={hostQuestions} />
    <aside className="mt-9 border-l-2 border-[#355f9e]/30 pl-5 text-sm leading-7 text-[#202523]/80">
      <p>Want the full picture on information and privacy? <Link href="/privacy" className={informationLinkClass}>Read our privacy policy.</Link></p>
    </aside>
  </SiteInformationLayout>;
}
