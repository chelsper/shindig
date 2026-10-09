/* eslint-disable @next/next/no-img-element -- Draft images require host cookies; published images use our guarded route, never the image optimizer. */
import type { ReactNode } from "react";
import { eventDesignVariables, getEventDesign } from "../../lib/event-design";
import { artworkImageStyle, type ArtworkCrop } from "../../lib/design-artwork";
import type { EventAppearance } from "../../lib/event-appearance";
import styles from "./event-presentation.module.css";

export type PresentationDetails = { title: string; eyebrow: string; date: string; time: string; venue: string; address: string; description: string };
type Image = { url: string; alt: string; crop: ArtworkCrop };
type Props = { appearance: EventAppearance; details: PresentationDetails; image: Image; children?: ReactNode; actions?: ReactNode; preview?: boolean };

export function EventDesignSurface({ appearance, children, fullHeight = false }: { appearance: EventAppearance; children: ReactNode; fullHeight?: boolean }) {
  return <div className={styles.surface} data-event-design={appearance.style} style={{ ...eventDesignVariables(getEventDesign(appearance.style)), ...(fullHeight ? { minHeight: "100svh" } : {}) }}>{children}</div>;
}
export function EventGuestContent({ children }: { children: ReactNode }) {
  return <div className={styles.guestContent}>{children}</div>;
}
export function EventArtwork({ image, view }: { image: Image; view: "invitation" | "hub" }) {
  return <div className={`${styles.image} ${view === "invitation" ? styles.invitationImage : styles.hubImage}`}>
    <img src={image.url} alt={image.alt} style={artworkImageStyle(image.crop)} />
  </div>;
}
function Details({ details }: { details: PresentationDetails }) {
  return <dl className={styles.details}>
    <div><dt>When</dt><dd>{details.date}</dd>{details.time && <dd>{details.time}</dd>}</div>
    <div><dt>Where</dt><dd>{details.venue}</dd>{details.address && <dd>{details.address}</dd>}</div>
  </dl>;
}
export function DesignedInvitation({ appearance, details, image, children, actions, preview }: Props) {
  return <EventDesignSurface appearance={appearance} fullHeight={!preview}><div className={styles.page}>
    <div className={styles.wordmark}><span>Shindig.</span><div className={styles.guestContent}>{preview ? "Private preview" : actions}</div></div>
    <div className={styles.invitation}><div className={styles.invitationInner}>
      <div className={styles.identity}>{image.url ? <EventArtwork image={image} view="invitation" /> : <div className={styles.typographicArt} aria-hidden="true"><span>✳</span>Good people.<br />A little time together.</div>}</div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{details.eyebrow}</p><h1>{details.title}</h1>
        <Details details={details} />
        {details.description && <p className={styles.description}>{details.description}</p>}
        <div className={styles.guestContent}>{children}</div>
      </div>
    </div></div><p className={styles.footer}>Good people. Great gatherings.</p>
  </div></EventDesignSurface>;
}
export function DesignedHub({ appearance, details, image, children, actions, preview }: Props) {
  return <EventDesignSurface appearance={appearance} fullHeight={!preview}><div className={`${styles.page} ${styles.hubPage}`}>
    <div className={styles.wordmark}><span>Shindig.</span><span>{preview ? "Private preview" : "Good people. Great gatherings."}</span></div>
    <header className={styles.hubHeader}>
      {image.url ? <EventArtwork image={image} view="hub" /> : <div className={styles.hubIdentity} aria-hidden="true">A reason to gather <span>✳</span></div>}
      <div className={styles.hubContent}><div><p className={styles.eyebrow}>The Event Hub</p><h1>{details.title}</h1><p className={styles.hosts}>{details.eyebrow}</p></div><Details details={details} />
        <div className={`${styles.actions} ${styles.guestContent}`}>{actions}</div>
      </div>
    </header>
    <div className={`${styles.modules} ${styles.guestContent}`}>{children}</div>
    <p className={styles.footer}>A little planning. A lovely evening.</p>
  </div></EventDesignSurface>;
}
