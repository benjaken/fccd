import { pdfFilename } from "@/lib/print-pdf";

export async function createCustomerReceiptPdf(
  element: HTMLElement,
  orderNumber: string,
): Promise<{ blob: Blob; filename: string }> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    onclone: (clonedDocument, clonedElement) => {
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
        ancestor = ancestor.parentElement;
      }
      clonedElement.querySelectorAll<HTMLElement>("*").forEach((node) => {
        node.style.borderColor = "#dfe8e2";
        node.style.outlineColor = "#24814a";
      });
    },
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = canvas.height * imageWidth / canvas.width;
  const fittedHeight = Math.min(imageHeight, pageHeight - margin * 2);
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, imageWidth, fittedHeight);
  return { blob: pdf.output("blob"), filename: pdfFilename("收據", orderNumber) };
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
