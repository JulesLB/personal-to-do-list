const api = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export async function sendMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: InlineKeyboard
) {
  await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

// Edit an existing message in place (used to re-render the daily nudge after a
// tick, so the burned item drops out of the list). Passing an empty keyboard
// clears the buttons, e.g. once nothing is left to act on.
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard
) {
  await fetch(api("editMessageText"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    }),
  });
}

export async function answerCallback(callbackId: string, text?: string) {
  await fetch(api("answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, ...(text ? { text } : {}) }),
  });
}
