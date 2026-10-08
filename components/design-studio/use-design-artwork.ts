"use client";

import { useEffect, useRef, useState } from "react";
import { defaultArtworkCrops, replaceArtworkCrop, type ArtworkCrop, type LocalArtwork } from "../../lib/design-artwork";
import type { DesignPreviewPage } from "../../lib/design-preview";
import { loadLocalArtwork } from "../../lib/local-design-artwork";

export function useDesignArtwork() {
  const [artwork, setArtwork] = useState<LocalArtwork | null>(null);
  const [crops, setCrops] = useState(defaultArtworkCrops);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<LocalArtwork | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    if (current.current) URL.revokeObjectURL(current.current.url);
  }, []);

  async function choose(file: File) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(null);
    try {
      const next = await loadLocalArtwork(file, controller.signal);
      if (controller.signal.aborted) { URL.revokeObjectURL(next.url); return; }
      const previous = current.current;
      current.current = next;
      setArtwork(next); setCrops(defaultArtworkCrops());
      if (previous) URL.revokeObjectURL(previous.url);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We couldn’t open that image. Please try another.");
    } finally {
      if (request.current === controller && !controller.signal.aborted) setLoading(false);
    }
  }
  function remove() {
    request.current?.abort(); request.current = null;
    if (current.current) URL.revokeObjectURL(current.current.url);
    current.current = null; setArtwork(null); setCrops(defaultArtworkCrops()); setLoading(false); setError(null);
  }
  function updateCrop(page: DesignPreviewPage, crop: ArtworkCrop) {
    setCrops((previous) => replaceArtworkCrop(previous, page, crop));
  }
  return { artwork, crops, loading, error, choose, remove, updateCrop };
}
