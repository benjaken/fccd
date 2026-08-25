import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const PAGE_SELECTOR = "[data-pdf-auto-page]";
const MODULE_SELECTOR = "[data-pdf-auto-module-index]";
const FOOTER_SELECTOR = "[data-pdf-auto-footer]";

function pageContentBottom(page: HTMLElement, footer: HTMLElement) {
  const pageRect = page.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();

  // Once a fixed-height sheet overflows, its flex footer is pushed below the
  // visible A4 box. Using that displaced footer as the boundary makes clipped
  // modules look as though they still fit. Reconstruct the footer's intended
  // top edge from the sheet itself and clamp to it.
  if (pageRect.height <= 0) return footerRect.top;

  const paddingBottom = Number.parseFloat(window.getComputedStyle(page).paddingBottom) || 0;
  const intendedFooterTop = pageRect.bottom - paddingBottom - footerRect.height;
  return Math.min(footerRect.top, intendedFooterTop);
}

export function splitPdfModuleIndexes(moduleCount: number, pageBreaks: number[]) {
  const starts = [0, ...pageBreaks.filter((index) => index > 0 && index < moduleCount)];
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

  useLayoutEffect(() => {
    if (previousResetKey.current !== resetKey) {
      previousResetKey.current = resetKey;
      rejectedMerges.current.clear();
      mergeTrial.current = null;
      if (pageBreaks.length) {
        setPageBreaks([]);
        return;
      }
    }

    const container = containerRef.current;
    if (!container || !moduleCount) return;

    const pages = Array.from(container.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
    for (const page of pages) {
      const footer = page.querySelector<HTMLElement>(FOOTER_SELECTOR);
      const modules = Array.from(page.querySelectorAll<HTMLElement>(MODULE_SELECTOR));
      if (!footer || !modules.length) continue;

      const footerTop = pageContentBottom(page, footer);
      const overflowingModule = modules.find((module) => module.getBoundingClientRect().bottom > footerTop - 1);
      if (!overflowingModule) continue;

      const moduleIndex = Number(overflowingModule.dataset.pdfAutoModuleIndex);
      const isModuleOnlyPage = page.dataset.pdfAutoPage === "modules";
      if (!Number.isInteger(moduleIndex)) continue;

      if (mergeTrial.current) {
        const trial = mergeTrial.current;
        mergeTrial.current = null;
        rejectedMerges.current.add(trial.removedBreak);
        setPageBreaks(trial.previousBreaks);
        return;
      }

      if (isModuleOnlyPage && modules.length === 1 && modules[0] === overflowingModule) continue;
      if (pageBreaks.includes(moduleIndex)) continue;

      setPageBreaks((current) => [...current, moduleIndex].sort((left, right) => left - right));
      return;
    }

    mergeTrial.current = null;
    const removableBreak = pageBreaks.find((pageBreak) => !rejectedMerges.current.has(pageBreak));
    if (removableBreak !== undefined) {
      mergeTrial.current = { removedBreak: removableBreak, previousBreaks: pageBreaks };
      setPageBreaks((current) => current.filter((pageBreak) => pageBreak !== removableBreak));
    }
  }, [containerRef, layoutRevision, moduleCount, pageBreaks, resetKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observedElements = Array.from(container.querySelectorAll<HTMLElement>(
      `${PAGE_SELECTOR}, ${MODULE_SELECTOR}, ${FOOTER_SELECTOR}`,
    ));
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

      rejectedMerges.current.clear();
      mergeTrial.current = null;
      setLayoutRevision((current) => current + 1);
    });
    for (const element of observedElements) observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, moduleCount, pageBreaks, resetKey]);

  return pageBreaks;
}
