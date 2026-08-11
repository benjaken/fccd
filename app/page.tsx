"use client";

import { useMemo, useState } from "react";

import {
  BUBBLE_DATA_TYPES,
  DEFAULT_BUBBLE_BASE_URL,
  type BubbleDataType,
} from "@/lib/bubble-types";

type ScanStatus = "idle" | "loading" | "success" | "empty" | "error";

type ScanResult = {
  status: ScanStatus;
  recordCount?: number;
  fieldCount?: number;
  sourceUrl?: string;
  error?: string;
  scannedAt?: string;
};

type ScanApiResponse = Omit<ScanResult, "status"> & {
  error?: string;
};

const tabs = [
  ["▥", "進度總覽"],
  ["🚀", "遷移控制（Stage 1）"],
  ["♜", "Stage 2 BWF 同步"],
  ["🔗", "FK 審計面板"],
  ["🔐", "Auth 用戶同步"],
] as const;

export default function MigrationConsole() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BUBBLE_BASE_URL);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [results, setResults] = useState<
    Partial<Record<BubbleDataType, ScanResult>>
  >({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ScanStatus>("all");
  const [scanningAll, setScanningAll] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>();

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      synced: values.filter(
        (result) => result?.status === "success" || result?.status === "empty",
      ).length,
      loading: values.filter((result) => result?.status === "loading").length,
      failed: values.filter((result) => result?.status === "error").length,
    };
  }, [results]);

  const visibleTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return BUBBLE_DATA_TYPES.filter((dataType) => {
      const matchesQuery =
        !normalizedQuery ||
        dataType.toLocaleLowerCase().includes(normalizedQuery);
      const status = results[dataType]?.status ?? "idle";
      const matchesStatus =
        statusFilter === "all" || statusFilter === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, results, statusFilter]);

  const progress = Math.round(
    (summary.synced / BUBBLE_DATA_TYPES.length) * 100,
  );

  async function scanType(dataType: BubbleDataType) {
    setResults((current) => ({
      ...current,
      [dataType]: { ...current[dataType], status: "loading", error: undefined },
    }));

    try {
      const response = await fetch("/api/bubble/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, dataType, token }),
      });
      const payload = (await response.json()) as ScanApiResponse;
      if (!response.ok) {
        throw new Error(payload.error || "掃描失敗");
      }

      setResults((current) => ({
        ...current,
        [dataType]: {
          status: payload.recordCount ? "success" : "empty",
          recordCount: payload.recordCount,
          fieldCount: payload.fieldCount,
          sourceUrl: payload.sourceUrl,
          scannedAt: payload.scannedAt,
        },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [dataType]: {
          status: "error",
          error: error instanceof Error ? error.message : "掃描失敗",
        },
      }));
    } finally {
      setLastUpdated(new Date().toLocaleTimeString("zh-HK", { hour12: false }));
    }
  }

  async function scanAll() {
    if (scanningAll) return;
    setScanningAll(true);
    let cursor = 0;

    async function worker() {
      while (cursor < BUBBLE_DATA_TYPES.length) {
        const dataType = BUBBLE_DATA_TYPES[cursor];
        cursor += 1;
        await scanType(dataType);
      }
    }

    try {
      await Promise.all(Array.from({ length: 4 }, () => worker()));
    } finally {
      setScanningAll(false);
    }
  }

  return (
    <main>
      <div className="production-banner">
        <span className="siren">🚨</span>
        <div>
          <strong>生產環境 — PRODUCTION DATABASE</strong>
          <p>
            目前功能只讀取 Bubble 記錄數量，不會修改或覆寫 Bubble / Supabase
            資料。
          </p>
        </div>
        <span className="locked">🔒 READ ONLY</span>
      </div>

      <section className="hero">
        <div className="hero-heading">
          <div>
            <h1>📊 資料遷移進度控制台</h1>
            <p>Bubble.io → Supabase · {BUBBLE_DATA_TYPES.length} 個資料表</p>
          </div>
          <div className="updated">
            最後更新：{lastUpdated ?? "尚未掃描"}
            <button type="button" onClick={scanAll} disabled={scanningAll}>
              ↻ 重新整理
            </button>
          </div>
        </div>

        <div className="summary-grid">
          <SummaryCard label="總資料表" value={BUBBLE_DATA_TYPES.length} />
          <SummaryCard
            className="success"
            label="✓ 已掃描"
            value={summary.synced}
          />
          <SummaryCard
            className="working"
            label="⚡ 掃描中"
            value={summary.loading}
          />
          <SummaryCard
            className="failed"
            label="⊘ 失敗"
            value={summary.failed}
          />
        </div>

        <div className="progress-heading">
          <span>整體掃描進度</span>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <nav className="tabs" aria-label="遷移階段">
        {tabs.map(([icon, label], index) => (
          <button className={index === 0 ? "active" : ""} key={label}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <section className="content">
        <div className="source-panel panel">
          <div>
            <h2>🔗 Bubble 來源資料比對</h2>
            <p>
              系統會安全編碼資料表後綴；掃描只取得記錄總數和欄位數量。
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={scanAll}
            disabled={scanningAll}
          >
            {scanningAll ? "⏳ 掃描中…" : "↯ 掃描 Bubble 來源數量"}
          </button>

          <label className="field base-url-field">
            <span>Bubble Data API Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="field token-field">
            <span>Secret Token（只在本次掃描使用）</span>
            <div>
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="可留空使用伺服器環境 Secret"
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowToken(!showToken)}>
                {showToken ? "隱藏" : "顯示"}
              </button>
            </div>
          </label>
        </div>

        <div className="table-panel panel">
          <div className="table-heading">
            <div>
              <h2>🗂 Bubble 資料表</h2>
              <p>
                顯示 {visibleTypes.length} / {BUBBLE_DATA_TYPES.length} 個類型
              </p>
            </div>
            <div className="filters">
              <input
                type="search"
                placeholder="搜尋資料表…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
              >
                <option value="all">全部狀態</option>
                <option value="idle">未掃描</option>
                <option value="loading">掃描中</option>
                <option value="success">有資料</option>
                <option value="empty">零記錄</option>
                <option value="error">失敗</option>
              </select>
            </div>
          </div>

          <div className="data-table" role="table">
            <div className="table-row table-labels" role="row">
              <span>Bubble 資料類型</span>
              <span>來源記錄</span>
              <span>欄位</span>
              <span>狀態 / 操作</span>
            </div>
            {visibleTypes.map((dataType) => (
              <DataTypeRow
                key={dataType}
                dataType={dataType}
                baseUrl={baseUrl}
                result={results[dataType]}
                onScan={() => scanType(dataType)}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`summary-card ${className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTypeRow({
  dataType,
  baseUrl,
  result,
  onScan,
}: {
  dataType: BubbleDataType;
  baseUrl: string;
  result?: ScanResult;
  onScan: () => void;
}) {
  const status = result?.status ?? "idle";
  const previewUrl = `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(dataType)}`;
  const statusLabel = {
    idle: "未掃描",
    loading: "掃描中",
    success: "已取得",
    empty: "零記錄",
    error: "失敗",
  }[status];

  return (
    <div className="table-row" role="row">
      <div className="type-cell">
        <strong>{dataType}</strong>
        <span title={previewUrl}>{previewUrl}</span>
      </div>
      <strong className="number-cell">
        {result?.recordCount?.toLocaleString("zh-HK") ?? "—"}
      </strong>
      <span className="number-cell">{result?.fieldCount ?? "—"}</span>
      <div className="action-cell">
        <span className={`status-pill ${status}`} title={result?.error}>
          {status === "loading" && <i />}
          {statusLabel}
        </span>
        <button type="button" onClick={onScan} disabled={status === "loading"}>
          {status === "loading" ? "…" : "掃描"}
        </button>
      </div>
    </div>
  );
}
