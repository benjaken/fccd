import { NextResponse } from "next/server";

import {
  BUBBLE_DATA_TYPES,
  type BubbleDataType,
} from "@/lib/bubble-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanRequest = {
  baseUrl?: unknown;
  dataType?: unknown;
  token?: unknown;
};

type BubbleListResponse = {
  response?: {
    results?: unknown[];
    count?: number;
    remaining?: number;
  };
};

const ALLOWED_HOST = "cs.foodchannels-catering.com";
const ALLOWED_PATHS = new Set([
  "/api/1.1/obj",
  "/version-test/api/1.1/obj",
]);

function validateBaseUrl(value: unknown): URL {
  if (typeof value !== "string") {
    throw new Error("Bubble Base URL 格式不正确");
  }

  const url = new URL(value.trim());
  const pathname = url.pathname.replace(/\/+$/, "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== ALLOWED_HOST ||
    !ALLOWED_PATHS.has(pathname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("只允许 FCCD 正式环境或 version-test 的 Data API URL");
  }
  url.pathname = pathname;
  return url;
}

function validateDataType(value: unknown): BubbleDataType {
  if (
    typeof value !== "string" ||
    !BUBBLE_DATA_TYPES.includes(value as BubbleDataType)
  ) {
    throw new Error("未知的 Bubble 数据类型");
  }
  return value as BubbleDataType;
}

export async function POST(request: Request) {
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON" }, { status: 400 });
  }

  try {
    const baseUrl = validateBaseUrl(body.baseUrl);
    const dataType = validateDataType(body.dataType);
    const token =
      typeof body.token === "string" && body.token.trim()
        ? body.token.trim()
        : process.env.BUBBLE_API_TOKEN;

    const encodedType = encodeURIComponent(dataType);
    const sourceUrl = `${baseUrl.toString().replace(/\/$/, "")}/${encodedType}`;
    const headers: HeadersInit = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const bubbleResponse = await fetch(`${sourceUrl}?limit=1&cursor=0`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    if (!bubbleResponse.ok) {
      return NextResponse.json(
        {
          error:
            bubbleResponse.status === 401
              ? "Secret Token 无效或没有读取权限"
              : `Bubble API 返回 HTTP ${bubbleResponse.status}`,
          sourceUrl,
        },
        { status: bubbleResponse.status === 401 ? 401 : 502 },
      );
    }

    const payload = (await bubbleResponse.json()) as BubbleListResponse;
    const results = Array.isArray(payload.response?.results)
      ? payload.response.results
      : [];
    const remaining =
      typeof payload.response?.remaining === "number"
        ? payload.response.remaining
        : 0;
    const firstRecord =
      results[0] && typeof results[0] === "object"
        ? (results[0] as Record<string, unknown>)
        : null;

    return NextResponse.json({
      dataType,
      sourceUrl,
      recordCount: results.length + remaining,
      fieldCount: firstRecord ? Object.keys(firstRecord).length : 0,
      authenticated: Boolean(token),
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "无法扫描 Bubble 数据类型";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
