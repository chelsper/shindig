// Deliberately fictional. This public playground must never import real event
// configuration, guest data, provider responses, or server-side actions.
export const DESIGN_PREVIEW_EVENT = {
  title: "A little dinner party.",
  titleLead: "A little",
  titleAccent: "dinner party.",
  hosts: "Sam & Alex",
  date: "Saturday, November 14",
  year: "2026",
  time: "6:00 PM",
  venue: "The garden table",
  location: "At our place",
  description: "Something delicious, a glass of something good, and your favorite people around the table.",
  aside: "Come as you are. Stay for one more.",
  guests: [
    { name: "Jamie & Morgan", partySize: 2 },
    { name: "The Parkers", partySize: 4 },
    { name: "Charlie & Drew", partySize: 2 },
  ],
  update: { heading: "A little note from us", message: "We’ll take care of dinner. Bring yourself, a good story, and a layer for later.", author: "Sam & Alex" },
} as const;

export type DesignPreviewPage = "invitation" | "hub";
export type DesignPreviewDevice = "phone" | "desktop";
export const DESIGN_PREVIEW_WIDTHS = { phone: 390, desktop: 960 } as const;

export function fitDesignPreview(device: DesignPreviewDevice, availableWidth: number, contentHeight: number) {
  const width = DESIGN_PREVIEW_WIDTHS[device];
  const scale = Number.isFinite(availableWidth) && availableWidth > 0 ? Math.min(1, availableWidth / width) : 1;
  const height = Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : 0;
  return { scale, width: width * scale, height: height * scale };
}
