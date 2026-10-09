export type EditorView = "edit" | "preview";

export function EditorViewToggle({ view, onChange, editPanelId, previewPanelId, editLabel = "Edit", previewLabel = "Preview" }: {
  view: EditorView; onChange: (view: EditorView) => void; editPanelId: string; previewPanelId: string; editLabel?: string; previewLabel?: string;
}) {
  return <div role="group" aria-label="Editor view" className="sticky top-0 z-20 -mx-4 mb-5 flex gap-2 border-b border-[#202523]/10 bg-[#f7f0e3]/95 px-4 py-3 backdrop-blur-sm lg:hidden">
    {(["edit", "preview"] as const).map((choice) => <button key={choice} type="button" aria-pressed={view === choice}
      aria-controls={choice === "edit" ? editPanelId : previewPanelId} onClick={() => onChange(choice)}
      className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold text-[#214e91] focus-visible:outline-2 focus-visible:outline-offset-4 ${view === choice ? "border-[#355f9e] bg-[#e9f2f8]" : "border-[#355f9e]/25 bg-[#fffaf1]"}`}>
      {choice === "edit" ? editLabel : previewLabel}
    </button>)}
  </div>;
}
