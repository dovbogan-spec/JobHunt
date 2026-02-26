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

  const EMPTY_TAGS = new Set(["p", "div", "span", "li"]);
  const BLOCK_TAGS = new Set(["p", "div", "li"]);

  const isNodeEmpty = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/\u00a0|&nbsp;/gi, " ").trim();
      return text.length === 0;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return true;

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") return true;
    if (!EMPTY_TAGS.has(tag)) {
      return Array.from(element.childNodes).every(isNodeEmpty);
    }
    return Array.from(element.childNodes).every(isNodeEmpty);
  };

  const cleanupNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;

    Array.from(element.children).forEach((child) => cleanupNode(child));

    if (
      element.tagName.toLowerCase() === "li" &&
      element.children.length === 1 &&
      element.firstElementChild?.tagName.toLowerCase() === "p"
    ) {
      const paragraph = element.firstElementChild;
      if (paragraph) {
        element.replaceChildren(...Array.from(paragraph.childNodes));
      }
    }

    const tag = element.tagName.toLowerCase();
    if (EMPTY_TAGS.has(tag) && isNodeEmpty(element)) {
      element.remove();
      return;
    }

    if (tag === "ul" || tag === "ol") {
      Array.from(element.children).forEach((child) => {
        if (child.tagName.toLowerCase() === "li" && isNodeEmpty(child)) {
          child.remove();
        }
      });
      if (element.children.length === 0) {
        element.remove();
      }
    }
  };

  const collapseBlankBlocks = (container: Element) => {
    let previousWasBlankBlock = false;
    Array.from(container.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        collapseBlankBlocks(child as Element);
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        const tag = element.tagName.toLowerCase();
        const isBlankBlock = BLOCK_TAGS.has(tag) && isNodeEmpty(element);
        if (isBlankBlock) {
          if (previousWasBlankBlock || container.tagName.toLowerCase() === "li") {
            element.remove();
            return;
          }
          previousWasBlankBlock = true;
          return;
        }
      } else if (child.nodeType === Node.TEXT_NODE && (child.textContent || "").trim() === "") {
        return;
      }
      previousWasBlankBlock = false;
    });
  };

  cleanupNode(root);
  collapseBlankBlocks(root);

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
