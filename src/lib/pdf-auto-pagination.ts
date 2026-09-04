import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const PAGE_SELECTOR = "[data-pdf-auto-page]";
const MODULE_SELECTOR = "[data-pdf-auto-module-index]";
const FOOTER_SELECTOR = "[data-pdf-auto-footer]";
const PRODUCT_PAGE_SELECTOR = "[data-pdf-product-page]";
const PRODUCT_ROW_SELECTOR = "[data-pdf-auto-product-index]";
const PRODUCT_TABLE_SELECTOR = "[data-pdf-auto-product-table]";
const LAYOUT_ANCHOR_SELECTOR = "[data-pdf-auto-layout-anchor]";

type FocusSnapshot = {
  tagName: string;
  fieldIndex: number;
  id: string;
  name: string;
  ariaLabel: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
  viewportTop: number;
};

function captureFocusedField(container: HTMLElement): FocusSnapshot | null {
  const activeElement = document.activeElement;
  if (
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
    || !container.contains(activeElement)
  ) return null;

  return {
    tagName: activeElement.tagName,
    fieldIndex: Array.from(container.querySelectorAll("input, textarea")).indexOf(activeElement),
    id: activeElement.id,
    name: activeElement.name,
    ariaLabel: activeElement.getAttribute("aria-label") ?? "",
    value: activeElement.value,
    selectionStart: activeElement.selectionStart,
    selectionEnd: activeElement.selectionEnd,
    selectionDirection: activeElement.selectionDirection,
    viewportTop: activeElement.getBoundingClientRect().top,
  };
}

function restoreFocusedField(container: HTMLElement | null, snapshot: FocusSnapshot | null) {
  if (!container || !snapshot) return;

  const fields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const hasStableIdentity = Boolean(snapshot.id || snapshot.name || snapshot.ariaLabel);
  const field = hasStableIdentity
    ? fields.find((candidate) => (
        candidate.tagName === snapshot.tagName
        && (snapshot.id ? candidate.id === snapshot.id : true)
        && (snapshot.name ? candidate.name === snapshot.name : true)
        && (snapshot.ariaLabel ? candidate.getAttribute("aria-label") === snapshot.ariaLabel : true)
      ))
    : fields[snapshot.fieldIndex];
  if (!field) return;

  if (field.value !== snapshot.value) {
    // A field moved between page subtrees is remounted with its last committed
    // prop value. Replaying the live DOM value through React keeps uncommitted
    // typing/deletion in the field's local editing state as well.
    field.value = snapshot.value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  field.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection ?? undefined);
  }
  const scrollAdjustment = field.getBoundingClientRect().top - snapshot.viewportTop;
  if (Math.abs(scrollAdjustment) > 0.5) window.scrollBy({ top: scrollAdjustment, behavior: "instant" });
}

const PRINT_HIDDEN_DOCUMENT_SELECTOR = [
  ".quote-pdf-additional.is-empty",
  ".quote-pdf-activity.is-empty",
  ".quote-pdf-notes.is-empty",
  ".quote-pdf-note-block.is-empty",
].join(", ");

const PRINTABLE_DOCUMENT_SELECTOR = [
  ".quote-pdf-signature",
  ".quote-pdf-additional:not(.is-empty)",
  ".quote-pdf-activity:not(.is-empty)",
  ".quote-pdf-note-block:not(.is-empty)",
  ".quote-pdf-table",
].join(", ");

export function isPrintHiddenPdfModule(module: HTMLElement) {
  if (module.classList.contains("is-empty") || module.classList.contains("quote-pdf-edit-only")) {
    return true;
  }
  if (!module.querySelector(PRINT_HIDDEN_DOCUMENT_SELECTOR)) return false;
  return !module.querySelector(PRINTABLE_DOCUMENT_SELECTOR);
}

function outerHeight(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return rect.height
    + (Number.parseFloat(styles.marginTop) || 0)
    + (Number.parseFloat(styles.marginBottom) || 0);
}

function printHiddenHeightBefore(module: HTMLElement, page: HTMLElement) {
  const moduleTop = module.getBoundingClientRect().top;
  const modules = Array.from(page.querySelectorAll<HTMLElement>(MODULE_SELECTOR));
  const modulePosition = modules.indexOf(module);
  return modules
    .slice(0, Math.max(modulePosition, 0))
    .filter(isPrintHiddenPdfModule)
    .filter((element) => element.getBoundingClientRect().bottom <= moduleTop + 1)
    .reduce((height, element) => height + outerHeight(element), 0);
}

export function pdfModulePrintableBottom(module: HTMLElement, page: HTMLElement) {
  return module.getBoundingClientRect().bottom - printHiddenHeightBefore(module, page);
}

function pageContentBottom(page: HTMLElement, footer: HTMLElement) {
  const pageRect = page.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();

  // Once a fixed-height sheet overflows, its flex footer is pushed below the
  // visible A4 box. Using that displaced footer as the boundary makes clipped
  // modules look as though they still fit. Reconstruct the footer's intended
  // top edge from the sheet itself and clamp to it. When both the sheet and
  // footer have zero-sized rectangles, layout has not happened yet (for
  // example during a DOM-only test), so do not create a false page break from
  // zero-sized rectangles. A measured footer is still useful for test
  // doubles that do not provide a sheet rectangle.
  if (pageRect.height <= 0 && footerRect.height <= 0) return Number.POSITIVE_INFINITY;
  if (pageRect.height <= 0) return footerRect.top;

  const paddingBottom = Number.parseFloat(window.getComputedStyle(page).paddingBottom) || 0;
  const intendedFooterTop = pageRect.bottom - paddingBottom - footerRect.height;
  return Math.min(footerRect.top, intendedFooterTop);
}

function observedLayoutElements(container: HTMLElement, selectors: string) {
  return Array.from(new Set(container.querySelectorAll<HTMLElement>(
    `${selectors}, ${LAYOUT_ANCHOR_SELECTOR}`,
  )));
}

function useLatePdfLayoutRevision(
  containerRef: RefObject<HTMLElement | null>,
  onLayoutChange: () => void,
  dependencies: readonly unknown[],
) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleLateLayout = () => onLayoutChange();
    const pendingImages = Array.from(container.querySelectorAll<HTMLImageElement>("img:not([data-pdf-layout-ready])"));
    for (const image of pendingImages) {
      if (image.complete) image.dataset.pdfLayoutReady = "true";
      else {
        image.addEventListener("load", handleLateLayout, { once: true });
        image.addEventListener("error", handleLateLayout, { once: true });
      }
    }

    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", handleLateLayout);
    window.addEventListener("resize", handleLateLayout);

    return () => {
      for (const image of pendingImages) {
        image.removeEventListener("load", handleLateLayout);
        image.removeEventListener("error", handleLateLayout);
      }
      fonts?.removeEventListener?.("loadingdone", handleLateLayout);
      window.removeEventListener("resize", handleLateLayout);
    };
  // The caller controls when newly rendered pages and images need listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}

export function splitPdfModuleIndexes(moduleCount: number, pageBreaks: number[]) {
  // A break at 0 is valid: it leaves the product page's trailing area empty
  // and moves the first trailing module to a continuation page.
  const starts = [0, ...pageBreaks.filter((index) => index >= 0 && index < moduleCount)];
  return starts.map((start, pageIndex) => {
    const end = starts[pageIndex + 1] ?? moduleCount;
    return Array.from({ length: end - start }, (_, index) => start + index);
  });
}

export function usePdfAutoPageBreaks(
  containerRef: RefObject<HTMLElement | null>,
  moduleCount: number,
  resetKey: string,
) {
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const previousResetKey = useRef(resetKey);
  const rejectedMerges = useRef(new Set<number>());
  const mergeTrial = useRef<{ removedBreak: number; previousBreaks: number[] } | null>(null);
  const pendingFocusRestore = useRef<FocusSnapshot | null>(null);

  useLatePdfLayoutRevision(
    containerRef,
    () => setLayoutRevision((current) => current + 1),
    [containerRef, moduleCount, pageBreaks, resetKey],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    restoreFocusedField(container, pendingFocusRestore.current);
    pendingFocusRestore.current = null;

    const updatePageBreaks = (next: number[] | ((current: number[]) => number[])) => {
      if (container) pendingFocusRestore.current = captureFocusedField(container);
      setPageBreaks(next);
    };

    if (previousResetKey.current !== resetKey) {
      previousResetKey.current = resetKey;
      rejectedMerges.current.clear();
      mergeTrial.current = null;
      if (pageBreaks.length) {
        updatePageBreaks([]);
        return;
      }
    }

    if (!container || !moduleCount) return;

    const pages = Array.from(container.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
    for (const page of pages) {
      const footer = page.querySelector<HTMLElement>(FOOTER_SELECTOR);
      const modules = Array.from(page.querySelectorAll<HTMLElement>(MODULE_SELECTOR));
      if (!footer || !modules.length) continue;

      const footerTop = pageContentBottom(page, footer);
      const overflowingModule = modules.find((module) => (
        !isPrintHiddenPdfModule(module)
        && pdfModulePrintableBottom(module, page) > footerTop - 1
      ));
      if (!overflowingModule) continue;

      const moduleIndex = Number(overflowingModule.dataset.pdfAutoModuleIndex);
      const isModuleOnlyPage = page.dataset.pdfAutoPage === "modules";
      if (!Number.isInteger(moduleIndex)) continue;

      if (mergeTrial.current) {
        const trial = mergeTrial.current;
        mergeTrial.current = null;
        rejectedMerges.current.add(trial.removedBreak);
        updatePageBreaks(trial.previousBreaks);
        return;
      }

      if (isModuleOnlyPage && modules.length === 1 && modules[0] === overflowingModule) continue;
      if (pageBreaks.includes(moduleIndex)) continue;

      updatePageBreaks((current) => [...current, moduleIndex].sort((left, right) => left - right));
      return;
    }

    mergeTrial.current = null;
    const activeElement = document.activeElement;
    const fieldIsBeingEdited = (
      (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      && container.contains(activeElement)
    );
    // Shrinking content can make an existing continuation page merge back into
    // the previous page. Defer that disruptive move until editing finishes so
    // backspace/delete never moves the field out from under the caret.
    if (fieldIsBeingEdited) return;

    const removableBreak = pageBreaks.find((pageBreak) => !rejectedMerges.current.has(pageBreak));
    if (removableBreak !== undefined) {
      mergeTrial.current = { removedBreak: removableBreak, previousBreaks: pageBreaks };
      updatePageBreaks((current) => current.filter((pageBreak) => pageBreak !== removableBreak));
    }
  }, [containerRef, layoutRevision, moduleCount, pageBreaks, resetKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observedElements = observedLayoutElements(
      container,
      `${PAGE_SELECTOR}, ${MODULE_SELECTOR}, ${FOOTER_SELECTOR}`,
    );
    const sizes = new Map<Element, { width: number; height: number }>();
    for (const element of observedElements) {
      const rect = element.getBoundingClientRect();
      sizes.set(element, { width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver(() => {
      const changed = observedElements.some((element) => {
        const previous = sizes.get(element);
        const rect = element.getBoundingClientRect();
        return !previous || Math.abs(previous.width - rect.width) > 0.5 || Math.abs(previous.height - rect.height) > 0.5;
      });
      if (!changed) return;

      for (const element of observedElements) {
        const rect = element.getBoundingClientRect();
        sizes.set(element, { width: rect.width, height: rect.height });
      }

      pendingFocusRestore.current = captureFocusedField(container);
      rejectedMerges.current.clear();
      mergeTrial.current = null;
      setLayoutRevision((current) => current + 1);
    });
    for (const element of observedElements) observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, moduleCount, pageBreaks, resetKey]);

  return pageBreaks;
}

/**
 * Measures rendered product rows against the usable space above the page
 * footer. Product rows are deliberately not assigned a fixed page capacity:
 * wrapped names, resized fields, fonts, and viewport scaling can all change
 * the row height.
 */
export function usePdfAutoProductPageBreaks(
  containerRef: RefObject<HTMLElement | null>,
  lineCount: number,
  resetKey: string,
) {
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const previousResetKey = useRef(resetKey);
  const rejectedMerges = useRef(new Set<number>());
  const mergeTrial = useRef<{ removedBreak: number; previousBreaks: number[] } | null>(null);
  const pendingFocusRestore = useRef<FocusSnapshot | null>(null);

  useLatePdfLayoutRevision(
    containerRef,
    () => setLayoutRevision((current) => current + 1),
    [containerRef, lineCount, pageBreaks, resetKey],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    restoreFocusedField(container, pendingFocusRestore.current);
    pendingFocusRestore.current = null;

    const updatePageBreaks = (next: number[] | ((current: number[]) => number[])) => {
      if (container) pendingFocusRestore.current = captureFocusedField(container);
      setPageBreaks(next);
    };

    if (previousResetKey.current !== resetKey) {
      previousResetKey.current = resetKey;
      rejectedMerges.current.clear();
      mergeTrial.current = null;
      if (pageBreaks.length) {
        updatePageBreaks([]);
        return;
      }
    }

    if (!container || !lineCount) return;

    const pages = Array.from(container.querySelectorAll<HTMLElement>(PRODUCT_PAGE_SELECTOR));
    for (const page of pages) {
      const footer = page.querySelector<HTMLElement>(FOOTER_SELECTOR);
      const rows = Array.from(page.querySelectorAll<HTMLElement>(PRODUCT_ROW_SELECTOR));
      if (!footer || !rows.length) continue;

      const footerTop = pageContentBottom(page, footer);
      const overflowingRow = rows.find((row) => row.getBoundingClientRect().bottom > footerTop - 1);
      const table = page.querySelector<HTMLElement>(PRODUCT_TABLE_SELECTOR);
      const tableOverflows = Boolean(table && table.getBoundingClientRect().bottom > footerTop - 1);
      if (!overflowingRow && !tableOverflows) continue;

      // Totals and adjustments are rendered only on the final product page.
      // They can cross the footer even when every individual product row fits.
      // Moving the last row starts a continuation page that carries both that
      // row and the totals, then the next layout pass can split again if needed.
      const breakRow = overflowingRow ?? rows.at(-1);
      if (!breakRow) continue;
      const lineIndex = Number(breakRow.getAttribute("data-pdf-auto-product-index"));
      const firstLineIndex = Number(rows[0].getAttribute("data-pdf-auto-product-index"));
      if (!Number.isInteger(lineIndex) || !Number.isInteger(firstLineIndex) || lineIndex <= firstLineIndex) continue;

      if (mergeTrial.current) {
        const trial = mergeTrial.current;
        mergeTrial.current = null;
        rejectedMerges.current.add(trial.removedBreak);
        updatePageBreaks(trial.previousBreaks);
        return;
      }

      if (pageBreaks.includes(lineIndex)) continue;

      updatePageBreaks((current) => [...current, lineIndex].sort((left, right) => left - right));
      return;
    }

    mergeTrial.current = null;
    const activeElement = document.activeElement;
    const fieldIsBeingEdited = (
      (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      && container.contains(activeElement)
    );
    if (fieldIsBeingEdited) return;

    const removableBreak = pageBreaks.find((pageBreak) => !rejectedMerges.current.has(pageBreak));
    if (removableBreak !== undefined) {
      mergeTrial.current = { removedBreak: removableBreak, previousBreaks: pageBreaks };
      updatePageBreaks((current) => current.filter((pageBreak) => pageBreak !== removableBreak));
    }
  }, [containerRef, layoutRevision, lineCount, pageBreaks, resetKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observedElements = observedLayoutElements(
      container,
      `${PRODUCT_PAGE_SELECTOR}, ${PRODUCT_ROW_SELECTOR}, ${PRODUCT_TABLE_SELECTOR}, ${FOOTER_SELECTOR}`,
    );
    const sizes = new Map<Element, { width: number; height: number }>();
    for (const element of observedElements) {
      const rect = element.getBoundingClientRect();
      sizes.set(element, { width: rect.width, height: rect.height });
    }

    const observer = new ResizeObserver(() => {
      const changed = observedElements.some((element) => {
        const previous = sizes.get(element);
        const rect = element.getBoundingClientRect();
        return !previous || Math.abs(previous.width - rect.width) > 0.5 || Math.abs(previous.height - rect.height) > 0.5;
      });
      if (!changed) return;

      for (const element of observedElements) {
        const rect = element.getBoundingClientRect();
        sizes.set(element, { width: rect.width, height: rect.height });
      }

      pendingFocusRestore.current = captureFocusedField(container);
      rejectedMerges.current.clear();
      mergeTrial.current = null;
      setLayoutRevision((current) => current + 1);
    });
    for (const element of observedElements) observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, lineCount, pageBreaks, resetKey]);

  return pageBreaks;
}
