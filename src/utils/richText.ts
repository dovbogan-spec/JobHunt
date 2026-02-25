function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "div",
  "span",
]);

export function sanitizeRichHtml(value: string): string {
  if (!value.trim()) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return ensureRichHtml(value);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${value}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const walker = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      const textNode = doc.createTextNode(element.textContent || "");
      element.replaceWith(textNode);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
        return;
      }
      if (tag === "a" && name === "href") {
        const href = attribute.value.trim();
        if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
          element.removeAttribute("href");
        }
        return;
      }
      if (tag !== "a" || !["href", "target", "rel"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (tag === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }

    Array.from(element.childNodes).forEach(walker);
  };

  Array.from(root.childNodes).forEach(walker);
  return root.innerHTML;
}

export function ensureRichHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return value;

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}
