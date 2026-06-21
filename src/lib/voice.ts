// Telegram voice notes arrive as OGG/Opus files referenced by a file_id. Pull
// the file down, hand it to OpenAI Whisper, and return the transcript so the
// existing classifier can treat it exactly like a typed message.
import { track } from "./usage";
import { whisperCostUsd } from "./pricing";

const tgFileApi = () =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile`;

const tgDownload = (filePath: string) =>
  `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

// Whisper is priced per audio-second, so the cost comes from the voice note's
// duration (Telegram hands it to us for free), not the transcript. userId/
// durationSeconds feed the cost log; omit userId and nothing is recorded.
export async function transcribeVoice(
  fileId: string,
  opts: { userId?: number; durationSeconds?: number } = {}
): Promise<string> {
  const seconds = opts.durationSeconds ?? 0;
  return track(
    { source: "transcribe", provider: "openai", model: "whisper-1", userId: opts.userId },
    async () => {
      const fileRes = await fetch(tgFileApi(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const filePath: string | undefined = (await fileRes.json())?.result?.file_path;
      if (!filePath) throw new Error("telegram getFile returned no file_path");

      const audio = await fetch(tgDownload(filePath));
      if (!audio.ok) throw new Error(`telegram file download failed: ${audio.status}`);
      const blob = await audio.blob();

      const form = new FormData();
      form.append("file", blob, "voice.ogg");
      form.append("model", "whisper-1");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
      if (!res.ok) throw new Error(`openai transcription failed: ${res.status}`);
      const text: unknown = (await res.json())?.text;
      if (typeof text !== "string") throw new Error("openai returned no transcript");
      return text.trim();
    },
    () => ({ usage: { audioSeconds: seconds }, costUsd: whisperCostUsd(seconds) })
  );
}
