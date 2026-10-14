const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base", "form"]);

export function sanitizeEnquiryHtml(html: string): string {
  const source = html.trim();
  if (!source || typeof DOMParser === "undefined") return "";
  const document = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return "";
  const clean = (node: Element) => {
    for (const child of [...node.children]) {
      if (blockedTags.has(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith("on") || name === "srcdoc") child.removeAttribute(attribute.name);
        if ((name === "href" || name === "src") && /^(javascript|data):/i.test(value)) child.removeAttribute(attribute.name);
      }
      clean(child);
    }
  };
  clean(root);
  return root.innerHTML;
}
