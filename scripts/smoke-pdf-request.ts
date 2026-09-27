export function createDeploymentRequestHeaders(
  bypassSecret: string | undefined,
): Record<string, string> {
  if (!bypassSecret) return {};

  return {
    "x-vercel-protection-bypass": bypassSecret,
  };
}
