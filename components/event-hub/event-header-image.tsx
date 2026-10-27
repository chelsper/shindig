import Image from "next/image";

import type { EventHubHeaderSettings } from "../../lib/event-hub-settings";
import { artworkImageStyle } from "../../lib/design-artwork";
import { responsiveArtworkStyle } from "../../lib/responsive-artwork";
import styles from "./header-artwork.module.css";

type EventHeaderImageProps = {
  settings: EventHubHeaderSettings;
};

export function EventHeaderImage({ settings }: EventHeaderImageProps) {
  return (
    <div className={styles.frame}>
      <Image
        alt={settings.imageAlt}
        className={`${styles.image} object-cover transition-transform duration-200`}
        fill
        priority
        unoptimized={settings.imageUrl.startsWith("/e/")}
        sizes="(min-width: 896px) 896px, 100vw"
        src={settings.imageUrl}
        style={settings.desktopCrop ? responsiveArtworkStyle({ x: settings.focalX, y: settings.focalY, zoom: settings.zoomPercent }, settings.desktopCrop)
          : artworkImageStyle({ x: settings.focalX, y: settings.focalY, zoom: settings.zoomPercent })}
      />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#202523]/22 to-transparent" />
    </div>
  );
}
