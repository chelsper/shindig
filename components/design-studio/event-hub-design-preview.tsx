import { DESIGN_PREVIEW_EVENT as event } from "../../lib/design-preview";
import { eventDesignVariables, getEventDesign, type EventDesignId } from "../../lib/event-design";
import styles from "./design-studio.module.css";

function SampleGuestList() {
  const total = event.guests.reduce((count, guest) => count + guest.partySize, 0);
  return <section className={styles.hubModule} aria-label="Fictional sample guest list">
    <div className={styles.moduleHeading}><h3>Who’s coming</h3><span>{total} guests</span></div>
    <p className={styles.moduleIntro}>Good company, all around.</p>
    <ul className={styles.sampleGuests}>{event.guests.map((guest, index) => <li key={guest.name}>
      <span className={styles.guestInitial} aria-hidden="true">{["J", "P", "C"][index]}</span>
      <span>{guest.name}</span><span className={styles.guestCount}>{guest.partySize} guests</span>
    </li>)}</ul>
    <p className={styles.sampleDataLabel}>Fictional names · sample guest list</p>
  </section>;
}

function SampleHostNote() {
  return <section className={`${styles.hubModule} ${styles.hostNote}`} aria-label="Sample host update">
    <p className={styles.hubEyebrow}>From your hosts</p>
    <h3>{event.update.heading}</h3>
    <p>{event.update.message}</p>
    <p className={styles.noteSignature}>— {event.update.author}</p>
  </section>;
}

export function EventHubDesignPreview({ designId }: { designId: EventDesignId }) {
  const design = getEventDesign(designId);
  return <article className={styles.hubPreview} style={eventDesignVariables(design)} data-design={design.id} aria-label={`${design.name} sample Event Hub — visual preview only`}>
    <div className={styles.hubWordmark}><span>Shindig.</span><span>Good people. Great gatherings.</span></div>
    <header className={styles.hubHeader}>
      <div className={styles.hubArtwork} aria-hidden="true"><span>A reason to gather</span><span className={styles.hubSun}>✳</span><span>No. 01</span></div>
      <div className={styles.hubHeaderContent}>
        <p className={styles.hubEyebrow}>The Event Hub</p>
        <h2>{event.titleLead}<br /><em>{event.titleAccent}</em></h2>
        <p className={styles.hubHosts}>with {event.hosts}</p>
        <div className={styles.eventDetails}>
          <div><p className={styles.detailLabel}>When</p><p>{event.date}</p><p className={styles.detailSecondary}>{event.year} · {event.time}</p></div>
          <div><p className={styles.detailLabel}>Where</p><p>{event.venue}</p><p className={styles.detailSecondary}>{event.location}</p></div>
        </div>
        <div className={styles.hubActions} aria-label="Sample actions — not interactive"><span className={styles.previewButton}>Add to Calendar</span><span className={styles.secondaryPreviewButton}>Get Directions <span aria-hidden="true">↗</span></span></div>
        <p className={styles.previewDisclaimer}>Visual preview · calendar and directions are inactive</p>
      </div>
    </header>
    <p className={styles.hubSectionLabel}>Around the table</p>
    <div className={styles.hubModules}><SampleGuestList /><SampleHostNote /></div>
    <p className={styles.hubFooter}>A little planning. A lovely evening.</p>
  </article>;
}
