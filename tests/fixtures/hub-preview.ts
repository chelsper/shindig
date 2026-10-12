import type { HubContentPreview } from "../../lib/event-hub-preview";
import { snapshot } from "./publication";
export const previewSettings = { ...snapshot.settings, features: { ...snapshot.settings.features, guestList: false, playlist: false, weather: false, potluck: true } };
export const hubPreview: HubContentPreview = {
  potluck: { state: "ready", live: false, items: [{ title: "Bags of ice", note: "10 lb bags", needed: 4, claimed: 1 }] },
  polls: { state: "ready", live: false, items: [{ question: "What should we grill?", eyebrow: "Important research", status: "OPEN", allowMultiple: false, options: [{ text: "Veggie skewers", count: null }, { text: "Corn", count: null }], responses: null }] },
  updates: { state: "ready", live: true, items: [{ heading: "Parking", message: "Use the side gate.", publishedAt: "2026-11-08T01:00:00.000Z" }] },
  questions: { state: "ready", live: false, items: [{ question: "Can I bring a jacket?", answer: "Yes, we’ll be outdoors." }] },
};
