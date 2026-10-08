"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_EVENT_DESIGN, EVENT_DESIGNS, eventDesignVariables, getEventDesign, type EventDesignId } from "../../lib/event-design";
import type { DesignPreviewDevice, DesignPreviewPage } from "../../lib/design-preview";
import { DesignPreview } from "./design-preview";
import { ArtworkControls } from "./artwork-controls";
import { useDesignArtwork } from "./use-design-artwork";
import styles from "./design-studio.module.css";

export function DesignStudio() {
  const [selected, setSelected] = useState<EventDesignId>(DEFAULT_EVENT_DESIGN);
  const [page, setPage] = useState<DesignPreviewPage>("invitation");
  const [device, setDevice] = useState<DesignPreviewDevice>("phone");
  const artworkState = useDesignArtwork();
  const design = getEventDesign(selected);
  return <main className={styles.studio}>
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Shindig home">Shindig<span>.</span></Link>
        <span className={styles.prototypeLabel}>Design playground</span>
        <Link href="/" className={styles.backLink}>Back to Shindig <span aria-hidden="true">↗</span></Link>
      </header>
      <section className={styles.intro} aria-labelledby="studio-title">
        <p className={styles.eyebrow}>A little more you</p>
        <h1 id="studio-title">Set the <em>mood.</em></h1>
        <p>Every gathering has a feeling. Find yours.</p>
      </section>
      <div className={styles.workspace}>
        <aside className={styles.controls} aria-label="Invitation design controls">
          <fieldset className={styles.styleFieldset} aria-describedby="style-help">
            <legend>Choose your style</legend>
            <p id="style-help" className={styles.help}>Three considered looks. One good gathering.</p>
            <div className={styles.styleOptions}>
              {EVENT_DESIGNS.map((option, index) => <label key={option.id} className={`${styles.styleOption} ${selected === option.id ? styles.selectedOption : ""}`}>
                <input type="radio" name="event-design" value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} aria-label={option.name} aria-describedby={`style-description-${option.id}`} />
                <span className={styles.styleThumbnail} style={eventDesignVariables(option)} aria-hidden="true">
                  <span className={styles.thumbnailNumber}>0{index + 1}</span>
                  <span className={styles.thumbnailTitle}>Good<br /><em>company.</em></span>
                  <span className={styles.thumbnailRule} />
                </span>
                <span className={styles.optionCopy}>
                  <span className={styles.optionName}>{option.name}</span>
                  <span id={`style-description-${option.id}`} className={styles.optionDescription}>{option.description}</span>
                  <span className={styles.swatches} aria-hidden="true">{[option.colors.background, option.colors.ink, option.colors.accent].map((color, i) => <span key={i} style={{ backgroundColor: color }} />)}</span>
                </span>
              </label>)}
            </div>
          </fieldset>
          <section className={styles.designDetails} aria-label="Selected design details">
            <p className={styles.eyebrow}>The little details</p>
            <dl><div><dt>Palette</dt><dd>{design.paletteLabel}</dd></div><div><dt>Typography</dt><dd>{design.typographyLabel}</dd></div></dl>
            <button type="button" onClick={() => setSelected(DEFAULT_EVENT_DESIGN)} disabled={selected === DEFAULT_EVENT_DESIGN} className={styles.resetButton}>Reset to Classic <span aria-hidden="true">↺</span></button>
          </section>
          <p className={styles.localNotice}>Just trying things on. Your choice stays in this preview and resets when you leave or reload. Nothing is saved or published.</p>
        </aside>
        <section className={styles.previewSection} aria-labelledby="preview-title">
          <div className={styles.previewHeading}><h2 id="preview-title">A guest’s-eye view</h2><span aria-live="polite" aria-atomic="true">{design.name} · {page === "invitation" ? "Invitation" : "Event Hub"} · {device === "phone" ? "Phone" : "Desktop"}</span></div>
          <div className={styles.previewToolbar}>
            <fieldset className={styles.previewOptions}><legend>Preview page</legend><div>
              {([ ["invitation", "Invitation"], ["hub", "Event Hub"] ] as const).map(([value, label]) => <label key={value}>
                <input type="radio" name="preview-page" value={value} checked={page === value} onChange={() => setPage(value)} aria-controls="design-preview-content" />
                <span>{label}</span>
              </label>)}
            </div></fieldset>
            <fieldset className={styles.previewOptions}><legend>Preview size</legend><div>
              {([ ["phone", "Phone"], ["desktop", "Desktop"] ] as const).map(([value, label]) => <label key={value}>
                <input type="radio" name="preview-device" value={value} checked={device === value} onChange={() => setDevice(value)} aria-controls="design-preview-content" />
                <span>{label}</span>
              </label>)}
            </div></fieldset>
          </div>
          <ArtworkControls state={artworkState} page={page} device={device} onPageChange={setPage} />
          <div id="design-preview-content" className={styles.previewStage}>
            <DesignPreview designId={selected} page={page} device={device} artwork={artworkState.artwork} crop={artworkState.crops[page]} />
          </div>
          <p className={styles.stageCaption}>{device === "phone" ? "390 px phone" : "960 px desktop"} layout · scaled to fit. A fictional dinner party; sample actions are inactive.</p>
        </section>
      </div>
      <footer className={styles.footer}><span>Shindig · Made for getting together</span><span>Design Studio / Preview only</span></footer>
    </div>
  </main>;
}
