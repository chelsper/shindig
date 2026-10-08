"use client";

import { useRef, type PointerEvent } from "react";
import { artworkImageStyle, dragArtworkCrop, type ArtworkCrop as Crop, type LocalArtwork } from "../../lib/design-artwork";
import styles from "./design-studio.module.css";

export function ArtworkCrop({ artwork, crop, aspect, onChange }: { artwork: LocalArtwork; crop: Crop; aspect: number; onChange?: (crop: Crop) => void }) {
  const drag = useRef<{ id: number; x: number; y: number; crop: Crop; frame: { width: number; height: number } } | null>(null);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!onChange || !event.isPrimary || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop, frame: { width: bounds.width, height: bounds.height } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    onChange?.(dragArtworkCrop(gesture.crop, artwork, gesture.frame, event.clientX - gesture.x, event.clientY - gesture.y));
  }
  function stop(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className={`${styles.artworkCrop} ${onChange ? styles.draggableCrop : ""}`} style={{ aspectRatio: aspect }} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={() => { drag.current = null; }}>
    {/* A browser-local blob must never go through an image optimizer/server. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={artwork.url} alt="Your selected artwork" loading="lazy" draggable={false} style={artworkImageStyle(crop)} />
    {onChange && <span className={styles.cropHint} aria-hidden="true">Drag to reposition</span>}
  </div>;
}
