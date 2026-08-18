import { useCallback, useEffect, useRef, useState } from "react";

/**
 * QZ Tray client facade.
 *
 * QZ Tray is the desktop companion that lets the factory floor talk to its
 * label printers. This module isolates the connection library behind a small
 * injectable interface so components stay testable and degrade gracefully
 * when QZ Tray is not installed or running.
 */

export type QzPrinterStatus = {
  name: string;
  status: string | null;
  severity: string | null;
  message: string | null;
};

export type QzStatusTone = "green" | "amber" | "red" | "neutral";

export type QzStatusMeta = {
  label: string;
  tone: QzStatusTone;
};

export type QzConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "failed";

export interface QzTrayClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listPrinters(): Promise<string[]>;
  queryStatuses(names: string[]): Promise<QzPrinterStatus[]>;
}

type QzStatusEvent = {
  printerName?: string;
  status?: string | null;
  severity?: string | null;
  message?: string | null;
};

const STATUS_META: Array<{
  statuses: string[];
  labelKey: string;
  tone: QzStatusTone;
}> = [
  {
    statuses: ["ONLINE", "OK", "READY"],
    labelKey: "ready",
    tone: "green",
  },
  {
    statuses: ["PAPER_OUT", "PAPEROUT"],
    labelKey: "paperOut",
    tone: "red",
  },
  {
    statuses: ["OFFLINE"],
    labelKey: "offline",
    tone: "red",
  },
  {
    statuses: ["NO_TONER"],
    labelKey: "noToner",
    tone: "red",
  },
  {
    statuses: ["TONER_LOW"],
    labelKey: "tonerLow",
    tone: "amber",
  },
  {
    statuses: ["PAPER_PROBLEM", "PAPER_JAM", "JAM"],
    labelKey: "paperProblem",
    tone: "red",
  },
  {
    statuses: ["DOOR_OPEN"],
    labelKey: "doorOpen",
    tone: "red",
  },
  {
    statuses: ["PAUSED"],
    labelKey: "paused",
    tone: "amber",
  },
  {
    statuses: ["OUTPUT_BIN_FULL"],
    labelKey: "outputBinFull",
    tone: "amber",
  },
  {
    statuses: ["USER_INTERVENTION"],
    labelKey: "userIntervention",
    tone: "amber",
  },
  {
    statuses: ["NOT_AVAILABLE"],
    labelKey: "notAvailable",
    tone: "neutral",
  },
  {
    statuses: ["PENDING_DELETION"],
    labelKey: "pendingDeletion",
    tone: "neutral",
  },
  {
    statuses: ["SERVER_UNKNOWN"],
    labelKey: "serverUnknown",
    tone: "red",
  },
];

export function qzStatusKey(status: string | null): string {
  if (!status) return "unknown";
  const normalized = status.trim().toUpperCase();
  for (const group of STATUS_META) {
    if (group.statuses.includes(normalized)) return group.labelKey;
  }
  return normalized.toLowerCase();
}

export function qzStatusMeta(status: string | null): {
  key: string;
  tone: QzStatusTone;
} {
  const key = qzStatusKey(status);
  const group = STATUS_META.find((entry) =>
    entry.statuses.includes(status?.trim().toUpperCase() ?? ""),
  );
  return { key, tone: group?.tone ?? "amber" };
}

export function isQzPrinterHealthy(status: string | null) {
  return qzStatusMeta(status).tone === "green";
}

let loadedQz: unknown = null;

async function loadQzModule(): Promise<any> {
  if (loadedQz) return loadedQz;
  const mod = await import("qz-tray");
  const qz = (mod.default ?? mod) as any;
  loadedQz = qz;
  return qz;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const DEFAULT_QZ_CONNECT_TIMEOUT_MS = 4000;

export const qzTrayClient: QzTrayClient = {
  async connect() {
    const qz = await loadQzModule();
    if (qz.websocket.isActive()) return;
    await qz.websocket.connect({
      retries: 0,
      delay: 0,
      keepAlive: 0,
      usingSecure: true,
    });
  },

  async disconnect() {
    try {
      const qz = await loadQzModule();
      if (qz.websocket.isActive()) await qz.websocket.disconnect();
    } catch {
      // Ignore teardown errors; the app should never fail because of it.
    }
  },

  async listPrinters() {
    const qz = await loadQzModule();
    const found = await qz.printers.find();
    if (Array.isArray(found)) return found.map(String);
    return typeof found === "string" && found ? [found] : [];
  },

  async queryStatuses(names) {
    const qz = await loadQzModule();
    const initial: QzPrinterStatus[] = names.map((name) => ({
      name,
      status: null,
      severity: null,
      message: null,
    }));
    if (!names.length) return initial;

    try {
      const printers = await Promise.all(
        names.map((name) => qz.printers.find(name)),
      );
      await qz.printers.startListening(printers);
    } catch {
      // Printer status needs QZ Tray 2.1+. Fall back to unknown statuses.
      return initial;
    }

    const byName = new Map(initial.map((item) => [item.name, item]));
    const merge = (event: QzStatusEvent | undefined | null) => {
      if (!event?.printerName) return;
      const item = byName.get(event.printerName);
      if (!item) return;
      item.status = event.status ?? item.status;
      item.severity = event.severity ?? item.severity;
      item.message = event.message ?? item.message;
    };

    let finished = false;
    const resolve = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolveFn([...byName.values()]);
    };
    let resolveFn!: (statuses: QzPrinterStatus[]) => void;
    const settled = new Promise<QzPrinterStatus[]>((resolvePromise) => {
      resolveFn = resolvePromise;
    });
    const timer = window.setTimeout(resolve, 2500);

    try {
      qz.printers.setPrinterCallbacks([{ onEvent: merge }]);
    } catch {
      // Callbacks are not supported on older QZ Tray builds.
    }
    void qz.printers
      .getStatus()
      .then((stored: QzStatusEvent[] | null) => {
        for (const event of stored ?? []) merge(event);
        if ([...byName.values()].every((item) => item.status)) resolve();
      })
      .catch(() => {
        /* Status report is best-effort. */
      });

    const result = await settled;
    await qz.printers.stopListening().catch(() => {
      /* Ignore listener teardown errors. */
    });
    return result;
  },
};

export function useQzTray({
  client = qzTrayClient,
  autoConnect = true,
  connectTimeoutMs = DEFAULT_QZ_CONNECT_TIMEOUT_MS,
}: {
  client?: QzTrayClient;
  autoConnect?: boolean;
  connectTimeoutMs?: number;
} = {}) {
  const [state, setState] = useState<QzConnectionState>("idle");
  const [printers, setPrinters] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<QzPrinterStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((update: () => void) => {
    if (mountedRef.current) update();
  }, []);

  const connect = useCallback(async () => {
    apply(() => {
      setState("connecting");
      setError(null);
    });
    try {
      await withTimeout(client.connect(), connectTimeoutMs, "qz_connect_timeout");
      const found = await client.listPrinters();
      let nextStatuses: QzPrinterStatus[] = found.map((name) => ({
        name,
        status: null,
        severity: null,
        message: null,
      }));
      try {
        nextStatuses = await client.queryStatuses(found);
      } catch {
        // Status querying is optional; keep the printer list.
      }
      apply(() => {
        setPrinters(found);
        setStatuses(nextStatuses);
        setState("connected");
      });
    } catch (connectError) {
      apply(() => {
        setPrinters([]);
        setStatuses([]);
        setState("failed");
        setError(
          connectError instanceof Error
            ? connectError.message
            : "qz_connect_failed",
        );
      });
    }
  }, [apply, client, connectTimeoutMs]);

  const disconnect = useCallback(async () => {
    await client.disconnect().catch(() => {
      // Ignore teardown errors.
    });
    apply(() => {
      setPrinters([]);
      setStatuses([]);
      setState("idle");
    });
  }, [apply, client]);

  useEffect(() => {
    if (!autoConnect) return;
    void connect();
  }, [autoConnect, connect]);

  return {
    state,
    printers,
    statuses,
    error,
    connect,
    disconnect,
  };
}
