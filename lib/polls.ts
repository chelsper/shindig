export const POLL_LIMITS = { question: 240, eyebrow: 60, option: 100, minOptions: 2, maxOptions: 10 } as const;
export type PollStatus = "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
export type PollOption = { key: string; text: string };
export type PollResults = { responses: number; options: { key: string; count: number }[] };
export type PublicPoll = {
  key: string; question: string; eyebrow: string | null; status: "OPEN" | "CLOSED";
  allowMultiple: boolean; showResults: boolean; options: PollOption[]; results: PollResults | null;
};
export type AdminPoll = Omit<PublicPoll, "status" | "results"> & {
  status: PollStatus; showClosedResults: boolean; sortOrder: number; votingStarted: boolean; results: PollResults;
};
export type PollInput = { question: string; eyebrow: string | null; allowMultiple: boolean; showResults: boolean; showClosedResults: boolean; sortOrder: number; options: PollOption[] };
export function pollPercentage(count: number, responses: number): number { return responses > 0 ? Math.round(count / responses * 100) : 0; }
