import type { AdminPoll, PollInput, PublicPoll } from "../../lib/polls";
export const pollKey = "b0000000-0000-4000-8000-000000000001";
export const pollOptions = [
  { key: "c0000000-0000-4000-8000-000000000001", text: "Raw" },
  { key: "c0000000-0000-4000-8000-000000000002", text: "Grilled" },
  { key: "c0000000-0000-4000-8000-000000000003", text: "Rockefeller" },
  { key: "c0000000-0000-4000-8000-000000000004", text: "Absolutely not" },
];
export const pollInput: PollInput = { question: "Best way to eat an oyster?", eyebrow: "IMPORTANT RESEARCH", allowMultiple: false, showResults: true, showClosedResults: true, sortOrder: 0, options: pollOptions };
export const pollResults = { responses: 30, options: pollOptions.map((option, i) => ({ key: option.key, count: [14, 8, 5, 3][i] })) };
export const publicPoll: PublicPoll = { key: pollKey, question: pollInput.question, eyebrow: pollInput.eyebrow, status: "OPEN", allowMultiple: false, showResults: true, options: pollOptions, results: null };
export const adminPoll: AdminPoll = { ...publicPoll, status: "DRAFT", showClosedResults: true, sortOrder: 0, votingStarted: false, results: pollResults };
