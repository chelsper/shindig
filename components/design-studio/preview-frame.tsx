"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DESIGN_PREVIEW_WIDTHS, fitDesignPreview, type DesignPreviewDevice } from "../../lib/design-preview";
import styles from "./design-studio.module.css";

// One fixed-width canvas, fitted to the available space without horizontal
// scrolling. Container queries respond to the canvas, not the host browser.
export function PreviewFrame({ device, children }: { device: DesignPreviewDevice; children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(() => fitDesignPreview(device, DESIGN_PREVIEW_WIDTHS[device], 0));

  useLayoutEffect(() => {
    if (!area.current || !canvas.current) return;
    const observer = new ResizeObserver(() => {
      if (!area.current || !canvas.current) return;
      const next = fitDesignPreview(device, area.current.clientWidth, canvas.current.offsetHeight);
      setFit((previous) => previous.scale === next.scale && previous.height === next.height ? previous : next);
    });
    observer.observe(area.current);
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [device]);

  return <div className={styles.previewFrame} data-device={device}>
    <div className={styles.frameBar} aria-hidden="true">
      <span className={styles.frameDots}><i /><i /><i /></span>
      <span>{device === "phone" ? "Phone" : "Desktop"} · {DESIGN_PREVIEW_WIDTHS[device]} px</span>
      <span>Sample event</span>
    </div>
    <div ref={area} className={styles.fitArea}>
      <div className={styles.fitSpace} style={{ width: fit.width, height: fit.height || undefined }}>
        <div ref={canvas} className={styles.previewCanvas} style={{ width: DESIGN_PREVIEW_WIDTHS[device], transform: `scale(${fit.scale})` }}>
          {children}
        </div>
      </div>
    </div>
  </div>;
}
