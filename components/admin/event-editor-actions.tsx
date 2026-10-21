import type { MouseEvent } from "react";
import { DraftEditorActionBar } from "./draft-editor-action-bar";
import type { SaveStatusInput } from "../../lib/event-save-status";

export function EventEditorActions({ id, revision, dirty, pending, conflict, hasTitle, error, saved, onLeave, publicationStatus }: {
  id: string; revision: number; dirty: boolean; pending: boolean; conflict: boolean; hasTitle: boolean;
  error: string | null; saved: boolean; onLeave: (event: MouseEvent<HTMLAnchorElement>) => void;
  publicationStatus?: SaveStatusInput;
}) {
  return <DraftEditorActionBar formId="event-details-form" saveLabel="Save draft" saveAllowed={dirty && hasTitle}
    publicationStatus={publicationStatus} previewHref={`/admin/events/${id}/preview`}
    reviewReady={revision > 0} reviewHref={`/admin/events/${id}/publish`} pending={pending} dirty={dirty} conflict={conflict}
    status={pending ? "Saving privately…" : conflict ? "Reopen the latest draft before saving or reviewing." : dirty ? "You have unsaved changes. Save before reviewing." : saved ? "Draft saved privately. Review and publish when you’re ready to update guest pages." : revision ? "Your saved draft is up to date. Review does not publish." : "Only the event name is required. Save to continue setup."}
    error={error} reopenHref={`/admin/events/${id}`} reopenLabel="Reopen saved draft" onLeave={onLeave} />;
}
