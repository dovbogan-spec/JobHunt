import type { IncomingMessage, ServerResponse } from "http";
import { createRunSchema } from "../../shared/schemas/api.js";
import { completeIdempotencyKey, createRun, listRuns, reserveIdempotencyKey } from "../../server/storage/runsRepo.js";
import { getIdempotencyKey, hashRequest, methodNotAllowed, readJson, sendJson } from "../_utils.js";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  if (req.method === "GET") {
    const runs = await listRuns();
    return sendJson(res, 200, { runs });
  }

  if (req.method === "POST") {
    const payload = await readJson(req);
    const parsed = createRunSchema.safeParse(payload);
    if (!parsed.success) {
      return sendJson(res, 400, { error: parsed.error.flatten() });
    }

    const idempotencyKey = getIdempotencyKey(req);
    const scope = "runs:create";

    if (idempotencyKey) {
      const reservation = await reserveIdempotencyKey({
        scope,
        key: idempotencyKey,
        requestHash: hashRequest(parsed.data),
      });

      if (reservation.status === "mismatch") {
        return sendJson(res, 409, { error: "Idempotency key reuse with different request payload" });
      }
      if (reservation.status === "in_progress") {
        return sendJson(res, 409, { error: "A request with this idempotency key is already in progress" });
      }
      if (reservation.status === "replay") {
        res.setHeader("Idempotent-Replayed", "true");
        return sendJson(res, reservation.statusCode, reservation.response);
      }
    }

    const runId = await createRun(parsed.data);
    const response = { runId };

    if (idempotencyKey) {
      await completeIdempotencyKey({
        scope,
        key: idempotencyKey,
        statusCode: 201,
        response,
        runId,
      });
    }

    return sendJson(res, 201, response);
  }

  return methodNotAllowed(res);
}
