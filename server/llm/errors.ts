import type { LlmProvider } from "../../src/config/modelDefinitions.js";

export type LlmErrorCode =
  | "INVALID_PAYLOAD" | "NO_MESSAGES" | "METHOD_NOT_ALLOWED" | "NOT_FOUND"
  | "PROVIDER_NOT_CONFIGURED" | "UPSTREAM_AUTHENTICATION" | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_BAD_RESPONSE" | "UPSTREAM_REJECTED";

export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) { super(message); this.name = "LlmError"; }
}

export function normalizeUpstreamError(status: number) {
  if (status === 401 || status === 403) return new LlmError("UPSTREAM_AUTHENTICATION", "The provider rejected server credentials.", 502, false);
  if (status === 429) return new LlmError("UPSTREAM_RATE_LIMITED", "The provider is temporarily rate limited.", 503, true);
  if ([408, 409, 500, 502, 503, 504].includes(status)) return new LlmError("UPSTREAM_UNAVAILABLE", "The provider is temporarily unavailable.", 503, true);
  return new LlmError("UPSTREAM_REJECTED", "The provider rejected the request.", 502, false);
}

export function errorPayload(error: LlmError, identity?: { provider: LlmProvider; model: string }, resolvedModel?: string) {
  return {
    ok: false,
    provider: identity?.provider ?? null,
    requestedModel: identity?.model ?? null,
    resolvedModel: resolvedModel ?? null,
    retryable: error.retryable,
    error: { code: error.code, message: error.message },
  };
}
