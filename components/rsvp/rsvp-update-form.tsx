"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";

import { updateRsvp } from "../../app/rsvp/actions";

type GuestRsvp = {
  guestName: string;
  attending: boolean;
  partySize: number | null;
  comment: string | null;
};

type RsvpUpdateFormProps = {
  initialRsvp: GuestRsvp;
  token: string;
};

type RsvpChoice = "attending" | "declined";

export function RsvpUpdateForm({ initialRsvp, token }: RsvpUpdateFormProps) {
  const [choice, setChoice] = useState<RsvpChoice>(
    initialRsvp.attending ? "attending" : "declined",
  );
  const [name, setName] = useState(initialRsvp.guestName);
  const [partySize, setPartySize] = useState(String(initialRsvp.partySize ?? 1));
  const [comment, setComment] = useState(initialRsvp.comment ?? "");
  const [updated, setUpdated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || submittingRef.current) return;

    submittingRef.current = true;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await updateRsvp({
          editToken: token,
          guestName: name,
          attending: choice === "attending",
          partySize: choice === "attending" ? Number(partySize) : null,
          comment,
        });

        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        setName(result.rsvp.guestName);
        setChoice(result.rsvp.attending ? "attending" : "declined");
        setPartySize(String(result.rsvp.partySize ?? 1));
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
        <header className="flex items-center justify-between border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl tracking-[-0.02em] sm:text-2xl" href="/">
            Shindig
          </Link>
          <p className="rounded-full border border-[#202523]/15 bg-white/40 px-3 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-[#202523]/65 uppercase">
            Private RSVP
          </p>
        </header>

        <section className="py-8 text-center sm:py-11">
          <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">
            Another Annualish Oyster Roast
          </p>
          <h1 className="font-serif mt-3 text-4xl tracking-[-0.04em] sm:text-5xl">
            Update your RSVP
          </h1>
          <p className="mt-3 text-sm text-[#202523]/58">
            Saturday, November 7, 2026 · 5:00 PM
          </p>
        </section>

        <section className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_18px_50px_rgba(41,56,53,0.10)] backdrop-blur sm:p-8">
          {updated ? (
            <div aria-live="polite" className="py-4 text-center sm:py-6">
              <div className="success-mark mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[#dceaf7] text-[#214e91]">
                <svg aria-hidden="true" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.25 4.25L19 7" />
                </svg>
              </div>
              <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">RSVP updated</p>
              <h2 className="font-serif mt-3 text-3xl tracking-[-0.03em]">
                {choice === "attending"
                  ? "You’re on the shuck-it list!"
                  : "Awww… shucks! We’ll miss you!"}
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#202523]/65">
                {choice === "attending"
                  ? `${partySize === "1" ? "Your spot is" : `All ${partySize} spots are`} saved for the roast.`
                  : "Your response has been updated. We’ll raise an oyster to you."}
              </p>
              <button
                className="primary-button mt-6 w-full"
                onClick={() => setUpdated(false)}
                type="button"
              >
                Make another change
              </button>
              <Link
                className="mt-4 inline-flex text-xs font-semibold tracking-[0.14em] text-[#202523]/55 uppercase underline decoration-[#202523]/25 underline-offset-4"
                href="/"
              >
                Return to invitation
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <p className="text-xs font-semibold tracking-[0.22em] text-[#355f9e] uppercase">Your response</p>
                <h2 className="font-serif mt-1.5 text-3xl tracking-[-0.03em]">Will you join us?</h2>
              </div>

              <fieldset disabled={isPending}>
                <legend className="sr-only">RSVP response</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    aria-pressed={choice === "attending"}
                    className={`choice-button ${choice === "attending" ? "choice-button-active" : ""}`}
                    onClick={() => setChoice("attending")}
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
                      {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
                        <option key={number} value={number}>{number}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <label className="field-label mt-4">
                <span>Note <span className="normal-case tracking-normal">(optional)</span></span>
                <textarea
                  className="field-input min-h-20 resize-none py-3 leading-5"
                  disabled={isPending}
                  maxLength={1000}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  value={comment}
                />
              </label>

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
