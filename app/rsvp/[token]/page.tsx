import type { Metadata } from "next";
import Link from "next/link";

import { RsvpUpdateForm } from "../../../components/rsvp/rsvp-update-form";
import { OYSTER_ROAST_EVENT } from "../../../lib/oyster-roast-event";
import { isValidRsvpEditToken } from "../../../lib/rsvp-edit-token";
import { hashRsvpEditToken } from "../../../lib/server/rsvp-edit-token";
import { getRsvpForGuest } from "../../../lib/server/rsvps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Update RSVP | Shindig",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type RsvpUpdatePageProps = {
  params: Promise<{ token: string }>;
};

function LinkUnavailable({ loadFailed = false }: { loadFailed?: boolean }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f7f0e3] px-4 py-10 text-[#202523]">
      <div className="page-texture" />
      <section className="relative w-full max-w-md rounded-[1.75rem] border border-[#202523]/12 bg-[#fffaf1]/85 p-7 text-center shadow-[0_24px_70px_rgb(32_37_35_/_0.1)] sm:p-9">
        <p className="text-[0.68rem] font-bold tracking-[0.2em] text-[#355f9e] uppercase">
          Shindig · {OYSTER_ROAST_EVENT.hostTitle}
        </p>
        <h1 className="font-serif mt-3 text-4xl tracking-[-0.025em]">
          {loadFailed ? "We couldn’t load your RSVP." : "This update link isn’t available."}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#202523]/60">
          {loadFailed
            ? "Please refresh and try again in a moment."
            : "Check that you opened the complete private link from your RSVP confirmation."}
        </p>
        <Link
          className="mt-7 inline-flex text-xs font-bold tracking-[0.14em] text-[#214e91] uppercase underline decoration-[#214e91]/30 underline-offset-4"
          href="/"
        >
          Return to invitation
        </Link>
      </section>
    </main>
  );
}

export default async function RsvpUpdatePage({ params }: RsvpUpdatePageProps) {
  const { token } = await params;

  if (!isValidRsvpEditToken(token)) {
    return <LinkUnavailable />;
  }

  let rsvp: Awaited<ReturnType<typeof getRsvpForGuest>>;

  try {
    rsvp = await getRsvpForGuest(hashRsvpEditToken(token));
  } catch (error) {
    console.error("Unable to load RSVP update page.", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return <LinkUnavailable loadFailed />;
  }

  if (!rsvp) {
    return <LinkUnavailable />;
  }

  return <RsvpUpdateForm initialRsvp={rsvp} token={token} />;
}
