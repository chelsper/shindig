import type { PollResults } from "./polls";
export type GuestPollState = { selected: string[]; results: PollResults | null };
export type GuestInteractionState = { applauded: string[]; polls: Record<string, GuestPollState> };
export type InteractionResult<T> = { ok: true; data: T } | { ok: false; message: string };
export const isPublicKey = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
