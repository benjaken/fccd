import { useEffect, useMemo, useRef, useState } from "react";
import { FileSearch, Minus, Plus, RefreshCw } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

import type { SupplierQuoteEvidence, SupplierQuoteExtraction } from "@/lib/supplier-quote-api";

type PreviewLine = {
  productName: string;
  productNameZh: string;
  sourcePage: number;
  sourceText: string;
  evidence: SupplierQuoteEvidence[];
};

type EvidenceBox = { x: number; y: number; width: number; height: number };

function normalizedText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export function findSupplierQuoteEvidenceBox(
  extraction: SupplierQuoteExtraction | null,
  line: PreviewLine | null,
): EvidenceBox | null {
  if (!extraction || !line) return null;
  const page = extraction.pages.find((entry) => entry.page === line.sourcePage);
  if (!page) return null;
  const targets = [...line.evidence.map((entry) => entry.text), line.sourceText]
    .map(normalizedText).filter((entry) => entry.length >= 2);
  if (!targets.length) return null;
  const matches = page.items.filter((item) => {
    const text = normalizedText(item.text);
    return text.length >= 2 && targets.some((target) => target.includes(text) || text.includes(target));
  });
  if (!matches.length) return null;

  const rows: typeof matches[] = [];
  for (const item of matches) {
    const tolerance = Math.max(4, item.bbox.height * 0.75);
    const row = rows.find((group) => Math.abs(group[0].bbox.y - item.bbox.y) <= tolerance);
    (row ?? rows[rows.push([]) - 1]).push(item);
  }
  const best = rows.sort((left, right) => {
    const score = (items: typeof matches) => items.reduce((sum, item) => sum + normalizedText(item.text).length, 0);
    return score(right) - score(left);
  })[0];
  const x = Math.max(0, Math.min(...best.map((item) => item.bbox.x)) - 4);
  const bottom = Math.max(0, Math.min(...best.map((item) => item.bbox.y)) - 3);
  const right = Math.min(page.width, Math.max(...best.map((item) => item.bbox.x + item.bbox.width)) + 4);
  const top = Math.min(page.height, Math.max(...best.map((item) => item.bbox.y + item.bbox.height)) + 3);
  return { x: x / page.width, y: 1 - top / page.height, width: (right - x) / page.width, height: (top - bottom) / page.height };
}

export function SupplierQuotePdfPreview({
  source,
  sourcePending = false,
  extraction,
  activeLine,
}: {
  source: string | File | null;
  sourcePending?: boolean;
  extraction: SupplierQuoteExtraction | null;
  activeLine: PreviewLine | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(typeof source === "string" ? source : null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(520);
  const [zoom, setZoom] = useState(1.75);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageNumber = Math.max(1, Math.min(activeLine?.sourcePage ?? 1, pdf?.numPages ?? Number.MAX_SAFE_INTEGER));
  const evidenceBox = useMemo(() => findSupplierQuoteEvidenceBox(extraction, activeLine), [activeLine, extraction]);

  useEffect(() => {
    if (typeof source === "string") {
      setSourceUrl(source);
      return;
    }
    if (!source || typeof URL.createObjectURL !== "function") {
      setSourceUrl(null);
      return;
    }
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width - 24)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sourceUrl) {
      setPdf(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    let task: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null = null;
    setLoading(true);
    setError(null);
    void import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      task = pdfjs.getDocument(sourceUrl);
      return task.promise;
    }).then((document) => {
      if (active && document) setPdf(document);
    }).catch(() => {
      if (active) setError("PDF 預覽載入失敗，請重新識別或稍後再試。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / Math.max(base.width, 1)) * zoom });
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return renderTask.promise;
    }).catch((renderError: unknown) => {
      if (!cancelled && !(renderError instanceof Error && renderError.name === "RenderingCancelledException")) {
        setError("PDF 頁面無法顯示。");
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, width, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !evidenceBox || !pdf) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max(0, evidenceBox.x * viewport.scrollWidth - viewport.clientWidth / 2),
        top: Math.max(0, evidenceBox.y * viewport.scrollHeight - viewport.clientHeight / 2),
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [evidenceBox, pageNumber, pdf, width, zoom]);

  return (
    <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-sm" aria-label="PDF 原文預覽">
      <header className="flex items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-3">
        <div className="min-w-0">
          <strong className="flex items-center gap-2 text-sm text-slate-900"><FileSearch className="size-4 text-blue-600" />PDF 原文定位</strong>
          <span className="mt-0.5 block truncate text-sm text-slate-500">{activeLine ? `${activeLine.productNameZh || activeLine.productName} · 第 ${pageNumber} 頁` : "滾動商品後自動定位"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.25))} aria-label="縮小 PDF"><Minus className="size-4" /></button>
          <button type="button" className="min-w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setZoom(1)} aria-label="PDF 適合寬度">{Math.round(zoom * 100)}%</button>
          <button type="button" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.25))} aria-label="放大 PDF"><Plus className="size-4" /></button>
          {pdf ? <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">{pageNumber} / {pdf.numPages}</span> : null}
        </div>
      </header>
      <div
        ref={viewportRef}
        className={`relative min-h-0 touch-none overflow-auto p-3 select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || !viewportRef.current) return;
          dragRef.current = { x: event.clientX, y: event.clientY, left: viewportRef.current.scrollLeft, top: viewportRef.current.scrollTop };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging || !viewportRef.current) return;
          viewportRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x);
          viewportRef.current.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
        aria-label="可拖動 PDF 畫布"
      >
        {!source && !sourcePending ? <div className="flex min-h-[30rem] items-center justify-center px-6 text-center text-sm leading-6 text-slate-500">找不到原 PDF 預覽，請使用「重新識別」恢復檔案資料。</div> : null}
        {sourcePending || loading ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-sm font-semibold text-blue-700"><RefreshCw className="mr-2 size-5 animate-spin" />正在載入 PDF</div> : null}
        {error ? <div className="absolute inset-x-3 top-3 z-20 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        <div className="relative mx-auto w-fit bg-white shadow-lg">
          <canvas ref={canvasRef} aria-label={`PDF 第 ${pageNumber} 頁`} />
          {evidenceBox ? <div
            className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-300/40 shadow-[0_0_0_3px_rgba(245,158,11,0.2)] transition-all duration-300"
            aria-label="目前商品在 PDF 原文中的位置"
            style={{ left: `${evidenceBox.x * 100}%`, top: `${evidenceBox.y * 100}%`, width: `${evidenceBox.width * 100}%`, height: `${evidenceBox.height * 100}%` }}
          /> : null}
        </div>
        {activeLine && !evidenceBox && !sourcePending && !loading && !error ? <p className="sticky bottom-2 mx-2 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow">已跳到第 {pageNumber} 頁；舊識別資料沒有足夠座標，無法精確框選。</p> : null}
      </div>
    </aside>
  );
}
