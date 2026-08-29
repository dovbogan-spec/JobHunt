const healthUrl = process.env.HEALTHCHECK_URL;
if (!healthUrl) throw new Error("HEALTHCHECK_URL is required");

const response = await fetch(healthUrl, { headers: { accept: "application/json" } });
const body = await response.json();

if (!response.ok || body.status === "unhealthy") {
  throw new Error(`Deployment is unhealthy (HTTP ${response.status})`);
}
if (body.pdfRuntime?.status !== "ready") {
  throw new Error(`PDF readiness alert: ${body.pdfRuntime?.code || "pdf_runtime_unavailable"}`);
}

console.log(`healthy gitSha=${body.deployment?.gitSha || "unknown"} runtime=${body.deployment?.runtime || "unknown"}`);
