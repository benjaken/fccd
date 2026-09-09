import { useLayoutEffect, type RefObject } from "react";

const PAGE_LOCK: Array<[string, string]> = [
  ["overflow", "hidden"],
  ["height", "100%"],
  ["max-height", "100%"],
];

const EDITOR_LOCK: Array<[string, string]> = [
  ["position", "fixed"],
  ["inset", "0px"],
  ["width", "100%"],
  ["height", "100%"],
  ["max-height", "100%"],
  ["overflow", "auto"],
];

type StyleSnapshot = {
  node: HTMLElement;
  property: string;
  value: string;
  priority: string;
};

function applyImportant(node: HTMLElement, property: string, value: string) {
  node.style.setProperty(property, value, "important");
}

function snapshotAndLock(node: HTMLElement, lock: Array<[string, string]>): StyleSnapshot[] {
  const snapshots = lock.map(([property]) => ({
    node,
    property,
    value: node.style.getPropertyValue(property),
    priority: node.style.getPropertyPriority(property),
  }));
  for (const [property, value] of lock) applyImportant(node, property, value);
  return snapshots;
}

function restore(snapshots: StyleSnapshot[]) {
  for (const entry of snapshots) {
    if (entry.value) entry.node.style.setProperty(entry.property, entry.value, entry.priority);
    else entry.node.style.removeProperty(entry.property);
  }
}

function wheelDelta(event: WheelEvent, axis: "x" | "y") {
  const value = axis === "x" ? event.deltaX : event.deltaY;
  return event.deltaMode === 1 ? value * 16 : value;
}

function isNestedScroller(node: EventTarget | null) {
  let candidate = node instanceof Element ? node : null;
  while (
    candidate
    && candidate !== document.documentElement
    && candidate !== document.body
    && candidate.id !== "root"
    && !candidate.classList.contains("quote-pdf-editor")
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
  const target =
    container ?? document.querySelector<HTMLElement>(".quote-pdf-editor") ?? document.body;
  if (target.classList.contains("quote-pdf-editor")) {
    for (const [property, value] of EDITOR_LOCK) applyImportant(target, property, value);
  }
  if (target !== document.body && target.tabIndex < 0) target.tabIndex = -1;
  if (typeof target.focus !== "function") return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    // Ignore environments that reject programmatic focus.
  }
}

function editorScroller(containerRef?: RefObject<HTMLElement | null>) {
  return containerRef?.current ?? document.querySelector<HTMLElement>(".quote-pdf-editor");
}

/**
 * The PDF editor is the scroll container. Wheel events are applied to it in
 * capture phase because overflow:hidden A4 sheets otherwise become the
 * browser's scroll target until the page is clicked.
 */
export function useDocumentEditorWindowScroll(containerRef?: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const pageNodes = [document.documentElement, document.body, document.getElementById("root")].filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    const pageSnapshots = pageNodes.flatMap((node) => snapshotAndLock(node, PAGE_LOCK));
    let editorSnapshots: StyleSnapshot[] = [];

    const lockEditor = (node: HTMLElement) => {
      if (editorSnapshots.some((entry) => entry.node === node)) return;
      editorSnapshots = editorSnapshots.concat(snapshotAndLock(node, EDITOR_LOCK));
    };

    const existing = editorScroller(containerRef);
    if (existing) lockEditor(existing);

    const observer = new MutationObserver(() => {
      const found = editorScroller(containerRef);
      if (found) lockEditor(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isNestedScroller(event.target)) return;
      const scroller = editorScroller(containerRef);
      if (!scroller) return;
      lockEditor(scroller);
      const deltaY = wheelDelta(event, "y");
      const deltaX = wheelDelta(event, "x");
      const maxY = scroller.scrollHeight - scroller.clientHeight;
      const maxX = scroller.scrollWidth - scroller.clientWidth;
      const nextTop = Math.min(Math.max(maxY, 0), Math.max(0, scroller.scrollTop + deltaY));
      const nextLeft = Math.min(Math.max(maxX, 0), Math.max(0, scroller.scrollLeft + deltaX));
      if (nextTop === scroller.scrollTop && nextLeft === scroller.scrollLeft) return;
      if (event.cancelable) event.preventDefault();
      scroller.scrollTop = nextTop;
      scroller.scrollLeft = nextLeft;
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", onWheel, true);
      restore(editorSnapshots);
      restore(pageSnapshots);
    };
  }, [containerRef]);
}
