"use client";

import Link from "next/link";
import { FormEvent, useActionState, useEffect, useState } from "react";

import {
  createAdminGuest,
  deleteAdminGuest,
  updateAdminGuest,
  type AdminGuestActionState,
} from "../../app/admin/actions";
import type { AdminRsvp } from "../../lib/server/rsvps";
import { DashboardLink } from "./dashboard-link";
import { createEventGuest, updateEventGuest, deleteEventGuest } from "../../app/admin/events/[id]/guests/actions";
import { eventGuestsPath, type EventGuestFormContext } from "../../lib/admin-guests";

type AdminGuestFormProps = { event?: EventGuestFormContext } & (
  | { mode: "create"; rsvp?: never }
  | { mode: "edit"; rsvp: AdminRsvp });

const initialState: AdminGuestActionState = { error: null };

function DeleteGuestForm({ id, guestName, eventId, disabled, onPendingChange }: { id: string; guestName: string; eventId?: string; disabled: boolean; onPendingChange: (pending: boolean) => void }) {
  const [confirming, setConfirming] = useState(false);
  const deleteAction = eventId ? deleteEventGuest.bind(null, eventId, id) : deleteAdminGuest.bind(null, id);
  const [state, formAction, isPending] = useActionState(
    deleteAction,
    initialState,
  );
  useEffect(() => { onPendingChange(isPending); }, [isPending, onPendingChange]);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (eventId) {
      if (!confirming) event.preventDefault();
      return;
    }
    if (
      !window.confirm(
        `Delete ${guestName}’s RSVP? This cannot be undone.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="mt-6 border-t border-[#202523]/10 pt-6" onSubmit={confirmDelete}>
      <div className="flex flex-col gap-3 rounded-xl border border-[#a94132]/15 bg-[#fff0e9]/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#68372f]">Delete this RSVP</p>
          <p className="mt-1 text-xs leading-5 text-[#68372f]/65">
            This permanently removes the guest from the dashboard and Event Hub.
          </p>
        </div>
        {eventId ? <button type="button" disabled={disabled || confirming} aria-expanded={confirming} aria-controls={`delete-confirm-${id}`} className="min-h-11 shrink-0 rounded-full border border-[#a94132]/30 px-5 text-xs font-bold text-[#843528] disabled:opacity-45" onClick={(click) => { click.preventDefault(); setConfirming(true); }}>Delete Guest</button> : <button
          className="min-h-11 shrink-0 rounded-full border border-[#a94132]/30 px-5 text-xs font-bold uppercase tracking-[0.11em] text-[#843528] transition hover:border-[#a94132] hover:bg-[#fff0e9] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isPending || disabled}
          type="submit"
          name="confirm"
          value="delete"
        >
          {isPending ? "Deleting…" : "Delete Guest"}
        </button>}
      </div>
      {eventId && confirming && <div id={`delete-confirm-${id}`} role="alert" className="mt-3 text-sm leading-6 text-[#843528]">
        <p>Delete {guestName}’s RSVP? This cannot be undone. Their private update link will stop working.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="min-h-11 px-3 underline" disabled={isPending || disabled} onClick={() => setConfirming(false)}>Keep RSVP</button>
          <button type="submit" name="confirm" value="delete" className="min-h-11 rounded-full border border-[#a94132]/30 px-4 font-semibold disabled:opacity-45" disabled={isPending || disabled}>{isPending ? "Deleting…" : "Yes, delete RSVP"}</button>
        </div>
      </div>}
      {state.error ? (
        <p className="mt-3 text-sm text-[#843528]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function AdminGuestForm({ mode, rsvp, event }: AdminGuestFormProps) {
  const editing = mode === "edit";
  const returnPath = event ? eventGuestsPath(event.id) : "/admin";
  const maxPartySize = event?.maxPartySize ?? 20;
  const defaultVisible = event?.guestListDefaultVisible ?? true;
  const [guestName, setGuestName] = useState(rsvp?.guestName ?? "");
  const [partySize, setPartySize] = useState(rsvp?.partySize && rsvp.partySize > maxPartySize ? "" : String(rsvp?.partySize ?? 1));
  const [comment, setComment] = useState(rsvp?.comment ?? "");
  const [deleting, setDeleting] = useState(false);
  const [attending, setAttending] = useState(rsvp?.attending ?? true);
  const [displayOnGuestList, setDisplayOnGuestList] = useState(
    rsvp?.displayOnGuestList ?? defaultVisible,
  );
  const submitAction = event
    ? editing ? updateEventGuest.bind(null, event.id, rsvp.id) : createEventGuest.bind(null, event.id, event.requestId)
    : editing
    ? updateAdminGuest.bind(null, rsvp.id)
    : createAdminGuest;
  const [state, formAction, isPending] = useActionState(
    submitAction,
    initialState,
  );
  const busy = isPending || deleting;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl tracking-[-0.02em] sm:text-2xl" href={returnPath}>
            Shindig
          </Link>
          <DashboardLink href={returnPath} label={event ? "Guest responses" : "Host Dashboard"} />
        </header>

        <section className="py-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#355f9e]">
            {event ? `${event.title} · Guest management` : "Guest management"}
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">
            {editing ? "Edit RSVP" : "Add a guest"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#202523]/58">
            {editing
              ? "Update this guest’s response and public guest-list preference."
              : "Add a response on behalf of a guest."}
          </p>
          {event && <p className="mt-2 text-xs leading-5 text-[#202523]/58">Saved guest changes appear immediately. No invitation or message is sent.</p>}
        </section>

        <section className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_18px_50px_rgba(41,56,53,0.10)] sm:p-8">
          <form action={formAction} onReset={(reset) => reset.preventDefault()}>
            <fieldset disabled={busy}>
              <legend className="text-xs font-bold uppercase tracking-[0.15em] text-[#202523]/50">
                RSVP status
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className={`choice-button cursor-pointer ${attending ? "choice-button-active" : ""}`}>
                  <input
                    checked={attending}
                    className="sr-only"
                    name="attending"
                    onChange={() => {
                      if (!attending) setDisplayOnGuestList(defaultVisible);
                      setAttending(true);
                    }}
                    type="radio"
                    value="true"
                  />
                  <span className="choice-dot" />
                  Attending
                </label>
                <label className={`choice-button cursor-pointer ${!attending ? "choice-button-active" : ""}`}>
                  <input
                    checked={!attending}
                    className="sr-only"
                    name="attending"
                    onChange={() => setAttending(false)}
                    type="radio"
                    value="false"
                  />
                  <span className="choice-dot" />
                  Can’t Make It
                </label>
              </div>
            </fieldset>

            <div className={`mt-5 grid gap-4 ${attending ? "sm:grid-cols-[minmax(0,1fr)_126px]" : "grid-cols-1"}`}>
              <label className="field-label">
                Guest name
                <input
                  autoComplete="off"
                  className="field-input"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  disabled={busy}
                  maxLength={120}
                  name="guestName"
                  placeholder="Guest or household name"
                  required
                  type="text"
                />
              </label>
              {attending ? (
                <label className="field-label">
                  Party size
                  <select
                    className="field-input appearance-none"
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    disabled={busy}
                    name="partySize"
                    required
                  >
                    <option value="" disabled>Choose size</option>
                    {Array.from({ length: maxPartySize }, (_, index) => index + 1).map((number) => (
                      <option key={number} value={number}>{number}</option>
                    ))}
                  </select>
                  {rsvp?.partySize && rsvp.partySize > maxPartySize ? <span className="text-xs font-normal normal-case tracking-normal">Previously {rsvp.partySize}. Choose a size within the current limit of {maxPartySize}.</span> : null}
                </label>
              ) : null}
            </div>

            <label className="field-label mt-4">
              <span>Comment <span className="normal-case tracking-normal">(optional)</span></span>
              <textarea
                className="field-input min-h-24 resize-none py-3 leading-5"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={busy}
                maxLength={1000}
                name="comment"
                placeholder="Host notes or guest comment"
                rows={3}
              />
            </label>

            {attending ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#355f9e]/12 bg-[#e9f2f8]/45 px-3.5 py-3 text-sm text-[#202523]/70">
                <input
                  checked={displayOnGuestList}
                  className="mt-0.5 size-4 shrink-0 accent-[#355f9e]"
                  disabled={busy}
                  name="displayOnGuestList"
                  onChange={(event) => setDisplayOnGuestList(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <span className="font-semibold text-[#202523]">Show on public guest list</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#202523]/55">
                    {event && !event.guestListEnabled ? "The Guest List module is off. This preference is saved for when it is enabled." : "Hidden guests still count toward the public attendance total."}
                  </span>
                </span>
              </label>
            ) : null}

            {state.error ? (
              <p className="mt-4 rounded-xl border border-[#a94132]/20 bg-[#fff0e9] px-3 py-2.5 text-center text-xs leading-5 text-[#843528]" role="alert">
                {state.error}
              </p>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                className="flex min-h-14 items-center justify-center rounded-full border border-[#202523]/18 px-5 text-xs font-bold uppercase tracking-[0.13em] text-[#202523]/65 transition hover:border-[#355f9e]/50 hover:text-[#355f9e]"
                href={returnPath}
              >
                Cancel
              </Link>
              <button className="primary-button w-full" disabled={busy} type="submit">
                {isPending ? "Saving…" : editing ? "Save Changes" : "Add Guest"}
                {!isPending ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </form>

          {editing ? <DeleteGuestForm guestName={rsvp.guestName} id={rsvp.id} eventId={event?.id} disabled={isPending} onPendingChange={setDeleting} /> : null}
        </section>
      </div>
    </main>
  );
}
