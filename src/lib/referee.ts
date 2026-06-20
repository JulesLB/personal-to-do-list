import type { Item } from "@prisma/client";

// Referee contact + consent. Single-user, so this stays env-based like waLink:
// each referee maps to a WhatsApp number, and is "opted in" for server auto-send
// when we have that number and consent hasn't been explicitly revoked.
const phones: Record<string, string | undefined> = {
  wife: process.env.WIFE_WHATSAPP,
  sister: process.env.SISTER_WHATSAPP,
  colleague: process.env.COLLEAGUE_WHATSAPP,
};

const consentEnv: Record<string, string | undefined> = {
  wife: process.env.WIFE_CONSENT,
  sister: process.env.SISTER_CONSENT,
  colleague: process.env.COLLEAGUE_CONSENT,
};

// E.164 digits only; reject placeholders that strip to too few digits.
export function refereePhone(label: string | null): string | null {
  if (!label) return null;
  const num = phones[label]?.replace(/[^0-9]/g, "");
  return num && num.length >= 8 ? num : null;
}

// Opted in = we have a real number and consent wasn't turned off. Consent
// defaults on once a number is set (you only add a referee you've squared with);
// set <LABEL>_CONSENT="false" to keep the number but stop auto-sends.
export function isOptedInReferee(label: string | null): boolean {
  if (!label || !refereePhone(label)) return false;
  return consentEnv[label] !== "false";
}

// The server can only send WhatsApp through the Cloud API, which needs all three.
export function whatsappConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_ID &&
    process.env.WHATSAPP_TEMPLATE
  );
}

export function canAutoSend(label: string | null): boolean {
  return whatsappConfigured() && isOptedInReferee(label);
}

// The message that lands on the referee's phone. Must mirror the approved Meta
// template body exactly (only {{1}} = owner name and {{2}} = task vary), or the
// preview shown to the owner won't match what was actually sent.
// Template body to register in Meta (category Utility):
//   🔥 Accountability alert from Ember. {{1}} committed to "{{2}}" and keeps
//   dodging it. Your job: chase them to completion. No mercy.
export function renderEscalation(item: Item): string {
  const name = process.env.OWNER_NAME || "Jules";
  return `🔥 Accountability alert from Ember. ${name} committed to "${item.title}" and keeps dodging it. Your job: chase them to completion. No mercy.`;
}

// The one real side effect of M2: a message the owner did NOT have to tap to send.
// Returns whether it landed and the rendered text, so the sweep can show the owner
// exactly what went out (or fall back when not configured).
export async function sendToReferee(
  label: string,
  item: Item
): Promise<{ ok: boolean; rendered: string }> {
  const rendered = renderEscalation(item);
  const to = refereePhone(label);
  if (!canAutoSend(label) || !to) return { ok: false, rendered };

  const name = process.env.OWNER_NAME || "Jules";
  const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE,
          language: { code: process.env.WHATSAPP_LANG || "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: item.title },
              ],
            },
          ],
        },
      }),
    });
    return { ok: res.ok, rendered };
  } catch {
    return { ok: false, rendered };
  }
}
