import type { DraftImageKind } from "../../lib/event-draft-artwork";

// This control is supplied only by the private artwork editor. A native button
// keeps the entire image selectable with touch, mouse, Enter or Space.
export function ArtworkPreviewAction({ kind, disabled = false, onSelect }: { kind: DraftImageKind; disabled?: boolean; onSelect: (kind: DraftImageKind) => void }) {
  const label = kind === "header" ? "Edit Event Hub header" : "Edit invitation image";
  return <button type="button" aria-label={label} aria-controls={`artwork-${kind}-controls`} disabled={disabled}
    onClick={() => { if (!disabled) onSelect(kind); }}
    className="absolute inset-0 z-10 flex min-h-11 w-full cursor-pointer items-end justify-end rounded-[inherit] border-2 border-transparent p-3 text-left hover:border-[#355f9e] focus-visible:border-[#355f9e] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white disabled:cursor-wait">
    <strong className="rounded-full bg-[#202523] px-4 py-3 font-sans text-xs font-semibold tracking-normal text-[#fffaf1] normal-case shadow-md">{label} <span aria-hidden="true" style={{ fontSize: "inherit", margin: 0 }}>↗</span></strong>
  </button>;
}
