export type FactoryDishLabelCommandInput = {
  kind?: "dish";
  orderNumber: string;
  deliveryDate: string;
  labelName: string;
  remarks: string[];
  copies: number;
};

export type FactoryAddressLabelCommandInput = {
  kind: "address";
  orderNumber: string;
  deliveryDate: string;
  district: string;
  customerName: string;
  customerPhone: string;
};

export type FactoryLabelCommandInput =
  | FactoryDishLabelCommandInput
  | FactoryAddressLabelCommandInput;

export type FactoryDishLabelLayout = {
  widthMm: 50;
  heightMm: 75;
  orderNumber: string;
  deliveryDate: string;
  copies: number;
  labelLines: string[];
  remarkLines: string[];
  bodyLines: Array<{ line: string; isDishName: boolean }>;
};

export type FactoryLabelCommandLoader = (
  input: FactoryLabelCommandInput,
) => Promise<string>;

export type FactoryTextBitmap = {
  width: number;
  height: number;
  bytes: Uint8Array;
};

export type FactoryTextBitmapOptions = {
  width: number;
  height: number;
  fontSize: number;
  fontWeight?: number;
  align?: "left" | "center";
  trailingBox?: boolean;
  fillWidth?: boolean;
};

export type FactoryTextRasterizer = (
  text: string,
  options: FactoryTextBitmapOptions,
) => Promise<FactoryTextBitmap>;

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const CONTENT_X = 8;
const CONTENT_WIDTH = 384;
const DISH_BODY_LINE_HEIGHT = 52;
const DISH_BODY_LINE_STEP = 76;
const FONT_FAMILY = '"Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

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

export function sanitizeFactoryLabelText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wrapFactoryLabelText(value: string, maxUnits: number): string[] {
  const characters = graphemes(sanitizeFactoryLabelText(value));
  const lines: string[] = [];
  let line = "";
  let lineUnits = 0;
  for (const character of characters) {
    // TSPL label text uses a proportional browser font. Printable ASCII is
    // roughly half the width of a CJK glyph, so do not waste a full CJK slot
    // on every digit or punctuation mark when deciding where to wrap.
    const characterUnits = /^[\x20-\x7e]$/.test(character) ? 0.5 : 1;
    if (line && lineUnits + characterUnits > maxUnits) {
      lines.push(line);
      line = "";
      lineUnits = 0;
    }
    line += character;
    lineUnits += characterUnits;
  }
  if (line) lines.push(line);
  return lines;
}

function wrapFactoryDishText(value: string, maxCharacters = 8): string[] {
  const characters = graphemes(sanitizeFactoryLabelText(value));
  const lines: string[] = [];
  for (let offset = 0; offset < characters.length; offset += maxCharacters) {
    lines.push(characters.slice(offset, offset + maxCharacters).join(""));
  }
  return lines;
}

export function buildFactoryDishLabelLayout(
  input: FactoryDishLabelCommandInput,
): FactoryDishLabelLayout {
  const copies = Math.min(100, Math.max(1, Math.floor(Number(input.copies) || 1)));
  const orderNumber = sanitizeFactoryLabelText(input.orderNumber).replace(/^#/, "");
  const deliveryDate = formatDeliveryDate(input.deliveryDate);
  const configuredLabelLines = input.labelName
    .split(/\r?\n/)
    .map(sanitizeFactoryLabelText)
    .filter(Boolean);
  const labelLines = configuredLabelLines.length > 1
    ? configuredLabelLines
      .slice(0, 2)
      .map((line) => graphemes(line).slice(0, 8).join(""))
    : wrapFactoryDishText(configuredLabelLines[0] ?? "", 8).slice(0, 2);
  const remarkLines = input.remarks
    .flatMap((remark) => wrapFactoryDishText(remark, 8))
    .filter(Boolean)
    .slice(0, 2);
  const bodyLines = [
    ...labelLines.map((line) => ({ line, isDishName: true })),
    ...remarkLines.map((line) => ({ line, isDishName: false })),
  ].slice(0, 4);
  return {
    widthMm: 50,
    heightMm: 75,
    orderNumber,
    deliveryDate,
    copies,
    labelLines,
    remarkLines,
    bodyLines,
  };
}

function formatDeliveryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return sanitizeFactoryLabelText(value);
  const [, year, month, day] = match;
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  return `${day}/${month}/${year}（${WEEKDAYS[weekday]}）`;
}

/** Converts RGBA canvas pixels to TSPL's 1-bit, MSB-first bitmap format. */
export function packFactoryBitmapPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 224,
): Uint8Array {
  if (width <= 0 || height <= 0 || width % 8 !== 0) {
    throw new Error("factory_bitmap_dimensions_invalid");
  }
  if (rgba.length !== width * height * 4) {
    throw new Error("factory_bitmap_pixels_invalid");
  }

  const widthBytes = width / 8;
  const packed = new Uint8Array(widthBytes * height);
  packed.fill(0xff);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = (y * width + x) * 4;
      const alpha = rgba[pixelOffset + 3] / 255;
      const red = rgba[pixelOffset] * alpha + 255 * (1 - alpha);
      const green = rgba[pixelOffset + 1] * alpha + 255 * (1 - alpha);
      const blue = rgba[pixelOffset + 2] * alpha + 255 * (1 - alpha);
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      if (luminance < threshold) {
        const byteOffset = y * widthBytes + Math.floor(x / 8);
        packed[byteOffset] &= ~(0x80 >> (x % 8));
      }
    }
  }
  return packed;
}

/** Rotates a packed monochrome bitmap for sideways printing on 50 x 75 mm stock. */
export function rotateFactoryBitmapClockwise(
  bitmap: FactoryTextBitmap,
): FactoryTextBitmap {
  if (bitmap.height % 8 !== 0) {
    throw new Error("factory_rotated_bitmap_width_invalid");
  }
  const width = bitmap.height;
  const height = bitmap.width;
  const widthBytes = width / 8;
  const bytes = new Uint8Array(widthBytes * height);
  bytes.fill(0xff);

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const sourceByte = bitmap.bytes[y * (bitmap.width / 8) + Math.floor(x / 8)];
      const isBlack = (sourceByte & (0x80 >> (x % 8))) === 0;
      if (!isBlack) continue;
      const rotatedX = bitmap.height - 1 - y;
      const rotatedY = x;
      bytes[rotatedY * widthBytes + Math.floor(rotatedX / 8)] &=
        ~(0x80 >> (rotatedX % 8));
    }
  }

  return { width, height, bytes };
}

export const rasterizeFactoryLabelText: FactoryTextRasterizer = async (
  value,
  {
    width,
    height,
    fontSize,
    fontWeight = 700,
    align = "center",
    trailingBox = false,
    fillWidth = false,
  },
) => {
  if (typeof document === "undefined") {
    throw new Error("factory_bitmap_canvas_unavailable");
  }
  if (width <= 0 || height <= 0 || width % 8 !== 0) {
    throw new Error("factory_bitmap_dimensions_invalid");
  }

  await document.fonts?.ready.catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("factory_bitmap_canvas_unavailable");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  const text = sanitizeFactoryLabelText(value);
  if (trailingBox) {
    const boxSize = Math.min(26, height - 8);
    const boxWidth = boxSize * 2;
    const boxGap = 10;
    const maxTextWidth = width - boxWidth - boxGap - 8;
    const renderedTextWidth = Math.min(context.measureText(text).width, maxTextWidth);
    const groupWidth = renderedTextWidth + boxGap + boxWidth;
    const startX = Math.max(4, (width - groupWidth) / 2);
    context.textAlign = "left";
    context.fillText(text, startX, height / 2, maxTextWidth);
    context.strokeStyle = "#000000";
    context.lineWidth = 2;
    context.strokeRect(
      startX + renderedTextWidth + boxGap,
      (height - boxSize) / 2,
      boxWidth,
      boxSize,
    );
  } else if (fillWidth && text) {
    const measuredWidth = context.measureText(text).width;
    const targetWidth = width - 4;
    const horizontalScale = measuredWidth > 0 ? targetWidth / measuredWidth : 1;
    context.save();
    context.translate(width / 2, height / 2);
    context.scale(horizontalScale, 1);
    context.textAlign = "center";
    context.fillText(text, 0, 0);
    context.restore();
  } else {
    context.textAlign = align;
    const x = align === "left" ? 4 : width / 2;
    context.fillText(text, x, height / 2, width - 8);
  }

  const pixels = context.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    bytes: packFactoryBitmapPixels(pixels, width, height),
  };
};

const ascii = (value: string) => new TextEncoder().encode(value);

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function command(value: string): Uint8Array {
  return ascii(`${value}\r\n`);
}

function bitmapCommand(x: number, y: number, bitmap: FactoryTextBitmap): Uint8Array {
  if (bitmap.width % 8 !== 0 || bitmap.bytes.length !== (bitmap.width / 8) * bitmap.height) {
    throw new Error("factory_bitmap_data_invalid");
  }
  return concatBytes([
    ascii(`BITMAP ${x},${y},${bitmap.width / 8},${bitmap.height},0,`),
    bitmap.bytes,
    ascii("\r\n"),
  ]);
}

async function textBitmap(
  rasterize: FactoryTextRasterizer,
  y: number,
  value: string,
  options: Omit<FactoryTextBitmapOptions, "width">,
  placement: { x?: number; width?: number } = {},
): Promise<Uint8Array> {
  const bitmap = await rasterize(value, {
    width: placement.width ?? CONTENT_WIDTH,
    ...options,
  });
  return bitmapCommand(placement.x ?? CONTENT_X, y, bitmap);
}

async function buildDishLabelBytes(
  input: FactoryDishLabelCommandInput,
  rasterize: FactoryTextRasterizer,
): Promise<Uint8Array> {
  const { copies, orderNumber, deliveryDate, bodyLines } = buildFactoryDishLabelLayout(input);
  const chunks: Uint8Array[] = [
    command("SIZE 50 mm,75 mm"),
    command("GAP 2 mm,0"),
    command("DIRECTION 1"),
    command("CLS"),
    await textBitmap(
      rasterize,
      0,
      orderNumber,
      { height: 120, fontSize: 120, fontWeight: 800, align: "center" },
      { x: 100, width: 200 },
    ),
    command("BAR 16,124,368,2"),
    await textBitmap(rasterize, 132, "－ 送貨日期 －", { height: 40, fontSize: 30, fontWeight: 800, align: "center" }),
    await textBitmap(rasterize, 170, deliveryDate, { height: 50, fontSize: 46, fontWeight: 800, align: "center" }),
    command("BAR 16,224,368,2"),
    await textBitmap(rasterize, 234, `1份 / 共${copies}份`, {
      height: 44,
      fontSize: 32,
      fontWeight: 700,
      align: "center",
      trailingBox: true,
    }),
  ];
  for (const [lineIndex, { line, isDishName }] of bodyLines.entries()) {
    chunks.push(await textBitmap(rasterize, 288 + lineIndex * DISH_BODY_LINE_STEP, line, {
      height: isDishName ? 60 : DISH_BODY_LINE_HEIGHT,
      fontSize: isDishName ? 54 : 52,
      fontWeight: 700,
      align: "center",
    }));
  }
  chunks.push(command("PRINT 1"));
  const label = concatBytes(chunks);
  return concatBytes(Array.from({ length: copies }, () => label));
}

async function buildAddressLabelBytes(
  input: FactoryAddressLabelCommandInput,
  rasterize: FactoryTextRasterizer,
): Promise<Uint8Array> {
  const orderNumber = sanitizeFactoryLabelText(input.orderNumber).replace(/^#/, "");
  const deliveryDate = formatDeliveryDate(input.deliveryDate);
  const districtLines = wrapFactoryLabelText(input.district, 4).slice(0, 2);
  const customerName = sanitizeFactoryLabelText(input.customerName);
  const customerPhone = sanitizeFactoryLabelText(input.customerPhone);
  const chunks: Uint8Array[] = [
    command("SIZE 50 mm,75 mm"),
    command("GAP 2 mm,0"),
    command("DIRECTION 1"),
    command("CLS"),
    await textBitmap(
      rasterize,
      0,
      `#${orderNumber}`,
      { height: 120, fontSize: 120, fontWeight: 800, align: "center" },
      { x: 100, width: 200 },
    ),
    command("BAR 16,124,368,2"),
    await textBitmap(rasterize, 132, "－ 送貨日期 －", {
      height: 40,
      fontSize: 30,
      fontWeight: 800,
      align: "center",
    }),
    await textBitmap(rasterize, 170, deliveryDate, {
      height: 50,
      fontSize: 46,
      fontWeight: 800,
      align: "center",
    }),
  ];
  for (const [index, line] of districtLines.entries()) {
    chunks.push(await textBitmap(rasterize, 218 + index * 100, line, {
      height: 90,
      fontSize: 80,
      fontWeight: 800,
      align: "center",
    }));
  }
  chunks.push(
    command("BAR 16,442,368,2"),
    await textBitmap(rasterize, 458, customerName, {
      height: 50,
      fontSize: 38,
      fontWeight: 700,
      align: "center",
    }),
    await textBitmap(rasterize, 514, customerPhone, {
      height: 62,
      fontSize: 50,
      fontWeight: 800,
      align: "center",
    }),
  );
  chunks.push(command("PRINT 1"));
  return concatBytes(chunks);
}

export async function buildFactoryLabelBytes(
  input: FactoryLabelCommandInput,
  rasterize: FactoryTextRasterizer = rasterizeFactoryLabelText,
): Promise<Uint8Array> {
  return input.kind === "address"
    ? buildAddressLabelBytes(input, rasterize)
    : buildDishLabelBytes(input, rasterize);
}

export function encodeFactoryLabelBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Combines complete TSPL labels into one raw print job so rapid QZ Tray
 * submissions cannot drop dishes from a full-order print. */
export function combineFactoryLabelBase64(commands: string[]): string {
  const chunks = commands.map((encoded) =>
    Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)),
  );
  return encodeFactoryLabelBase64(concatBytes(chunks));
}

export const fetchFactoryLabelCommand: FactoryLabelCommandLoader = async (input) => {
  const bytes = await buildFactoryLabelBytes(input);
  return encodeFactoryLabelBase64(bytes);
};
