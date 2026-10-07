"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { eventPaths } from "../../lib/event-routes";
import { SHINDIG_SITE } from "../../lib/site";
const subscribe = () => () => {};

export function EventSharePanel({ id, publicSlug, title, rsvpsOpen }: { id: string; publicSlug: string; title: string; rsvpsOpen: boolean }) {
  const [target, setTarget] = useState<"invitation" | "hub">("invitation"), [message, setMessage] = useState("");
  const [showQr, setShowQr] = useState(false), [qrError, setQrError] = useState(false), [pending, setPending] = useState(false);
  const busy = useRef(false);
  const canShare = useSyncExternalStore(subscribe, () => typeof navigator.share === "function", () => false);
  const path = eventPaths(publicSlug)[target], url = new URL(path, SHINDIG_SITE.url).toString();
  const label = target === "invitation" ? "Invitation" : "Event Hub";
  const qr = `/admin/events/${id}/share/qr?target=${target}`;
  const buttonBase = "inline-flex min-h-12 items-center justify-center rounded-full border border-[#355f9e]/30 px-5 text-sm font-semibold disabled:opacity-50";
  const button = `${buttonBase} text-[#355f9e]`;
  async function download(format: "png" | "svg") {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch(`${qr}&format=${format}`);
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith(format === "png" ? "image/png" : "image/svg+xml")) throw new Error("QR unavailable");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = objectUrl; link.download = `shindig-${publicSlug}-${target}.${format}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      setMessage(`${label} QR download started. Keep the white border intact when printing.`);
    } catch { setMessage("The QR code couldn’t download. Check your host session and that this event is still published, then try again."); }
    finally { busy.current = false; setPending(false); }
  }
  return <section aria-label="Share your event" className="rounded-3xl border border-[#285630]/20 bg-[#eff5e8] p-5 sm:p-7">
    <h2 className="font-serif text-3xl">Your gathering is live</h2>
    <p className="mt-2 text-sm leading-6">{rsvpsOpen ? "Send the invitation for RSVPs, or the Hub for all the plans." : "RSVPs and guest edits are closed; guests can still visit the invitation and Hub."}</p>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Choose a link to share">{([['invitation', 'Invitation'], ['hub', 'Event Hub']] as const).map(([key, text]) => <button key={key} type="button" aria-pressed={target === key} disabled={pending} className={`${buttonBase} ${target === key ? "bg-[#355f9e] text-white" : "bg-white/60 text-[#355f9e]"}`} onClick={() => { setTarget(key); setMessage(""); setQrError(false); }}>{text}</button>)}</div>
    <a className="mt-4 block break-all text-sm leading-6 text-[#214e91] underline underline-offset-4" href={path} target="_blank" rel="noreferrer">{url} ↗</a>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={button} type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage(`${label} link copied.`); } catch { setMessage("Copy isn’t available here. Select and copy the link above."); } }}>Copy link</button>
      {canShare && <button className={button} type="button" onClick={async () => { try { await navigator.share({ title, text: `${title} · ${label}`, url }); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Sharing isn’t available here. Use Copy link instead."); } }}>Share link</button>}
      <button className={button} type="button" aria-expanded={showQr} onClick={() => { setShowQr(!showQr); setQrError(false); }}>{showQr ? "Hide QR code" : "Get QR code"}</button>
    </div>
    {showQr && <div className="mt-5 rounded-2xl border border-[#202523]/10 bg-[#fffaf1] p-4">
      <p className="text-sm font-semibold">Scan for the {label === "Invitation" ? "invitation" : "Event Hub"}</p>
      {qrError ? <p role="status" className="mt-3 text-sm leading-6">The QR preview couldn’t load. Check your host session and refresh to try again.</p> : <Image key={qr} src={`${qr}&format=png`} alt={`${label} QR code for ${title}`} width={220} height={220} unoptimized className="mx-auto my-4 h-auto max-w-full" onError={() => setQrError(true)} />}
      <div className="flex flex-wrap justify-center gap-2"><button className={button} type="button" disabled={pending} onClick={() => void download("png")}>{pending ? "Preparing…" : "Download PNG"}</button><button className={button} type="button" disabled={pending} onClick={() => void download("svg")}>Download SVG</button></div>
      <p className="mt-3 text-xs leading-5 text-[#202523]/65">For invitations or signs. Keep the white border and test a scan before printing. No guest information or private RSVP edit link is included.</p>
    </div>}
    {message && <p role="status" className="mt-4 text-sm leading-6">{message}</p>}
    <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#355f9e] underline underline-offset-4" href={`/admin/events/${id}/guests`}>View event responses →</Link>
    <p className="mt-3 text-xs leading-5">Links stay fixed after publication. Archiving or unpublishing makes both links and printed QR destinations unavailable. No invitations or messages are sent automatically.</p>
  </section>;
}
