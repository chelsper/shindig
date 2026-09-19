"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { ChangeEvent, FormEvent, useActionState, useRef, useState } from "react";

import {
  saveEventHeaderSettings,
  type EventHeaderActionState,
} from "../../app/admin/event/actions";
import {
  DEFAULT_EVENT_HUB_HEADER,
  type EventHubHeaderSettings,
} from "../../lib/event-hub-settings";
import { OYSTER_ROAST_EVENT } from "../../lib/oyster-roast-event";
import { EventHeaderImage } from "../event-hub/event-header-image";
import { DashboardLink } from "./dashboard-link";

type EventHeaderEditorProps = {
  initialSettings: EventHubHeaderSettings;
  uploadConfigured: boolean;
};

const initialActionState: EventHeaderActionState = {
  error: null,
  success: false,
};
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function EventHeaderEditor({
  initialSettings,
  uploadConfigured,
}: EventHeaderEditorProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [actionState, formAction, isSaving] = useActionState(
    saveEventHeaderSettings,
    initialActionState,
  );

  const updateNumber = (
    key: "focalX" | "focalY" | "zoomPercent",
    value: string,
  ) => {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  };

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadError(null);
    setUploadStatus(null);
    setUploadProgress(0);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError("Choose a JPG, PNG, WebP, or AVIF image.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError("Choose an image smaller than 10 MB.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || isUploading || !uploadConfigured) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      const filename = safeFilename(selectedFile.name) || "event-header";
      const blob = await upload(
        `event-hub/${OYSTER_ROAST_EVENT.slug}/${filename}`,
        selectedFile,
        {
          access: "public",
          handleUploadUrl: "/api/admin/event-header/upload",
          multipart: true,
          onUploadProgress: ({ percentage }) =>
            setUploadProgress(Math.round(percentage)),
        },
      );

      setSettings((current) => ({ ...current, imageUrl: blob.url }));
      setUploadStatus("Image uploaded. Adjust the crop, then save the header.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setUploadError("The image could not be uploaded. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function resetArtwork() {
    setSettings(DEFAULT_EVENT_HUB_HEADER);
    setUploadError(null);
    setUploadStatus("Original invitation artwork restored in the preview. Save to publish it.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f0e3] px-4 py-6 text-[#202523] sm:px-6 sm:py-9">
      <div aria-hidden="true" className="page-texture" />
      <div className="relative mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#202523]/12 pb-5">
          <Link className="font-serif text-xl tracking-[-0.02em] sm:text-2xl" href="/admin">
            Shindig
          </Link>
          <DashboardLink />
        </header>

        <section className="py-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#355f9e]">
            Event Hub
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] sm:text-5xl">
            Header image
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#202523]/58">
            Upload artwork and tune how it is framed across phone and desktop layouts.
            The invitation page artwork is not changed.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
          <section className="self-start overflow-hidden rounded-[1.75rem] border border-[#202523]/10 bg-[#fffaf1]/90 shadow-[0_18px_50px_rgba(41,56,53,0.10)]">
            <EventHeaderImage settings={settings} />
            <div className="p-4 sm:p-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#202523]/45">Live crop preview</p>
              <p className="mt-1 text-xs leading-5 text-[#202523]/55">
                The Event Hub uses a taller crop on phones and a wider crop on larger screens.
              </p>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)]">
              <h2 className="font-serif text-2xl">Replace artwork</h2>
              {uploadConfigured ? (
                <form className="mt-4" onSubmit={uploadImage}>
                  <label className="field-label">
                    Image file
                    <input
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="field-input cursor-pointer py-3 file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f2f8] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#214e91]"
                      disabled={isUploading}
                      onChange={selectFile}
                      ref={fileInputRef}
                      type="file"
                    />
                  </label>
                  <button
                    className="mt-3 min-h-11 w-full rounded-full border border-[#355f9e]/30 bg-[#e9f2f8]/80 px-5 text-xs font-bold uppercase tracking-[0.11em] text-[#214e91] transition hover:border-[#355f9e] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!selectedFile || isUploading}
                    type="submit"
                  >
                    {isUploading ? `Uploading ${uploadProgress}%` : "Upload Image"}
                  </button>
                </form>
              ) : (
                <p className="mt-4 rounded-xl border border-[#b78228]/20 bg-[#fff4d8] px-3.5 py-3 text-xs leading-5 text-[#765319]">
                  Image uploads will be available after a Vercel Blob store is connected. Crop controls and the original artwork remain available now.
                </p>
              )}

              {uploadError ? <p className="mt-3 text-xs leading-5 text-[#843528]" role="alert">{uploadError}</p> : null}
              {uploadStatus ? <p className="mt-3 text-xs leading-5 text-[#285630]">{uploadStatus}</p> : null}
              <button
                className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-[#202523]/55 underline decoration-[#202523]/20 underline-offset-4"
                onClick={resetArtwork}
                type="button"
              >
                Use original artwork
              </button>
            </section>

            <form action={formAction} className="rounded-[1.5rem] border border-[#202523]/10 bg-[#fffaf1]/90 p-5 shadow-[0_14px_40px_rgb(32_37_35_/_0.05)]">
              <input name="imageUrl" type="hidden" value={settings.imageUrl} />
              <h2 className="font-serif text-2xl">Adjust crop</h2>

              <label className="field-label mt-4">
                Image description
                <input
                  className="field-input"
                  maxLength={180}
                  name="imageAlt"
                  onChange={(event) => setSettings((current) => ({ ...current, imageAlt: event.target.value }))}
                  required
                  type="text"
                  value={settings.imageAlt}
                />
              </label>

              <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#202523]/60">
                Horizontal focus <span className="float-right text-[#355f9e]">{settings.focalX}%</span>
                <input className="mt-2 w-full accent-[#355f9e]" max="100" min="0" name="focalX" onChange={(event) => updateNumber("focalX", event.target.value)} type="range" value={settings.focalX} />
              </label>

              <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#202523]/60">
                Vertical focus <span className="float-right text-[#355f9e]">{settings.focalY}%</span>
                <input className="mt-2 w-full accent-[#355f9e]" max="100" min="0" name="focalY" onChange={(event) => updateNumber("focalY", event.target.value)} type="range" value={settings.focalY} />
              </label>

              <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-[#202523]/60">
                Zoom <span className="float-right text-[#355f9e]">{settings.zoomPercent}%</span>
                <input className="mt-2 w-full accent-[#355f9e]" max="200" min="100" name="zoomPercent" onChange={(event) => updateNumber("zoomPercent", event.target.value)} type="range" value={settings.zoomPercent} />
              </label>

              {actionState.error ? (
                <p className="mt-4 rounded-xl border border-[#a94132]/20 bg-[#fff0e9] px-3 py-2.5 text-center text-xs leading-5 text-[#843528]" role="alert">
                  {actionState.error}
                </p>
              ) : null}
              {actionState.success ? (
                <p className="mt-4 rounded-xl border border-[#285630]/15 bg-[#edf7ed] px-3 py-2.5 text-center text-xs leading-5 text-[#285630]" role="status">
                  Header saved and published to the Event Hub.
                </p>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <button className="primary-button w-full" disabled={isSaving || isUploading} type="submit">
                  {isSaving ? "Saving…" : "Save Header"}
                  {!isSaving ? <span aria-hidden="true">→</span> : null}
                </button>
                <Link className="flex min-h-12 items-center justify-center text-xs font-bold uppercase tracking-[0.11em] text-[#202523]/55 underline decoration-[#202523]/20 underline-offset-4" href={OYSTER_ROAST_EVENT.eventHub.path} rel="noopener noreferrer" target="_blank">
                  View Event Hub
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
