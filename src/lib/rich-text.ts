const allowed = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);
const blocked = new Set(["script", "style", "iframe", "object", "embed", "svg", "math"]);

export function richTextHtml(value: string): string {
  if (!/^\s*<(?:p|div|br|strong|b|em|i|u|ul|ol|li)(?:\s|>|\/)/i.test(value)) {
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
      for (const attribute of Array.from(child.attributes)) child.removeAttribute(attribute.name);
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
}
