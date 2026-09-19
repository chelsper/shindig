// Names here have already passed the server's public-visibility filter. Avoid
// guessing a first name for households/couples or ambiguous punctuation.
export function compactGuestName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (/\b(and|family|the)\b|[&,+/]/i.test(clean)) return clean;
  const words = clean.split(" ");
  return words.length === 2 && words.every((word) => /^[\p{L}'’-]+$/u.test(word)) ? words[0] : clean;
}
export function guestListPreview(names: string[], limit = 4) {
  return { names: names.slice(0, limit).map(compactGuestName), more: names.length > limit };
}
