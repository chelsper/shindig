import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HostAccountButton } from "../../../components/admin/host-account-button";
import { getHostPrincipal } from "../../../lib/server/host-access";
import { hostAuthConfiguration } from "../../../lib/server/host-auth-config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host Sign-in | Shindig", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function HostSignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const config = hostAuthConfiguration();
  if (config && (await headers()).get("host") !== new URL(config.origin).host) redirect(`${config.origin}/host/sign-in`);
  let principal, unavailable = false;
  try { principal = await getHostPrincipal(); } catch { unavailable = true; console.error("Host session could not be checked."); }
  if (principal) redirect("/admin/events");
  const failed = Boolean((await searchParams).error);
  return <main className="relative grid min-h-screen place-items-center bg-[#f7f0e3] px-4 py-10 text-[#202523]">
    <div aria-hidden="true" className="page-texture" />
    <section className="relative w-full max-w-md rounded-[1.75rem] border border-[#202523]/12 bg-[#fffaf1]/90 p-6 shadow-[0_24px_70px_rgb(32_37_35_/_0.1)] sm:p-9">
      <Link href="/" className="font-serif text-3xl tracking-[-0.04em]">Shindig<span className="text-[#355f9e]">.</span></Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#355f9e]">A little room to host</p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.03em]">Your next good gathering.</h1>
      <p className="mt-4 text-sm leading-6 text-[#202523]/65">Sign in to create and manage your own events. Your guests won’t need an account.</p>
      {failed && <p role="alert" className="mt-5 rounded-xl bg-[#fff4d8] p-4 text-sm leading-6">Sign-in didn’t finish. Use the Google account invited to the Shindig host pilot, or try again.</p>}
      {config && !unavailable ? <HostAccountButton /> : <p role="status" className="mt-6 rounded-xl bg-[#e9f2f8] p-4 text-sm leading-6">Host account sign-in isn’t available just yet. Please check back soon.</p>}
      <p className="mt-4 text-xs leading-5 text-[#202523]/60">Host accounts are currently available by invitation. Google is used only to verify your identity—not to access your mail, contacts, or calendar.</p>
      <Link href="/admin" className="mt-5 inline-flex min-h-11 items-center text-sm text-[#355f9e] underline underline-offset-4">Existing site administrator →</Link>
    </section>
  </main>;
}
