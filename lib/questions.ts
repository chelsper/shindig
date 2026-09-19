export const QUESTION_LIMITS = { question: 1000, guestName: 80, answer: 2000 } as const;

export type PublicQuestion = {
  question: string;
  answer: string;
};
