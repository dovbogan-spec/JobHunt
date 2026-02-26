import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { sanitizeRichHtml } from "../src/utils/richText";

function withDom<T>(callback: () => T): T {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousDomParser = globalThis.DOMParser;

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    DOMParser: dom.window.DOMParser,
  });

  try {
    return callback();
  } finally {
    Object.assign(globalThis, {
      window: previousWindow,
      document: previousDocument,
      Node: previousNode,
      DOMParser: previousDomParser,
    });
    dom.window.close();
  }
}

test("sanitizeRichHtml removes empty blocks containing &nbsp;", () => {
  const sanitized = withDom(() => sanitizeRichHtml("<p>&nbsp;</p><p>Implemented feature</p>"));
  assert.equal(sanitized, "<p>Implemented feature</p>");
});

test("sanitizeRichHtml normalizes consecutive blank wrappers", () => {
  const sanitized = withDom(() => sanitizeRichHtml("<p>First</p><div><br></div><p>&nbsp;</p><div> </div><p>Second</p>"));
  assert.equal(sanitized, "<p>First</p><p>Second</p>");
});
