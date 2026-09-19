import type { Metadata } from "next";

import { AdminDashboard } from "../../components/admin/admin-dashboard";
import { AdminLoginForm } from "../../components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminConfigured,
} from "../../lib/server/admin-session";
import {
  getRsvpSummary,
  listRsvps,
  type RsvpFilter,
} from "../../lib/server/rsvps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Host Dashboard | Shindig",
  robots: { index: false, follow: false },
};

type AdminPageProps = {
  searchParams: Promise<{ status?: string | string[] }>;
};

function getFilter(value: string | string[] | undefined): RsvpFilter {
  return value === "attending" || value === "declined" ? value : "all";
}

function LoginScreen({ configured }: { configured: boolean }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f7f0e3] px-4 py-10 text-[#202523]">
      <div className="page-texture" />
      <section className="relative w-full max-w-md rounded-[1.75rem] border border-[#202523]/12 bg-[#fffaf1]/80 p-6 shadow-[0_24px_70px_rgb(32_37_35_/_0.1)] backdrop-blur-sm sm:p-9">
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8] text-2xl" aria-hidden="true">
          ◒
        </div>
        <p className="mt-5 text-center text-[0.68rem] font-bold tracking-[0.2em] text-[#355f9e] uppercase">
          Shindig · Host Access
        </p>
        <h1 className="font-serif mt-2 text-center text-4xl tracking-[-0.025em]">Oyster Roast 2026</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-[#202523]/58">
          Enter the host password to view guest responses.
        </p>
        {configured ? (
          <AdminLoginForm />
        ) : (
          <p className="mt-7 rounded-xl border border-amber-900/15 bg-amber-50/70 px-4 py-3 text-center text-sm leading-relaxed text-amber-950">
            Host access isn’t configured. Add <code className="font-semibold">ADMIN_PASSWORD</code> to the server environment first.
          </p>
        )}
      </section>
    </main>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const configured = isAdminConfigured();

  if (!configured || !(await isAdminAuthenticated())) {
    return <LoginScreen configured={configured} />;
  }

  const filter = getFilter((await searchParams).status);
  let dashboardData:
    | {
        summary: Awaited<ReturnType<typeof getRsvpSummary>>;
        rsvps: Awaited<ReturnType<typeof listRsvps>>;
      }
    | undefined;

  try {
    const [summary, rsvps] = await Promise.all([
      getRsvpSummary(),
      listRsvps(filter),
    ]);
    dashboardData = { summary, rsvps };
  } catch (error) {
    console.error("Unable to load the admin RSVP dashboard.", error);
  }

  if (!dashboardData) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f0e3] px-4 text-[#202523]">
        <section className="max-w-md rounded-2xl border border-[#202523]/10 bg-white/50 p-7 text-center">
          <h1 className="font-serif text-3xl">The guest list couldn’t load.</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#202523]/60">
            Please refresh and try again in a moment. Your RSVP data has not been changed.
          </p>
        </section>
      </main>
    );
  }

  return (
    <AdminDashboard
      filter={filter}
      rsvps={dashboardData.rsvps}
      summary={dashboardData.summary}
    />
  );
}
