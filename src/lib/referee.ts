import { prisma } from "./db";
import type { Item, Referee } from "@prisma/client";

// PRD-10: referees live in the per-user Referee table, not env vars. A referee is
// "opted in" for server auto-send when their row has a real contact number and
// consent is on. The WhatsApp app credentials (token/phone-id/template) stay env,
// since that's shared channel infrastructure, not per-referee data.
//
// Note: the legacy WIFE_WHATSAPP / *_CONSENT env vars are superseded. The
// migration seeds the owner's referee rows from existing item labels with a null
// contact; populate Referee.contact (M2 go-live / PRD-12 onboarding) for auto-send
// to fire. Until then `send` degrades to the one-tap wa.me draft, as before.

export async function getReferee(
  userId: number,
  label: string | null
): Promise<Referee | null> {
  if (!label) return null;
  return prisma.referee
    .findUnique({ where: { userId_label: { userId, label } } })
    .catch(() => null);
}

// E.164 digits only; reject placeholders that strip to too few digits.
export function refereePhone(ref: Referee | null): string | null {
  const num = ref?.contact?.replace(/[^0-9]/g, "");
  return num && num.length >= 8 ? num : null;
}

// Opted in = we have a real number and consent is on.
export function isOptedInReferee(ref: Referee | null): boolean {
  return !!ref && ref.consent && !!refereePhone(ref);
}

// The server can only send WhatsApp through the Cloud API, which needs all three.
export function whatsappConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_ID &&
    process.env.WHATSAPP_TEMPLATE
  );
}

export function canAutoSend(ref: Referee | null): boolean {
  return whatsappConfigured() && isOptedInReferee(ref);
}

// The message that lands on the referee's phone. Must mirror the approved Meta
// template body exactly (only {{1}} = owner name and {{2}} = task vary), or the
// preview shown to the owner won't match what was actually sent.
// Template body to register in Meta (category Utility):
//   🔥 Accountability alert from Ember. {{1}} committed to "{{2}}" and keeps
//   dodging it. Your job: chase them to completion. No mercy.
export function renderEscalation(item: Item, ownerName: string): string {
  return `🔥 Accountability alert from Ember. ${ownerName} committed to "${item.title}" and keeps dodging it. Your job: chase them to completion. No mercy.`;
}

// The one real side effect of M2: a message the owner did NOT have to tap to send.
// Returns whether it landed and the rendered text, so the sweep can show the owner
// exactly what went out (or fall back when not configured).
export async function sendToReferee(
  ref: Referee,
  item: Item,
  ownerName: string
): Promise<{ ok: boolean; rendered: string }> {
  const rendered = renderEscalation(item, ownerName);
  const to = refereePhone(ref);
  if (!canAutoSend(ref) || !to) return { ok: false, rendered };

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
                { type: "text", text: ownerName },
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
