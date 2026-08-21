export type FactoryLabelTsplInput = {
  orderNumber: string;
  deliveryDate: string;
  labelName: string;
  remarks: string[];
  copies: number;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const LABEL_WIDTH_DOTS = 400;

type GraphemeSegmenter = {
  segment(text: string): Iterable<{ segment: string }>;
};

type GraphemeSegmenterConstructor = new (
  locale: string,
  options: { granularity: "grapheme" },
) => GraphemeSegmenter;

function graphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (Intl as unknown as {
      Segmenter: GraphemeSegmenterConstructor;
    }).Segmenter;
    return [...new Segmenter("zh-Hant", { granularity: "grapheme" }).segment(value)]
      .map((entry) => entry.segment);
  }
  return [...value];
}

export function sanitizeTsplText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function wrapLabelText(value: string, maxCharacters = 8): string[] {
  const characters = graphemes(sanitizeTsplText(value));
  const lines: string[] = [];
  for (let offset = 0; offset < characters.length; offset += maxCharacters) {
    lines.push(characters.slice(offset, offset + maxCharacters).join(""));
  }
  return lines;
}

function formatDeliveryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return sanitizeTsplText(value);
  const [, year, month, day] = match;
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  return `${day}/${month}/${year}（${WEEKDAYS[weekday]}）`;
}

function estimatedWidth(value: string, xScale: number): number {
  return graphemes(value).reduce((width, character) => {
    return width + (/^[\x20-\x7e]$/.test(character) ? 12 : 24) * xScale;
  }, 0);
}

function centeredText(y: number, value: string, xScale = 1, yScale = 1): string {
  const x = Math.max(8, Math.floor((LABEL_WIDTH_DOTS - estimatedWidth(value, xScale)) / 2));
  return `TEXT ${x},${y},"TST24.BF2",0,${xScale},${yScale},"${value}"`;
}

export function buildFactoryLabelTspl(input: FactoryLabelTsplInput): string {
  const copies = Math.min(100, Math.max(1, Math.floor(Number(input.copies) || 1)));
  const orderNumber = sanitizeTsplText(input.orderNumber).replace(/^#/, "");
  const deliveryDate = formatDeliveryDate(input.deliveryDate);
  const labelLines = wrapLabelText(input.labelName, 8).slice(0, 2);
  const remarkLines = input.remarks
    .flatMap((remark) => wrapLabelText(remark, 8))
    .filter(Boolean)
    .slice(0, 2);
  const bodyLines = [...labelLines, ...remarkLines].slice(0, 4);

  const command = Array.from({ length: copies }, () => {
    const lines = [
      "SIZE 50 mm,75 mm",
      "GAP 2 mm,0",
      "DIRECTION 1",
      "CODEPAGE 950",
      "CLS",
      centeredText(20, orderNumber, 2, 2),
      "BAR 16,88,368,2",
      centeredText(106, "送貨日期"),
      centeredText(145, deliveryDate),
      "BAR 16,184,368,2",
      centeredText(204, `1份 / 共${copies}份`),
    ];
    bodyLines.forEach((line, lineIndex) => {
      lines.push(centeredText(258 + lineIndex * 66, line, 2, 2));
    });
    lines.push("PRINT 1");
    return lines.join("\r\n");
  }).join("\r\n");

  // TSPL parsers execute a command only after its CRLF terminator. Without
  // this final line ending QZ can successfully spool the job while the
  // printer keeps waiting and never executes the last (or only) PRINT.
  return `${command}\r\n`;
}
