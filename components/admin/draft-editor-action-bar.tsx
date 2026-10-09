import Link from "next/link";
import type { MouseEvent } from "react";

export function DraftEditorActionBar({ formId, saveLabel, saveAccessibleLabel, pendingLabel = "Saving draft…", saveAllowed, reviewReady, reviewHref, pending, dirty, conflict, status, error, reopenHref, reopenLabel, onLeave }: {
  formId: string; saveLabel: string; saveAccessibleLabel?: string; pendingLabel?: string; saveAllowed: boolean;
  reviewReady: boolean; reviewHref: string; pending: boolean; dirty: boolean; conflict: boolean;
  status: string; error: string | null; reopenHref: string; reopenLabel: string;
  onLeave: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const canReview = reviewReady && !dirty && !pending && !conflict;
  const reviewClass = "inline-flex min-h-12 items-center justify-center rounded-full border border-[#355f9e]/30 bg-[#e9f2f8] px-4 text-center text-xs font-bold text-[#214e91] disabled:opacity-45";
  return <section aria-label="Save and review draft" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#202523]/15 bg-[#fffaf1]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgb(32_37_35_/_0.06)] backdrop-blur-sm">
    <div className="mx-auto max-w-6xl">
      {error && <p role="alert" className="mb-2 text-sm leading-5 text-red-900">{error}</p>}
      {conflict && <a className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline" href={reopenHref} onClick={onLeave}>{reopenLabel}</a>}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p role="status" className="text-xs leading-5 text-[#202523]/65">{status}</p>
        <div className="grid grid-cols-2 gap-2 sm:min-w-80">
          <button type="submit" form={formId} aria-label={pending ? undefined : saveAccessibleLabel} className="primary-button min-h-12 px-4 text-xs" disabled={pending || conflict || !saveAllowed}>{pending ? pendingLabel : saveLabel}</button>
          {canReview ? <Link href={reviewHref} className={reviewClass} onClick={onLeave}>Review &amp; publish</Link> : <button type="button" className={reviewClass} disabled>Review &amp; publish</button>}
        </div>
      </div>
    </div>
  </section>;
}
