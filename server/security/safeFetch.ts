import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type SafeFetchErrorCategory = "invalid_url" | "blocked_host" | "timeout" | "fetch_failed";

export type HostPattern = string;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  allowlist?: HostPattern[];
  denylist?: HostPattern[];
  userAgent?: string;
}

export type SafeFetchTextResult =
  | { ok: true; url: string; status: number; text: string; redirects: string[] }
  | { ok: false; category: SafeFetchErrorCategory; message: string; url?: string };

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

const blockedIpRanges = new BlockList();
blockedIpRanges.addSubnet("10.0.0.0", 8);
blockedIpRanges.addSubnet("172.16.0.0", 12);
blockedIpRanges.addSubnet("192.168.0.0", 16);
blockedIpRanges.addSubnet("127.0.0.0", 8);
blockedIpRanges.addSubnet("169.254.0.0", 16);
blockedIpRanges.addSubnet("100.64.0.0", 10);
blockedIpRanges.addAddress("::1", "ipv6");
blockedIpRanges.addSubnet("fc00::", 7, "ipv6");
blockedIpRanges.addSubnet("fe80::", 10, "ipv6");

function matchesPattern(host: string, pattern: HostPattern): boolean {
  const normalizedHost = host.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.endsWith(suffix);
  }

  return normalizedHost === normalizedPattern;
}

function hostAllowed(host: string, allowlist: HostPattern[], denylist: HostPattern[]): boolean {
  const denied = denylist.some((pattern) => matchesPattern(host, pattern));
  if (denied) return false;

  if (allowlist.length === 0) return true;
  return allowlist.some((pattern) => matchesPattern(host, pattern));
}

function isBlockedIpAddress(ip: string): boolean {
  if (ip.startsWith("::ffff:")) {
    return isBlockedIpAddress(ip.slice("::ffff:".length));
  }

  const family = isIP(ip);
  if (family === 0) return true;
  return blockedIpRanges.check(ip, family === 6 ? "ipv6" : "ipv4");
}

async function resolveAndValidateHost(url: URL, allowlist: HostPattern[], denylist: HostPattern[]) {
  const host = url.hostname.toLowerCase();
  if (!hostAllowed(host, allowlist, denylist)) {
    return { ok: false as const, message: `Host '${host}' is not allowed by policy` };
  }

  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false as const, message: `Host '${host}' resolves to local/internal domain` };
  }

  if (isIP(host)) {
    if (isBlockedIpAddress(host)) {
      return { ok: false as const, message: `IP '${host}' is in a blocked network range` };
    }
    return { ok: true as const };
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false as const, message: `Unable to resolve host '${host}'` };
  }

  if (!addresses.length) {
    return { ok: false as const, message: `No DNS records found for host '${host}'` };
  }

  if (addresses.some(({ address }) => isBlockedIpAddress(address))) {
    return { ok: false as const, message: `Host '${host}' resolves to blocked address space` };
  }

  return { ok: true as const };
}

function toSafeUrl(value: string | URL): URL | null {
  const parsed = value instanceof URL ? value : (() => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  })();

  if (!parsed) return null;
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  return parsed;
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Response exceeded maximum allowed size");
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

export async function safeFetchText(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeFetchTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowlist = options.allowlist ?? [];
  const denylist = options.denylist ?? [];

  const initialUrl = toSafeUrl(input);
  if (!initialUrl) {
    return { ok: false, category: "invalid_url", message: "URL must use http/https and be valid" };
  }

  const redirects: string[] = [];
  let currentUrl = initialUrl;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const hostValidation = await resolveAndValidateHost(currentUrl, allowlist, denylist);
    if (!hostValidation.ok) {
      return { ok: false, category: "blocked_host", message: hostValidation.message, url: currentUrl.toString() };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: options.userAgent ? { "user-agent": options.userAgent } : undefined,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return { ok: false, category: "fetch_failed", message: "Redirect response missing location header" };
        }

        if (i === maxRedirects) {
          return { ok: false, category: "fetch_failed", message: `Too many redirects (>${maxRedirects})` };
        }

        const nextUrl = toSafeUrl(new URL(location, currentUrl));
        if (!nextUrl) {
          return { ok: false, category: "invalid_url", message: "Redirect target URL is invalid" };
        }

        redirects.push(nextUrl.toString());
        currentUrl = nextUrl;
        continue;
      }

      const text = await readBodyWithLimit(response, maxResponseBytes);
      return {
        ok: true,
        url: currentUrl.toString(),
        status: response.status,
        redirects,
        text,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, category: "timeout", message: `Request timed out after ${timeoutMs}ms`, url: currentUrl.toString() };
      }

      const message = error instanceof Error ? error.message : "Request failed";
      return { ok: false, category: "fetch_failed", message, url: currentUrl.toString() };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, category: "fetch_failed", message: "Unexpected redirect state" };
}
