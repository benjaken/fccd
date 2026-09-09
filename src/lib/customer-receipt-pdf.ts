import { pdfFilename } from "@/lib/print-pdf";

async function rasterizeReceiptSvgImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    let pathname = "";
    try { pathname = new URL(image.currentSrc || image.src, window.location.href).pathname; } catch { return; }
    if (!pathname.toLowerCase().endsWith(".svg")) return;
    try {
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) return;
      const width = Math.min(image.naturalWidth, 800);
      const height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      image.src = canvas.toDataURL("image/png");
      await image.decode();
    } catch {
      // html2canvas can still attempt the original image if rasterizing fails.
    }
  }));
}

export async function createCustomerReceiptPdf(
  element: HTMLElement,
  orderNumber: string,
): Promise<{ blob: Blob; filename: string }> {
  await rasterizeReceiptSvgImages(element);
  await Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    ...Array.from(element.querySelectorAll("img"), async (image) => {
      try {
        await image.decode();
      } catch {
        // Keep generating so a broken optional image cannot block the receipt.
      }
    }),
  ]);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const previousTransform = element.style.transform;
  element.style.transform = "none";
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, {
      width: element.offsetWidth,
      height: element.offsetHeight,
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      onclone: (clonedDocument, clonedElement) => {
        clonedElement.style.transform = "none";
      const safeColors: Record<string, string> = {
        "--background": "#ffffff",
        "--foreground": "#111111",
        "--card": "#ffffff",
        "--card-foreground": "#111111",
        "--popover": "#ffffff",
        "--popover-foreground": "#111111",
        "--primary": "#24814a",
        "--primary-foreground": "#ffffff",
        "--secondary": "#f1f6f3",
        "--secondary-foreground": "#17251d",
        "--muted": "#f1f6f3",
        "--muted-foreground": "#65736a",
        "--accent": "#eaf6ee",
        "--accent-foreground": "#196738",
        "--destructive": "#b42318",
        "--border": "#dfe8e2",
        "--input": "#dfe8e2",
        "--ring": "#24814a",
      };
      Object.entries(safeColors).forEach(([property, value]) => {
        clonedDocument.documentElement.style.setProperty(property, value);
      });
      clonedDocument.documentElement.style.background = "#ffffff";
      clonedDocument.documentElement.style.color = "#000000";
      clonedDocument.body.style.background = "#ffffff";
      clonedDocument.body.style.color = "#000000";
      let ancestor = clonedElement.parentElement;
      while (ancestor) {
        ancestor.style.background = "#ffffff";
        ancestor.style.color = "#000000";
        ancestor.style.borderColor = "#dfe8e2";
        ancestor.style.overflow = "visible";
        ancestor = ancestor.parentElement;
      }
      clonedElement.querySelectorAll<HTMLElement>("*").forEach((node) => {
        node.style.borderColor = "#dfe8e2";
        node.style.outlineColor = "#24814a";
      });
      },
    });
  } finally {
    element.style.transform = previousTransform;
  }
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
  return { blob: pdf.output("blob"), filename: pdfFilename("收據REC-", orderNumber) };
}

export function downloadCustomerReceipt(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
