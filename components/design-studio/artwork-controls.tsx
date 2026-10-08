"use client";

import { ARTWORK_TYPES, ARTWORK_ZOOM_MAX, artworkAspect, defaultArtworkCrop, type ArtworkCrop as Crop } from "../../lib/design-artwork";
import type { DesignPreviewDevice, DesignPreviewPage } from "../../lib/design-preview";
import type { useDesignArtwork } from "./use-design-artwork";
import { ArtworkCrop } from "./artwork-crop";
import styles from "./design-studio.module.css";

export function ArtworkControls({ state, page, device, onPageChange }: { state: ReturnType<typeof useDesignArtwork>; page: DesignPreviewPage; device: DesignPreviewDevice; onPageChange: (page: DesignPreviewPage) => void }) {
  const crop = state.crops[page];
  const name = page === "invitation" ? "invitation" : "Hub header";
  return <details className={styles.artworkTools}>
    <summary><span>Artwork &amp; framing</span><span>{state.artwork ? "Adjust your image" : "Choose an image"}</span></summary>
    <div className={styles.artworkToolBody}>
      <div className={styles.artworkSource}>
        <p>One image, two ways to welcome people.</p>
        <p className={styles.artworkHelp}>Stays on this device. Nothing is uploaded or saved.</p>
        <label className={styles.chooseArtwork}>
          <input type="file" accept={ARTWORK_TYPES.join(",")} aria-label="Choose artwork" aria-describedby="artwork-file-help" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void state.choose(file); }} />
          <span>{state.artwork ? "Replace artwork" : "Choose artwork"} <span aria-hidden="true">↗</span></span>
        </label>
        <p id="artwork-file-help" className={styles.artworkHelp}>JPG, PNG or WebP · up to 10 MB / 40 MP</p>
        <p role="status" className={styles.artworkHelp}>{state.loading ? "Opening your image…" : state.artwork ? `${state.artwork.name} · ${state.artwork.width} × ${state.artwork.height}` : "Choose an image to try it in both previews."}</p>
        {state.error && <p role="alert" className={styles.artworkError}>{state.error} {state.artwork && "Your previous image is still in place."}</p>}
        {state.artwork && <button type="button" className={styles.resetButton} onClick={state.remove}>Remove artwork</button>}
      </div>
      {state.artwork && <div className={styles.cropTools}>
        <fieldset className={styles.previewOptions}><legend>Crop for</legend><div>
          {([ ["invitation", "Invitation artwork"], ["hub", "Hub header"] ] as const).map(([value, label]) => <label key={value}><input type="radio" name="artwork-crop-page" value={value} checked={page === value} onChange={() => onPageChange(value)} /><span>{label}</span></label>)}
        </div></fieldset>
        <p className={styles.artworkHelp}>{device === "phone" ? "Phone" : "Desktop"} framing · Drag the image or use the sliders. Your other crop is kept.</p>
        <div className={styles.cropEditor}>
          <ArtworkCrop key={`${state.artwork.url}:${page}:${device}`} artwork={state.artwork} crop={crop} aspect={artworkAspect(page, device)} onChange={(next) => state.updateCrop(page, next)} />
        </div>
        <div className={styles.cropSliders}>
          {([ ["zoom", "Zoom", 100, ARTWORK_ZOOM_MAX, 5], ["x", "Horizontal position", 0, 100, 1], ["y", "Vertical position", 0, 100, 1] ] as const).map(([key, label, min, max, step]) => <label key={key}>
            <span>{label}<output>{crop[key]}%</output></span>
            <input type="range" min={min} max={max} step={step} value={crop[key]} aria-label={label} onChange={(event) => state.updateCrop(page, { ...crop, [key]: Number(event.target.value) } as Crop)} />
          </label>)}
        </div>
        <p className={styles.artworkHelp}>Zoom in for more room to reposition. Check both preview sizes; the Hub has a wider desktop crop.</p>
        <button type="button" className={styles.resetButton} onClick={() => state.updateCrop(page, defaultArtworkCrop())}>Reset {name} crop</button>
      </div>}
    </div>
  </details>;
}
