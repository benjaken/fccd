const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(INVALID_FILENAME_CHARACTERS, "-")
    .replace(/[. ]+$/g, "");
}

export function pdfFilename(documentName: string, documentNumber: string): string {
  const name = sanitizeFilenamePart(documentName) || "文件";
  const number = sanitizeFilenamePart(documentNumber);
  return `${name}${number}.pdf`;
}

/**
 * Browsers use the document title as the default filename for "Save as PDF".
 * `window.print()` blocks while the native print dialog is open, so the title
 * can be restored immediately after it returns without changing the suggestion.
 */
export function printPdf(documentName: string, documentNumber: string): void {
  const previousTitle = document.title;
  const filename = pdfFilename(documentName, documentNumber);
  document.title = filename.replace(/\.pdf$/i, "");
  try {
    window.print();
  } finally {
    document.title = previousTitle;
  }
}
