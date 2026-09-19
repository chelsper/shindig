"use client";

import Link from "next/link";
import { FormEvent, useActionState, useState } from "react";

import {
  createAdminGuest,
  deleteAdminGuest,
  updateAdminGuest,
  type AdminGuestActionState,
} from "../../app/admin/actions";
import type { AdminRsvp } from "../../lib/server/rsvps";
import { DashboardLink } from "./dashboard-link";

type AdminGuestFormProps =
  | { mode: "create"; rsvp?: never }
  | { mode: "edit"; rsvp: AdminRsvp };

const initialState: AdminGuestActionState = { error: null };

function DeleteGuestForm({ id, guestName }: { id: string; guestName: string }) {
  const deleteAction = deleteAdminGuest.bind(null, id);
  const [state, formAction, isPending] = useActionState(
    deleteAction,
    initialState,
  );

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
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
        <button
          className="min-h-11 shrink-0 rounded-full border border-[#a94132]/30 px-5 text-xs font-bold uppercase tracking-[0.11em] text-[#843528] transition hover:border-[#a94132] hover:bg-[#fff0e9] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Deleting…" : "Delete Guest"}
        </button>
      </div>
      {state.error ? (
        <p className="mt-3 text-sm text-[#843528]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function AdminGuestForm({ mode, rsvp }: AdminGuestFormProps) {
  const editing = mode === "edit";
  const [attending, setAttending] = useState(rsvp?.attending ?? true);
  const [displayOnGuestList, setDisplayOnGuestList] = useState(
    rsvp?.displayOnGuestList ?? true,
  );
  const submitAction = editing
    ? updateAdminGuest.bind(null, rsvp.id)
    : createAdminGuest;
  const [state, formAction, isPending] = useActionState(
    submitAction,
    initialState,
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl tracking-[-0.02em] sm:text-2xl" href="/admin">
            Shindig
          </Link>
          <DashboardLink />
        </header>

        <section className="py-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#355f9e]">
            Guest management
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">
            {editing ? "Edit RSVP" : "Add a guest"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#202523]/58">
            {editing
              ? "Update this guest’s response and public guest-list preference."
              : "Add a response on behalf of a guest."}
          </p>
        </section>

        <section className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_18px_50px_rgba(41,56,53,0.10)] sm:p-8">
          <form action={formAction}>
            <fieldset disabled={isPending}>
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
                      if (!attending) setDisplayOnGuestList(true);
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
                  defaultValue={rsvp?.guestName ?? ""}
                  disabled={isPending}
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
                    defaultValue={String(rsvp?.partySize ?? 1)}
                    disabled={isPending}
                    name="partySize"
                  >
                    {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
                      <option key={number} value={number}>{number}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <label className="field-label mt-4">
              <span>Comment <span className="normal-case tracking-normal">(optional)</span></span>
              <textarea
                className="field-input min-h-24 resize-none py-3 leading-5"
                defaultValue={rsvp?.comment ?? ""}
                disabled={isPending}
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
                  disabled={isPending}
                  name="displayOnGuestList"
                  onChange={(event) => setDisplayOnGuestList(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <span className="font-semibold text-[#202523]">Show on public guest list</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#202523]/55">
                    Hidden guests still count toward the public attendance total.
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
                href="/admin"
              >
                Cancel
              </Link>
              <button className="primary-button w-full" disabled={isPending} type="submit">
                {isPending ? "Saving…" : editing ? "Save Changes" : "Add Guest"}
                {!isPending ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </form>

          {editing ? <DeleteGuestForm guestName={rsvp.guestName} id={rsvp.id} /> : null}
        </section>
      </div>
    </main>
  );
}
