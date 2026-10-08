import type { DesignPreviewDevice, DesignPreviewPage } from "../../lib/design-preview";
import type { EventDesignId } from "../../lib/event-design";
import { defaultArtworkCrop, type ArtworkCrop, type LocalArtwork } from "../../lib/design-artwork";
import { EventHubDesignPreview } from "./event-hub-design-preview";
import { InvitationDesignPreview } from "./invitation-design-preview";
import { PreviewFrame } from "./preview-frame";
import styles from "./design-studio.module.css";

export function DesignPreview({ designId, page, device, artwork = null, crop = defaultArtworkCrop() }: { designId: EventDesignId; page: DesignPreviewPage; device: DesignPreviewDevice; artwork?: LocalArtwork | null; crop?: ArtworkCrop }) {
  return <PreviewFrame key={device} device={device}>
    {page === "invitation" ? <div className={styles.invitationPage}><InvitationDesignPreview designId={designId} artwork={artwork} crop={crop} /></div> : <EventHubDesignPreview designId={designId} artwork={artwork} crop={crop} device={device} />}
  </PreviewFrame>;
}
