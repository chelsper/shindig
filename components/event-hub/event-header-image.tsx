import Image from "next/image";

import type { EventHubHeaderSettings } from "../../lib/event-hub-settings";

type EventHeaderImageProps = {
  settings: EventHubHeaderSettings;
};

export function EventHeaderImage({ settings }: EventHeaderImageProps) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#dceaf7] sm:aspect-[16/6]">
      <Image
        alt={settings.imageAlt}
        className="object-cover transition-transform duration-200"
        fill
        priority
        sizes="(min-width: 896px) 896px, 100vw"
        src={settings.imageUrl}
        style={{
          objectPosition: `${settings.focalX}% ${settings.focalY}%`,
          transform: `scale(${settings.zoomPercent / 100})`,
          transformOrigin: `${settings.focalX}% ${settings.focalY}%`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#202523]/22 to-transparent" />
    </div>
  );
}
