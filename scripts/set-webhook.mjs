const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.APP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !url) {
  console.error("Set TELEGRAM_BOT_TOKEN and APP_URL in .env first.");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${url}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  }),
});

console.log(JSON.stringify(await res.json(), null, 2));
