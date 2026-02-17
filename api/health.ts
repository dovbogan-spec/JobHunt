import type { IncomingMessage, ServerResponse } from "http";
import { getConfig, isEdgeConfigConfigured } from "../server/config/edgeConfig";
import { isBlobConfigured } from "../server/storage/blob";
import { sendJson } from "./_utils";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const config = await getConfig();

  return sendJson(res, 200, {
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    blobConfigured: isBlobConfigured(),
    edgeConfigConfigured: isEdgeConfigConfigured(),
    modelDefaults: config.defaultModels,
    featureFlags: config.featureFlags,
  });
}
