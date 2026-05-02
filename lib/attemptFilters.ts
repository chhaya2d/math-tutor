export const ALLOWED_SUBJECTS = ["English", "Maths", "Science"] as const;

export type AttemptListFilter = {
  subject?: string;
  classLevel?: number;
};

export function attemptMatchFilter(
  userId: string,
  filters: AttemptListFilter
): Record<string, unknown> {
  const q: Record<string, unknown> = { userId };
  const sub = filters.subject;
  if (
    typeof sub === "string" &&
    (ALLOWED_SUBJECTS as readonly string[]).includes(sub)
  ) {
    q.subject = sub;
  }
  const c = filters.classLevel;
  if (
    typeof c === "number" &&
    Number.isInteger(c) &&
    c >= 1 &&
    c <= 8
  ) {
    q.classLevel = c;
  }
  return q;
}
