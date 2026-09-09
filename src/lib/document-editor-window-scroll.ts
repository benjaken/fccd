import { useLayoutEffect } from "react";

const UNLOCK: Array<[string, string]> = [
  ["overflow-x", "visible"],
  ["overflow-y", "auto"],
  ["height", "auto"],
  ["max-height", "none"],
];

function applyImportant(node: HTMLElement, property: string, value: string) {
  node.style.setProperty(property, value, "important");
}

/**
 * Quote / receipt / invoice PDF pages must scroll with the window.
 * Nested 100dvh + overflow:hidden shells clip extra A4 sheets, and
 * overflow-x:clip on html/body computes overflow-y to clip.
 */
export function useDocumentEditorWindowScroll() {
  useLayoutEffect(() => {
    const nodes = [document.documentElement, document.body, document.getElementById("root")].filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    const previous = nodes.map((node) =>
      UNLOCK.map(([property]) => ({
        node,
        property,
        value: node.style.getPropertyValue(property),
        priority: node.style.getPropertyPriority(property),
      })),
    );

    for (const node of nodes) {
      for (const [property, value] of UNLOCK) applyImportant(node, property, value);
    }
    applyImportant(document.documentElement, "overflow-y", "scroll");

    return () => {
      for (const entries of previous) {
        for (const entry of entries) {
          if (entry.value) entry.node.style.setProperty(entry.property, entry.value, entry.priority);
          else entry.node.style.removeProperty(entry.property);
        }
      }
    };
  }, []);
}
