import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchJdTextFromUrl } from "../server/jd/import.js";

test("fetchJdTextFromUrl extracts readable text", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<!doctype html><html><body><nav>menu</nav><article><h1>Senior Engineer</h1><p>Need TypeScript and React skills.</p></article></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const text = await fetchJdTextFromUrl(`http://127.0.0.1:${port}`);
  server.close();
  assert.match(text, /Senior Engineer/);
  assert.match(text, /TypeScript/);
});
