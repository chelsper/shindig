import { eventDesignVariables, getEventDesign, type EventDesignId } from "../../lib/event-design";
import { DESIGN_PREVIEW_EVENT as event } from "../../lib/design-preview";
import styles from "./design-studio.module.css";

// A deliberately fictional sample. Never import a real event, guest, RSVP
// action or host data into this account-free public prototype.
export function InvitationDesignPreview({ designId }: { designId: EventDesignId }) {
  const design = getEventDesign(designId);
  return <article className={styles.invitation} style={eventDesignVariables(design)} data-design={design.id} aria-label={`${design.name} sample invitation — visual preview only`}>
    <div className={styles.invitationBorder}>
      <div className={styles.invitationIdentity}>
      <div className={styles.invitationTopline}><span>A reason to gather</span><span aria-hidden="true">No. 01</span></div>
      <div className={styles.ornament} aria-hidden="true">
        <span className={styles.ornamentLine} />
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M22 5v34M5 22h34M10 10l24 24M10 34l24-24" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="22" cy="22" r="9" fill="var(--design-surface)" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="22" cy="22" r="3" fill="currentColor" />
        </svg>
        <span className={styles.ornamentLine} />
      </div>
      <p className={styles.invitationEyebrow}>You’re invited</p>
      <h2 className={styles.invitationTitle}>{event.titleLead}<br /><em>{event.titleAccent}</em></h2>
      <p className={styles.hostLine}>with {event.hosts}</p>
      </div>
      <div className={styles.invitationContent}>
      <div className={styles.eventDetails}>
        <div><p className={styles.detailLabel}>When</p><p>{event.date}</p><p className={styles.detailSecondary}>{event.year} · {event.time}</p></div>
        <div><p className={styles.detailLabel}>Where</p><p>{event.venue}</p><p className={styles.detailSecondary}>{event.location}</p></div>
      </div>
      <p className={styles.invitationDescription}>{event.description}</p>
      <p className={styles.invitationAside}>{event.aside}</p>
      <div className={styles.sampleRsvp}>
        <p>Save you a seat?</p>
        <span className={styles.previewButton}>Kindly reply <span aria-hidden="true">↗</span></span>
        <span className={styles.previewDisclaimer}>Sample invitation · RSVP is not active</span>
      </div>
      <p className={styles.invitationWordmark}>a Shindig<span aria-hidden="true">.</span></p>
      </div>
    </div>
  </article>;
}
