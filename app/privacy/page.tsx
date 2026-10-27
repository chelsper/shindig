import type { Metadata } from "next";
import { informationLinkClass, SiteInformationLayout } from "../../components/site-information-layout";
import { SHINDIG_BUSINESS, SHINDIG_SITE } from "../../lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy | Shindig",
  description: "How Shindig handles host accounts, RSVPs, optional contact details, and event information—and the choices available to you.",
  alternates: { canonical: new URL("privacy", SHINDIG_SITE.url).href },
};

const sections = [
  ["information", "Information we handle"],
  ["visibility", "Who can see what"],
  ["contact-sharing", "Optional contact sharing"],
  ["providers", "Services that help Shindig work"],
  ["device-storage", "Cookies, device storage & private links"],
  ["retention", "How long information stays"],
  ["choices", "Your choices & requests"],
  ["security", "Security & policy changes"],
] as const;
const headingClass = "font-serif text-3xl leading-tight tracking-[-0.025em]";

export default function PrivacyPage() {
  return <SiteInformationLayout eyebrow="A little clarity" title="Privacy policy" introduction="Getting together should feel good. Here’s how information moves through Shindig, what other people can see, and how to ask for help.">
    <p className="mt-5 text-sm leading-6 text-[#202523]/70">Last updated <time dateTime="2026-10-27">October 27, 2026</time></p>
    <div className="mt-8 rounded-2xl border border-[#355f9e]/15 bg-[#e9f2f8]/70 p-5 text-sm leading-6 sm:p-6">
      <h2 className="font-semibold">The short version</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Guests don’t need an account to RSVP. Hosts sign in with Google for identity verification only.</li>
        <li>Published event links are shareable, not password-protected. Keep private RSVP and signup edit links to yourself.</li>
        <li>Sharing a phone number or email with an event host is optional. Those details are not shown on the Event Hub.</li>
        <li>There is no automatic event-data cleanup or self-service account deletion yet. The choices below explain what you can remove and how to request help.</li>
      </ul>
    </div>
    <p className="mt-7 text-sm leading-7 text-[#202523]/80">Shindig is operated by {SHINDIG_BUSINESS.name} in {SHINDIG_BUSINESS.location}. This policy covers the Shindig application and its hosted invitations and Event Hubs, including Jasper Shucks. Questions? Write to <a href={`mailto:${SHINDIG_BUSINESS.supportEmail}`} className={`${informationLinkClass} break-words`}>{SHINDIG_BUSINESS.supportEmail}</a>.</p>
    <nav aria-label="Privacy policy sections" className="mt-8 border-y border-[#202523]/15 py-4">
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className={`inline-flex min-h-11 items-center py-2 text-sm ${informationLinkClass}`}>{label}</a></li>)}
      </ul>
    </nav>
    <div className="mt-10 space-y-10 text-sm leading-7 text-[#202523]/85 sm:text-base [&_section]:scroll-mt-8 [&_h2]:text-[#202523] [&_p]:mt-4 [&_li]:mt-2">
      <section id="information" aria-labelledby="information-heading">
        <h2 id="information-heading" className={headingClass}>Information we handle</h2>
        <ul className="mt-4 list-disc pl-5">
          <li><strong>Host accounts.</strong> Google provides a host’s name, email address, verification status, and Google account identifier. We keep account and session records to sign hosts in, identify who owns an event, and protect access. Google is not used to read your Gmail, contacts, or calendar. We do not retain Google access, refresh, or ID tokens after the sign-in flow, or store your Google profile photo.</li>
          <li><strong>Events and RSVPs.</strong> Hosts provide event details, addresses, artwork, and settings. Guests provide a name, attendance choice, party size when attending, optional comments, and guest-list preferences. Records include submission and update times and secure edit-link identifiers.</li>
          <li><strong>Optional activities.</strong> Depending on the event, we handle song suggestions and optional names, questions and optional names, poll votes, playlist applause, and bring-something signups with names and quantities.</li>
          <li><strong>Host-added contacts.</strong> A host may keep a private invitation tracker containing names, contact details, invitation status, and links to RSVPs. These entries are separate from a guest’s optional contact-sharing preferences.</li>
          <li><strong>Support and security.</strong> We receive what you send to support, including attachments. Hosting and authentication services process technical information such as IP addresses, browser details, request logs, session information, and timestamps for operation, troubleshooting, and abuse prevention.</li>
        </ul>
        <p>We use this information to run invitations and event activities, manage host access, provide requested support, and maintain the service’s security. Only share information needed for the event; avoid sensitive personal details in messages, questions, or artwork.</p>
      </section>
      <section id="visibility" aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className={headingClass}>Who can see what</h2>
        <p>A published invitation or Event Hub can be viewed by anyone who obtains its link; guests do not sign in. A link that is not listed publicly is not the same as a confidential page. Hosts should only publish event details and artwork they intend to share.</p>
        <p>If the guest list is enabled, attending guests who choose to display their names appear with their party sizes. Hidden attending guests still count toward the total. Declined guests, RSVP comments, and contact details are not displayed in that list.</p>
        <p>Song suggestions and the optional “suggested by” name can be public. Questions appear only after the host answers and publishes them; the separate guest-name field is not published. Names or personal details written inside a question can still appear as part of its text. Poll results show aggregate counts. Public bring-something lists show items and claimed quantities, not claimants’ names.</p>
        <p>The event’s authorized host can see private RSVP details, submitted questions, bring-something signups, and contact information shared with them or entered in their invitation tracker. Authorized service administration and service providers may also need access to operate, secure, or support Shindig. Information may be disclosed when required by applicable law or to address security and abuse.</p>
      </section>
      <section id="contact-sharing" aria-labelledby="contact-sharing-heading">
        <h2 id="contact-sharing-heading" className={headingClass}>Optional contact sharing</h2>
        <p>You can RSVP without giving a phone number or email address. If you choose to share one, it is for that event’s host to send event reminders and updates using their own email or messaging app. Shindig currently does not send these messages. Contact details are not verified, and this choice is not permission for unrelated marketing.</p>
        <p>We store the chosen contact details and the time permission was recorded separately from the RSVP. They are excluded from the public Hub and RSVP CSV export. The host can copy the details you share for their own communication tools.</p>
        <p>While the event remains published, use your private RSVP link and its “Keep in touch” form to change your choices. Unchecking a channel and saving removes its contact detail and permission timestamp from Shindig’s active contact record. If you cannot access the link or event, contact the host or our support address.</p>
        <p>Hosts can also clear collected contacts and end further collection. Neither action retracts messages already sent, host copies, or contact information the host independently entered in their invitation tracker. Ask the host directly to stop contacting you and remove those copies if needed.</p>
      </section>
      <section id="providers" aria-labelledby="providers-heading">
        <h2 id="providers-heading" className={headingClass}>Services that help Shindig work</h2>
        <p>We use the following services for the stated purposes. They process relevant information under their own policies and service terms, and processing may take place outside your country.</p>
        <dl className="mt-4 space-y-4">
          <div><dt className="font-semibold">Vercel and Neon</dt><dd>Vercel hosts the application and uploaded artwork; Neon stores application records, including events, accounts, RSVPs, and enabled activities.</dd></div>
          <div><dt className="font-semibold">Google</dt><dd>Google verifies host identity at sign-in. Separately, Gmail receives our support email. Signing into Shindig does not grant access to your mailbox or calendar.</dd></div>
          <div><dt className="font-semibold">ImprovMX</dt><dd>ImprovMX forwards messages sent to our support address to our support inbox, processing email content and delivery information. Replies may come from our Gmail support account.</dd></div>
          <div><dt className="font-semibold">Spotify</dt><dd>Music searches use Spotify’s catalog and artwork. Search text is sent for catalog lookup; guests do not connect a Spotify account to Shindig.</dd></div>
          <div><dt className="font-semibold">Open-Meteo and the U.S. Census Geocoder</dt><dd>Weather uses the event’s configured coordinates, not your device’s location. A host using address lookup sends the entered address to the U.S. Census Geocoder, including when the event is still a draft.</dd></div>
          <div><dt className="font-semibold">Calendar, directions, and other external links</dt><dd>When you choose these actions, the selected service receives the relevant event details. Calendar entries can include your private RSVP edit link. Do not share or forward that entry if it includes a private link. External services apply their own privacy policies.</dd></div>
        </dl>
      </section>
      <section id="device-storage" aria-labelledby="device-storage-heading">
        <h2 id="device-storage-heading" className={headingClass}>Cookies, device storage &amp; private links</h2>
        <p>Host sign-in uses secure session cookies. Guest interactions use an anonymous browser cookie to remember votes and applause and help prevent repeat actions; a hashed identifier is stored with those interactions. This cookie can last up to one year and is not a guest account.</p>
        <p>If you explicitly choose to remember a private RSVP or bring-something link on your device, Shindig stores that shortcut in the browser. Shortcuts stop appearing after 180 days. Use “Forget” or clear your browser’s site data to remove the saved shortcut; this does not cancel an RSVP or signup or delete its server record. The Hub also uses temporary browser storage to remember the selected section.</p>
        <p>Private edit links grant access to the associated response or signup without a password. Anyone with such a link may be able to view or change that record, including RSVP contact choices. Keep links and calendar copies private, especially on shared devices. Clearing browser storage cannot remove copies you have already shared or saved elsewhere.</p>
      </section>
      <section id="retention" aria-labelledby="retention-heading">
        <h2 id="retention-heading" className={headingClass}>How long information stays</h2>
        <p>Event records do not automatically expire or disappear after the event. Unpublishing or archiving an event does not delete its stored information. Hosts can use available controls to remove individual records and clear collected contact details. For events created in their workspace, hosts can also choose Data &amp; privacy from the event Overview to permanently delete the event and its active guest records, after explicit confirmation.</p>
        <p>Event deletion removes the event’s database records and disables its guest links. Uploaded artwork has a separate cleanup step: wait at least three minutes, then return to the deletion page to finish. Pending cleanup is listed under Account &amp; Privacy; it does not run automatically. A minimal owner-linked deletion receipt and a reserved event link remain to support cleanup and prevent a deleted link being reused for a different gathering. They do not contain guest records or the deleted event’s content.</p>
        <p>Account closure, requests concerning the original Jasper Shucks invitation, and broader deletion requests require contacting support; there is no self-service account-deletion button.</p>
        <p>Information remains as needed to provide the service and address support, security, or legal requirements. Removal from active records may not immediately remove provider backups or security logs. We cannot delete copies that hosts or guests have exported, saved in a calendar, or kept in their own inboxes and devices.</p>
      </section>
      <section id="choices" aria-labelledby="choices-heading">
        <h2 id="choices-heading" className={headingClass}>Your choices &amp; requests</h2>
        <p>Use your private RSVP link to update your response and guest-list visibility, subject to the event’s RSVP rules. Contact-sharing choices can be changed separately while the event remains published. Ask the host for help with event-specific information or copies the host holds outside Shindig.</p>
        <p>For access, correction, deletion, or account-closure requests, email <a href={`mailto:${SHINDIG_BUSINESS.supportEmail}`} className={`${informationLinkClass} break-words`}>{SHINDIG_BUSINESS.supportEmail}</a>. Tell us what you need and, if relevant, the public event link. We may need to verify your identity or authority before acting. Do not send passwords, verification codes, private edit links, or a guest list. We review requests manually and explain any limitations that apply.</p>
        <p>You can also manage Shindig’s Google connection in your Google Account. Removing that connection does not itself delete your Shindig account or event records.</p>
      </section>
      <section id="security" aria-labelledby="security-heading">
        <h2 id="security-heading" className={headingClass}>Security &amp; policy changes</h2>
        <p>Shindig uses server-side authorization for host tools and private records, secure session cookies in production, input validation, and unguessable edit links. No online service can guarantee absolute security. Contact support if you think a private link or account has been exposed.</p>
        <p>We may update this policy as the service changes. The date at the top identifies the latest version. For questions about a change or this policy, contact {SHINDIG_BUSINESS.name} at the support address above.</p>
      </section>
    </div>
  </SiteInformationLayout>;
}
