"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";

import { submitRsvp } from "../app/actions";
import { CalendarActions } from "./calendar-actions";
import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";
import { createRsvpEditToken } from "../lib/rsvp-edit-token";

type RsvpChoice = "attending" | "declined" | null;

const oysterRoastEvent = OYSTER_ROAST_EVENT;

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s7-6.15 7-12A7 7 0 1 0 5 9c0 5.85 7 12 7 12Z"
      />
      <circle cx="12" cy="9" r="2.25" />
    </svg>
  );
}

type InvitationPageProps = {
  persistenceDisabled: boolean;
};

export function InvitationPage({ persistenceDisabled }: InvitationPageProps) {
  const [choice, setChoice] = useState<RsvpChoice>(null);
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submissionPersisted, setSubmissionPersisted] = useState(true);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submissionIdRef = useRef<string | null>(null);
  const editTokenRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  function resetSubmissionIdentity() {
    submissionIdRef.current = null;
    editTokenRef.current = null;
  }

  function handleChoice(nextChoice: Exclude<RsvpChoice, null>) {
    setChoice(nextChoice);
    setSubmitted(false);
    setErrorMessage(null);
    resetSubmissionIdentity();
  }

  function handleNameChange(nextName: string) {
    setName(nextName);
    if (!isPending) resetSubmissionIdentity();
  }

  function handlePartySizeChange(nextPartySize: string) {
    setPartySize(nextPartySize);
    if (!isPending) resetSubmissionIdentity();
  }

  function handleCommentChange(nextComment: string) {
    setComment(nextComment);
    if (!isPending) resetSubmissionIdentity();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!choice || !name.trim() || submittingRef.current) return;

    const submissionId = submissionIdRef.current ?? crypto.randomUUID();
    const nextEditToken = editTokenRef.current ?? createRsvpEditToken();
    submissionIdRef.current = submissionId;
    editTokenRef.current = nextEditToken;
    submittingRef.current = true;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await submitRsvp({
          submissionId,
          editToken: nextEditToken,
          eventSlug: oysterRoastEvent.slug,
          guestName: name,
          attending: choice === "attending",
          partySize: choice === "attending" ? Number(partySize) : null,
          comment,
        });

        if (!result.ok) {
          setErrorMessage(result.message);
          return;
        }

        setSubmissionPersisted(result.persisted);
        setEditToken(result.editToken);
        setName(result.rsvp.guestName);
        setChoice(result.rsvp.attending ? "attending" : "declined");
        setPartySize(String(result.rsvp.partySize ?? 1));
        setComment(result.rsvp.comment ?? "");
        setSubmitted(true);
      } catch {
        setErrorMessage("We couldn’t save your RSVP. Please try again in a moment.");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function changeResponse() {
    setSubmitted(false);
    setErrorMessage(null);
    resetSubmissionIdentity();
    setEditToken(null);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f0e3] text-[#202523]">
      <div aria-hidden="true" className="page-texture" />

      <div className="relative mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <header className="mb-5 flex items-center justify-between sm:mb-7">
          <p className="font-serif text-xl tracking-[-0.02em] sm:text-2xl">Shindig</p>
          <p className="rounded-full border border-[#202523]/15 bg-white/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#202523]/65 sm:text-xs">
            {oysterRoastEvent.cityLabel}
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(370px,0.84fr)] lg:gap-10">
          <section aria-label="Oyster roast invitation artwork" className="relative">
            <div className="hero-frame relative mx-auto max-w-[680px] overflow-hidden rounded-[1.75rem] bg-white shadow-[0_24px_70px_rgba(41,56,53,0.16)] sm:rounded-[2.25rem] lg:max-w-none">
              <Image
                src="/oyster-roast-invitation.png"
                alt={`Illustrated invitation for ${oysterRoastEvent.title}, featuring oysters, seafood platters, and blue stripes`}
                width={1429}
                height={2000}
                className="h-auto w-full"
                priority
                sizes="(min-width: 1024px) 57vw, 100vw"
              />
            </div>
            <div aria-hidden="true" className="shell-stamp">
              EST.<br />2026
            </div>
          </section>

          <section className="lg:sticky lg:top-8">
            <div className="mb-6 px-1 sm:mb-7">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#355f9e]">
                You’re invited
              </p>
              <h1 className="max-w-xl font-serif text-[2.65rem] leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-[3.4rem]">
                {oysterRoastEvent.title}
              </h1>

              <div className="mt-6 grid gap-3 border-y border-[#202523]/15 py-5 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div className="flex items-start gap-3">
                  <CalendarIcon />
                  <div>
                    <p className="font-semibold">{oysterRoastEvent.dateLabel}</p>
                    <p className="mt-0.5 text-[#202523]/62">{oysterRoastEvent.timeLabel} until the shells run out</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PinIcon />
                  <div>
                    <p className="font-semibold">{oysterRoastEvent.venue}</p>
                    <p className="mt-0.5 text-[#202523]/62">{oysterRoastEvent.address}</p>
                  </div>
                </div>
              </div>

              <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#202523]/72 sm:text-base">
                Oysters on the fire, cold drinks in hand, and plenty of good food to go around. Come casual, come hungry, and stay awhile.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_18px_50px_rgba(41,56,53,0.10)] backdrop-blur sm:p-7">
              {submitted ? (
                <div aria-live="polite" className="py-3 text-center sm:py-5">
                  <div className="success-mark mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#dceaf7] text-[#214e91]">
                    <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.25 4.25L19 7" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#355f9e]">RSVP received</p>
                  <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
                    {choice === "attending"
                      ? "You’re on the shuck-it list!"
                      : "Awww… shucks! We’ll miss you!"}
                  </h2>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#202523]/65">
                    {choice === "attending"
                      ? `${partySize === "1" ? "Your spot is" : `All ${partySize} spots are`} saved for the roast.`
                      : "Thanks for letting us know. We’ll raise an oyster to you."}
                  </p>

                  {!submissionPersisted && (
                    <p className="mx-auto mt-4 max-w-sm rounded-xl border border-[#b78228]/25 bg-[#fff4d8] px-3 py-2 text-xs leading-5 text-[#765319]">
                      Development preview — this RSVP was not saved because DATABASE_URL is not set.
                    </p>
                  )}

                  {choice === "attending" && (
                    <CalendarActions editToken={editToken} />
                  )}

                  {editToken ? (
                    <div className="mt-5 rounded-xl border border-[#355f9e]/15 bg-[#e9f2f8]/65 px-4 py-3">
                      <p className="text-xs leading-5 text-[#214e91]/75">
                        Save this private link if you need to change your response later.
                      </p>
                      <Link
                        className="mt-2 inline-flex text-xs font-bold uppercase tracking-[0.14em] text-[#214e91] underline decoration-[#214e91]/30 underline-offset-4 transition hover:decoration-[#214e91]"
                        href={`/rsvp/${editToken}`}
                      >
                        Update RSVP
                      </Link>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={changeResponse}
                      className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#202523]/55 underline decoration-[#202523]/25 underline-offset-4 transition hover:text-[#202523]"
                    >
                      Change response
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#355f9e]">Kindly reply</p>
                      <h2 className="mt-1.5 font-serif text-3xl tracking-[-0.03em]">Will you join us?</h2>
                    </div>
                    <span aria-hidden="true" className="text-2xl">◌</span>
                  </div>

                  <fieldset disabled={isPending}>
                    <legend className="sr-only">RSVP response</legend>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        aria-pressed={choice === "attending"}
                        onClick={() => handleChoice("attending")}
                        className={`choice-button ${choice === "attending" ? "choice-button-active" : ""}`}
                      >
                        <span className="choice-dot" />
                        Attending
                      </button>
                      <button
                        type="button"
                        aria-pressed={choice === "declined"}
                        onClick={() => handleChoice("declined")}
                        className={`choice-button ${choice === "declined" ? "choice-button-active" : ""}`}
                      >
                        <span className="choice-dot" />
                        Can’t Make It
                      </button>
                    </div>
                  </fieldset>

                  {choice && (
                    <div className="mt-5">
                      <div
                        className={`grid gap-4 ${
                          choice === "attending"
                            ? "sm:grid-cols-[minmax(0,1fr)_126px] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_126px]"
                            : "grid-cols-1"
                        }`}
                      >
                        <label className="field-label">
                          Guest name
                          <input
                            autoComplete="name"
                            className="field-input"
                            disabled={isPending}
                            maxLength={120}
                            name="name"
                            onChange={(event) => handleNameChange(event.target.value)}
                            placeholder="Your full name"
                            required
                            type="text"
                            value={name}
                          />
                        </label>
                        {choice === "attending" && (
                          <label className="field-label">
                            Number attending
                            <select
                              className="field-input appearance-none"
                              disabled={isPending}
                              name="partySize"
                              onChange={(event) => handlePartySizeChange(event.target.value)}
                              value={partySize}
                            >
                              {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
                                <option key={number} value={number}>
                                  {number}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>

                      <label className="field-label mt-4">
                        <span>
                          Note <span className="normal-case tracking-normal">(optional)</span>
                        </span>
                        <textarea
                          className="field-input min-h-20 resize-none py-3 leading-5"
                          disabled={isPending}
                          maxLength={1000}
                          name="comment"
                          onChange={(event) => handleCommentChange(event.target.value)}
                          placeholder="Anything we should know?"
                          rows={2}
                          value={comment}
                        />
                      </label>
                    </div>
                  )}

                  {errorMessage && (
                    <p
                      aria-live="polite"
                      className="mt-4 rounded-xl border border-[#a94132]/20 bg-[#fff0e9] px-3 py-2.5 text-center text-xs leading-5 text-[#843528]"
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!choice || !name.trim() || isPending}
                    className="primary-button mt-6 w-full"
                  >
                    {isPending ? "Saving RSVP…" : "Submit RSVP"}
                    {!isPending && <span aria-hidden="true">→</span>}
                  </button>

                  {persistenceDisabled ? (
                    <p className="mt-3 rounded-xl border border-[#b78228]/25 bg-[#fff4d8] px-3 py-2 text-center text-[11px] leading-5 text-[#765319]">
                      Development preview — DATABASE_URL is not set, so RSVPs will not be saved.
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-[11px] leading-5 text-[#202523]/48">
                      Your response will be saved securely.
                    </p>
                  )}
                </form>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-[#202523]/12 px-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#202523]/45 sm:mt-12">
          <span>Shuck · Sip · Stay awhile</span>
          <span>November ’26</span>
        </footer>
      </div>
    </main>
  );
}
