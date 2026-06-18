const numbers: Record<string, string | undefined> = {
  wife: process.env.WIFE_WHATSAPP,
  sister: process.env.SISTER_WHATSAPP,
  colleague: process.env.COLLEAGUE_WHATSAPP,
};

export function waLink(referee: string | null, text: string): string | null {
  if (!referee) return null;
  const num = numbers[referee]?.replace(/[^0-9]/g, "");
  // Guard against placeholders ("+852...") that strip to a few digits and
  // produce a real-looking but dead link. Real E.164 numbers are 8+ digits.
  if (!num || num.length < 8) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
