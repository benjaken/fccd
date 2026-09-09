import { useLayoutEffect, type RefObject } from "react";

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
  if (target !== document.body && target.tabIndex < 0) target.tabIndex = -1;
  if (typeof target.focus !== "function") return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    // Ignore environments that reject programmatic focus.
  }
}

function pageScroller() {
  const scroller = document.scrollingElement;
  if (scroller && "scrollTop" in scroller && "scrollHeight" in scroller) {
    return scroller as HTMLElement;
  }
  return document.documentElement;
}

/**
 * Scroll the window. Do not lock the editor with inline position/overflow —
 * those styles collapse print height and produce blank PDF pages.
 */
export function useDocumentEditorWindowScroll(_containerRef?: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    activateDocumentEditorWindowScroll();

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isNestedScroller(event.target)) return;
      const scroller = pageScroller();
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
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);
}
