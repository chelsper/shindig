"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";

import { updateRsvp } from "../../app/rsvp/actions";
import { updateEventRsvp } from "../../app/e/actions";
import { OYSTER_ROAST_EVENT, type OysterRoastEvent } from "../../lib/oyster-roast-event";
import { CalendarActions } from "../calendar-actions";
import { EventHubLink } from "../event-hub-link";
import { RsvpsClosed } from "./rsvps-closed";
import { RsvpDeadlineNote } from "./rsvp-deadline-note";

type GuestRsvp = {
  guestName: string;
  attending: boolean;
  partySize: number | null;
  displayOnGuestList: boolean;
  comment: string | null;
};

type RsvpUpdateFormProps = {
  initialRsvp: GuestRsvp;
  token: string;
  event?: OysterRoastEvent;
};

type RsvpChoice = "attending" | "declined";

export function RsvpUpdateForm({ initialRsvp, token, event = OYSTER_ROAST_EVENT }: RsvpUpdateFormProps) {
  const eventSlug = event.slug;
  const legacy = eventSlug === OYSTER_ROAST_EVENT.slug;
  const rules = event.rsvp ?? { maxPartySize: 20, allowComments: true, guestListDefaultVisible: true };
  const repliesClosed = event.rsvpsOpen === false || event.rsvpAvailability === "deadline";
  const [choice, setChoice] = useState<RsvpChoice>(
    initialRsvp.attending ? "attending" : "declined",
  );
  const [name, setName] = useState(initialRsvp.guestName);
  const [partySize, setPartySize] = useState(String(initialRsvp.partySize ?? 1));
  const [displayOnGuestList, setDisplayOnGuestList] = useState(
    initialRsvp.displayOnGuestList,
  );
  const [comment, setComment] = useState(initialRsvp.comment ?? "");
  const [updated, setUpdated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (repliesClosed || !name.trim() || submittingRef.current) return;

    submittingRef.current = true;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const update = legacy ? updateRsvp : updateEventRsvp.bind(null, eventSlug);
        const result = await update({
          editToken: token,
          guestName: name,
          attending: choice === "attending",
          partySize: choice === "attending" ? Number(partySize) : null,
          displayOnGuestList:
            choice === "attending" ? displayOnGuestList : false,
          comment,
        });

        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        setName(result.rsvp.guestName);
        setChoice(result.rsvp.attending ? "attending" : "declined");
        setPartySize(String(result.rsvp.partySize ?? 1));
        setDisplayOnGuestList(result.rsvp.displayOnGuestList);
        setComment(result.rsvp.comment ?? "");
        setUpdated(true);
      } catch {
        setErrorMessage("We couldn’t update your RSVP. Please try again in a moment.");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-5 text-[#202523] sm:px-6 sm:py-8">
      <div className="page-texture" />
      <div className="relative mx-auto max-w-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl tracking-[-0.02em] sm:text-2xl" href={event.websiteUrl}>
            Shindig
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-full border border-[#202523]/15 bg-white/40 px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-[#202523]/65 uppercase">
              Private RSVP
            </p>
            <EventHubLink href={event.eventHub.path} />
          </div>
        </header>

        <section className="py-8 text-center sm:py-11">
          <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">
            {event.title}
          </p>
          <h1 className="font-serif mt-3 text-4xl tracking-[-0.04em] sm:text-5xl">
            {repliesClosed ? "Your RSVP" : "Update your RSVP"}
          </h1>
          <p className="mt-3 text-sm text-[#202523]/58">
            {event.dateLabel} · {event.timeLabel}
          </p>
        </section>

        <section className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_18px_50px_rgba(41,56,53,0.10)] backdrop-blur sm:p-8">
          {repliesClosed ? (
            <>
              <RsvpsClosed deadlinePassed={event.rsvpAvailability === "deadline"} />
              <p className="mt-3 text-center text-sm leading-6">
                Your saved response: {initialRsvp.attending ? `Attending · ${initialRsvp.partySize} ${initialRsvp.partySize === 1 ? "guest" : "guests"}` : "Can’t Make It"}.
              </p>
              {initialRsvp.attending && <CalendarActions editToken={token} event={event} />}
              <div className="mt-5 text-center"><EventHubLink label="View Event Hub" href={event.eventHub.path} /></div>
            </>
          ) : updated ? (
            <div aria-live="polite" className="py-4 text-center sm:py-6">
              <div className="success-mark mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[#dceaf7] text-[#214e91]">
                <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.25 4.25L19 7" />
                </svg>
              </div>
              <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">RSVP updated</p>
              <h2 className="font-serif mt-3 text-3xl tracking-[-0.03em]">
                {choice === "attending"
                  ? legacy ? "You’re on the shuck-it list!" : "You’re on the list!"
                  : legacy ? "Awww… shucks! We’ll miss you!" : "We’ll miss you!"}
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#202523]/65">
                {choice === "attending"
                  ? `${partySize === "1" ? "Your spot is" : `All ${partySize} spots are`} saved${legacy ? " for the roast" : ""}.`
                  : legacy ? "Your response has been updated. We’ll raise an oyster to you." : "Your response has been updated. Thanks for letting us know."}
              </p>
              {choice === "attending" ? (
                <>
                  <CalendarActions editToken={token} event={event} />
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#355f9e]/25 bg-[#e9f2f8]/70 px-5 text-xs font-bold uppercase tracking-[0.12em] text-[#214e91] transition hover:border-[#355f9e]/55 hover:bg-[#e9f2f8]"
                    href={event.eventHub.path}
                  >
                    View Event Hub
                  </Link>
                </>
              ) : null}
              <button
                className="primary-button mt-6 w-full"
                onClick={() => setUpdated(false)}
                type="button"
              >
                Make another change
              </button>
              <Link
                className="mt-4 inline-flex text-xs font-semibold tracking-[0.14em] text-[#202523]/55 uppercase underline decoration-[#202523]/25 underline-offset-4"
                href={event.websiteUrl}
              >
                Return to invitation
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">Your response</p>
                <h2 className="font-serif mt-1.5 text-3xl tracking-[-0.03em]">Will you join us?</h2>
                <RsvpDeadlineNote deadline={rules.deadlineAtUtc} timeZone={event.timeZone} />
              </div>
              {event.rsvpAvailability === "full" && <p className="mb-4 rounded-xl bg-[#e9f2f8] p-4 text-sm leading-6">This gathering is currently full. You can keep or reduce your saved party, or let the host know you can’t make it. Adding people needs available space.</p>}

              <fieldset disabled={isPending}>
                <legend className="sr-only">RSVP response</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    aria-pressed={choice === "attending"}
                    className={`choice-button ${choice === "attending" ? "choice-button-active" : ""}`}
                    onClick={() => {
                      if (choice === "declined") setDisplayOnGuestList(rules.guestListDefaultVisible);
                      setChoice("attending");
                    }}
                    type="button"
                  >
                    <span className="choice-dot" />
                    Attending
                  </button>
                  <button
                    aria-pressed={choice === "declined"}
                    className={`choice-button ${choice === "declined" ? "choice-button-active" : ""}`}
                    onClick={() => setChoice("declined")}
                    type="button"
                  >
                    <span className="choice-dot" />
                    Can’t Make It
                  </button>
                </div>
              </fieldset>

              <div className={`mt-5 grid gap-4 ${choice === "attending" ? "sm:grid-cols-[minmax(0,1fr)_126px]" : "grid-cols-1"}`}>
                <label className="field-label">
                  Guest name
                  <input
                    autoComplete="name"
                    className="field-input"
                    disabled={isPending}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                    required
                    type="text"
                    value={name}
                  />
                </label>
                {choice === "attending" ? (
                  <label className="field-label">
                    Number attending
                    <select
                      className="field-input appearance-none"
                      disabled={isPending}
                      onChange={(event) => setPartySize(event.target.value)}
                      value={partySize}
                    >
                      {Array.from({ length: rules.maxPartySize }, (_, index) => index + 1).map((number) => (
                        <option key={number} value={number}>{number}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {rules.allowComments && <label className="field-label mt-4">
                <span>Note <span className="normal-case tracking-normal">(optional)</span></span>
                <textarea
                  className="field-input min-h-20 resize-none py-3 leading-5"
                  disabled={isPending}
                  maxLength={1000}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  value={comment}
                />
              </label>}

              {choice === "attending" && event.features.guestList ? (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#355f9e]/12 bg-[#e9f2f8]/45 px-3.5 py-3 text-sm text-[#202523]/70">
                  <input
                    checked={displayOnGuestList}
                    className="mt-0.5 size-4 shrink-0 accent-[#355f9e]"
                    disabled={isPending}
                    onChange={(event) => setDisplayOnGuestList(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-semibold text-[#202523]">
                      Show my name on the guest list
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#202523]/55">
                      Your party still counts toward the total if you leave this unchecked.
                    </span>
                  </span>
                </label>
              ) : null}

              {errorMessage ? (
                <p aria-live="polite" className="mt-4 rounded-xl border border-[#a94132]/20 bg-[#fff0e9] px-3 py-2.5 text-center text-xs leading-5 text-[#843528]">
                  {errorMessage}
                </p>
              ) : null}

              <button
                className="primary-button mt-6 w-full"
                disabled={!name.trim() || isPending}
                type="submit"
              >
                {isPending ? "Updating RSVP…" : "Save Changes"}
                {!isPending ? <span aria-hidden="true">→</span> : null}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-[#202523]/48">
                This private link only opens your RSVP.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
