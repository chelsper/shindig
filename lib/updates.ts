export const UPDATE_LIMITS = { heading: 120, message: 3000 } as const;

export type PublicHostUpdate = {
  heading: string | null;
  message: string;
  publishedAt: string;
};
