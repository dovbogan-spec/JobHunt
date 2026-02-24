import type { IncomingMessage, ServerResponse } from "http";
import { eraseUserDataAndBlobs, exportUserData } from "../../../server/storage/dataLifecycle.js";
import { logServerError, sendJson } from "../../_utils.js";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string | string[] | undefined> },
  res: ServerResponse,
) {
  const userId = req.query?.userId;
  if (!userId || Array.isArray(userId)) return sendJson(res, 400, { ok: false, error: "userId is required" });

  try {
    if (req.method === "GET") {
      const data = await exportUserData(userId);
      return sendJson(res, 200, { ok: true, data });
    }

    if (req.method === "DELETE") {
      const result = await eraseUserDataAndBlobs(userId);
      return sendJson(res, 200, { ok: true, result });
    }

    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    logServerError("/api/users/[userId]/data", error, { userId });
    return sendJson(res, 500, { ok: false, error: "Data operation failed" });
  }
}
