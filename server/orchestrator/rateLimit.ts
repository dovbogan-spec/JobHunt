const bucket = new Map<string, number[]>();

export function basicRateLimit(key: string) {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20);
  const now = Date.now();
  const entries = (bucket.get(key) || []).filter((value) => now - value < windowMs);

  if (entries.length >= max) {
    return false;
  }

  entries.push(now);
  bucket.set(key, entries);
  return true;
}
