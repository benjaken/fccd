import { useLayoutEffect, type RefObject } from "react";

const UNLOCK: Array<[string, string]> = [
  ["overflow-x", "visible"],
  ["overflow-y", "auto"],
  ["height", "auto"],
  ["max-height", "none"],
];

function applyImportant(node: HTMLElement, property: string, value: string) {
  node.style.setProperty(property, value, "important");
}

function wheelDelta(event: WheelEvent) {
  return event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
}

function isNestedScroller(node: EventTarget | null) {
  let candidate = node instanceof Element ? node : null;
  while (
    candidate
    && candidate !== document.documentElement
    && candidate !== document.body
    && candidate.id !== "root"
  ) {
    const style = window.getComputedStyle(candidate);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY)
      && candidate.scrollHeight > candidate.clientHeight + 1
    ) {
      return true;
    }
    candidate = candidate.parentElement;
  }
  return false;
}

export function activateDocumentEditorWindowScroll(container?: HTMLElement | null) {
  const target = container ?? document.body;
  if (target !== document.body && target.tabIndex < 0) target.tabIndex = -1;
  if (typeof target.focus !== "function") return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    // Ignore environments that reject programmatic focus.
  }
}

/**
 * Quote / receipt / invoice PDF pages must scroll with the window immediately.
 * New-tab opens and overflow-hidden fields otherwise swallow wheel until click.
 */
export function useDocumentEditorWindowScroll(containerRef?: RefObject<HTMLElement | null>) {
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
    activateDocumentEditorWindowScroll(containerRef?.current);

    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || isNestedScroller(event.target)) return;
      const scroller = document.scrollingElement;
      if (!scroller) return;
      const before = scroller.scrollTop;
      const delta = wheelDelta(event);
      if (delta === 0) return;
      requestAnimationFrame(() => {
        if (Math.abs(scroller.scrollTop - before) > 0.5) return;
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (max <= 1) return;
        scroller.scrollTop = Math.min(max, Math.max(0, before + delta));
      });
    };

    window.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      for (const entries of previous) {
        for (const entry of entries) {
          if (entry.value) entry.node.style.setProperty(entry.property, entry.value, entry.priority);
          else entry.node.style.removeProperty(entry.property);
        }
      }
    };
  }, [containerRef]);
}
