import assert from "node:assert/strict";
import test from "node:test";
import { getGreenhouseApiUrl, greenhouseJobToText } from "../api/jd/import.js";

test("maps a Greenhouse hosted job URL to its public JSON API", () => {
  assert.equal(
    getGreenhouseApiUrl("https://job-boards.greenhouse.io/anthropic/jobs/5390791008"),
    "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5390791008",
  );
});

test("does not rewrite unrecognized or unsafe Greenhouse URLs", () => {
  assert.equal(getGreenhouseApiUrl("https://example.com/anthropic/jobs/5390791008"), null);
  assert.equal(getGreenhouseApiUrl("https://job-boards.greenhouse.io/anthropic/jobs/not-a-number"), null);
  assert.equal(getGreenhouseApiUrl("not a URL"), null);
});

test("converts a Greenhouse API job payload into readable plain text", () => {
  const text = greenhouseJobToText({
    title: "Technical Program Manager",
    location: { name: "San Francisco, CA" },
    content: "<h2>The role</h2><p>Lead &amp; support <strong>technical</strong> programs.</p>",
  });

  assert.equal(text, "Technical Program Manager\n\nSan Francisco, CA\n\nThe roleLead & support technical programs.");
  assert.equal(text.includes("<strong>"), false);
});
