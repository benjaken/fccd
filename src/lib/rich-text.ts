const allowed = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "h2", "h3", "blockquote", "hr", "a"]);
const blocked = new Set(["script", "style", "iframe", "object", "embed", "svg", "math"]);
const htmlStart = /^(?:p|div|br|strong|b|em|i|u|s|strike|ul|ol|li|h2|h3|blockquote|hr|a)$/;

export function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return href;
  return "";
}

function safeStyle(value: string) {
  const match = value.trim().match(/^text-align:\s*(left|center|right);?$/i);
  return match ? `text-align: ${match[1].toLowerCase()}` : "";
}

function keptAttribute(tag: string, name: string, value: string) {
  if (tag === "a" && name === "href") return safeHref(value);
  if (tag === "a" && name === "target" && value === "_blank") return value;
  if (tag === "a" && name === "rel" && value.split(/\s+/).every(token => ["noopener", "noreferrer", "nofollow"].includes(token))) return value;
  if ((tag === "p" || tag === "h2" || tag === "h3") && name === "style") return safeStyle(value);
  return "";
}

export function richTextHtml(value: string): string {
  const start = value.trim().match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? "";
  if (!htmlStart.test(start)) {
    const escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/\r?\n/g, "<br>");
  }
  return sanitizeRichHtml(value);
}

export function sanitizeRichHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, "text/html");
  function clean(parent: Element) {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (blocked.has(tag)) { child.remove(); continue; }
      clean(child);
      if (!allowed.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const attribute of Array.from(child.attributes)) {
        const kept = keptAttribute(tag, attribute.name, attribute.value);
        if (kept && kept !== attribute.value) child.setAttribute(attribute.name, kept);
        else if (!kept) child.removeAttribute(attribute.name);
      }
      if (tag === "a" && !child.getAttribute("href")) child.replaceWith(...child.childNodes);
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}
