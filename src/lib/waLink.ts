const numbers: Record<string, string | undefined> = {
  wife: process.env.WIFE_WHATSAPP,
  sister: process.env.SISTER_WHATSAPP,
  colleague: process.env.COLLEAGUE_WHATSAPP,
};

export function waLink(referee: string | null, text: string): string | null {
  if (!referee) return null;
  const num = numbers[referee]?.replace(/[^0-9]/g, "");
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
