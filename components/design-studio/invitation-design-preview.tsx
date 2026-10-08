import { eventDesignVariables, getEventDesign, type EventDesignId } from "../../lib/event-design";
import styles from "./design-studio.module.css";

// A deliberately fictional sample. Never import a real event, guest, RSVP
// action or host data into this account-free, development-only prototype.
export function InvitationDesignPreview({ designId }: { designId: EventDesignId }) {
  const design = getEventDesign(designId);
  return <article className={styles.invitation} style={eventDesignVariables(design)} data-design={design.id} aria-label={`${design.name} sample invitation — visual preview only`}>
    <div className={styles.invitationBorder}>
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
      <h2 className={styles.invitationTitle}>A little<br /><em>dinner party.</em></h2>
      <p className={styles.hostLine}>with Sam &amp; Alex</p>
      <div className={styles.eventDetails}>
        <div><p className={styles.detailLabel}>When</p><p>Saturday, November 14</p><p className={styles.detailSecondary}>2026 · 6:00 PM</p></div>
        <div><p className={styles.detailLabel}>Where</p><p>The garden table</p><p className={styles.detailSecondary}>At our place</p></div>
      </div>
      <p className={styles.invitationDescription}>Something delicious, a glass of something good, and your favorite people around the table.</p>
      <p className={styles.invitationAside}>Come as you are. Stay for one more.</p>
      <div className={styles.sampleRsvp}>
        <p>Save you a seat?</p>
        <span className={styles.previewButton}>Kindly reply <span aria-hidden="true">↗</span></span>
        <span className={styles.previewDisclaimer}>Sample invitation · RSVP is not active</span>
      </div>
      <p className={styles.invitationWordmark}>a Shindig<span aria-hidden="true">.</span></p>
    </div>
  </article>;
}
