import type { DesignPreviewDevice, DesignPreviewPage } from "../../lib/design-preview";
import type { EventDesignId } from "../../lib/event-design";
import { EventHubDesignPreview } from "./event-hub-design-preview";
import { InvitationDesignPreview } from "./invitation-design-preview";
import { PreviewFrame } from "./preview-frame";
import styles from "./design-studio.module.css";

export function DesignPreview({ designId, page, device }: { designId: EventDesignId; page: DesignPreviewPage; device: DesignPreviewDevice }) {
  return <PreviewFrame key={device} device={device}>
    {page === "invitation" ? <div className={styles.invitationPage}><InvitationDesignPreview designId={designId} /></div> : <EventHubDesignPreview designId={designId} />}
  </PreviewFrame>;
}
