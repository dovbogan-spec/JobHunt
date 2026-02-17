import type { IncomingMessage, ServerResponse } from "http";
import { getDbPool } from "../../../server/storage/db";
import { sendJson } from "../../_utils";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse,
) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const runId = req.query?.runId;
  if (!runId) return sendJson(res, 400, { error: "runId is required" });

  // MVP placeholder: expects plain text body extracted by client.
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk as Uint8Array);
  const experienceText = Buffer.concat(chunks).toString("utf8").slice(0, 300_000);

  await getDbPool().query(
    `update runs set experience_text = $2, updated_at = now() where id = $1`,
    [runId, experienceText],
  );

  return sendJson(res, 200, { ok: true, extractedChars: experienceText.length });
}
