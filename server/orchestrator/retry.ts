const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);
const OVERLOADED_PATTERNS = [/overloaded/i, /temporarily unavailable/i, /try again later/i, /capacity/i, /server busy/i];

export type RetryOptions = {
  maxAttempts?: number;
  maxElapsedMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (params: { attempt: number; delayMs: number; error: unknown }) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function extractStatus(error: unknown): number | null {
  const rec = asRecord(error);
  const direct = rec?.status;
  if (typeof direct === "number") return direct;

  const response = asRecord(rec?.response);
  const responseStatus = response?.status;
  return typeof responseStatus === "number" ? responseStatus : null;
}

function getHeader(headers: unknown, name: string): string | null {
  if (!headers) return null;

  const loweredName = name.toLowerCase();
  const rec = asRecord(headers);
  if (rec) {
    for (const [key, value] of Object.entries(rec)) {
      if (key.toLowerCase() === loweredName) {
        return typeof value === "string" ? value : Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
      }
    }
  }

  const maybeGet = asRecord(headers)?.get;
  if (typeof maybeGet === "function") {
    const result = (maybeGet as (key: string) => string | null)(name);
    return result ?? null;
  }

  return null;
}

function extractRetryAfterMs(error: unknown): number | null {
  const rec = asRecord(error);
  const headerValue =
    getHeader(rec?.headers, "retry-after") || getHeader(asRecord(rec?.response)?.headers, "retry-after") || null;
  if (!headerValue) return null;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const asDate = Date.parse(headerValue);
  if (Number.isNaN(asDate)) return null;

  return Math.max(0, asDate - Date.now());
}

export function isTransientError(error: unknown) {
  const rec = asRecord(error);
  const code = rec?.code;
  if (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code)) return true;

  const status = extractStatus(error);
  if (status && RETRYABLE_HTTP_STATUS.has(status)) return true;

  const message = typeof rec?.message === "string" ? rec.message : "";
  if (OVERLOADED_PATTERNS.some((pattern) => pattern.test(message))) return true;

  return false;
}

export async function withRetry<T>(operation: () => Promise<T>, opts: RetryOptions = {}) {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const maxElapsedMs = Math.max(1000, opts.maxElapsedMs ?? 30_000);
  const baseDelayMs = Math.max(50, opts.baseDelayMs ?? 300);
  const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? 5_000);
  const shouldRetry = opts.shouldRetry ?? isTransientError;

  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!shouldRetry(error) || attempt >= maxAttempts) {
        throw error;
      }

      const elapsedMs = Date.now() - startedAt;
      const retryAfterMs = extractRetryAfterMs(error);
      const jittered = Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.max(retryAfterMs ?? 0, Math.round(jittered));

      if (elapsedMs + delayMs > maxElapsedMs) {
        throw error;
      }

      opts.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw new Error("Retry loop exhausted unexpectedly");
}
