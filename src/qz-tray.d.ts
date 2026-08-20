declare module "qz-tray" {
  type QzPromise<T> = Promise<T>;

  interface QzWebSocketApi {
    connect(options?: {
      host?: string | string[];
      port?: {
        secure?: number[];
        insecure?: number[];
      };
      usingSecure?: boolean;
      keepAlive?: number;
      retries?: number;
      delay?: number;
    }): QzPromise<null>;
    disconnect(): QzPromise<null>;
    isActive(): boolean;
  }

  interface QzStatusEvent {
    printerName?: string;
    status?: string | null;
    severity?: string | null;
    message?: string | null;
    eventType?: string;
  }

  interface QzPrintersApi {
    find(
      query?: string,
      signature?: unknown,
      signingTimestamp?: number,
    ): QzPromise<string | string[]>;
    startListening(
      printers?: unknown[] | unknown,
      options?: Record<string, unknown>,
    ): QzPromise<null>;
    stopListening(): QzPromise<null>;
    getStatus(): QzPromise<QzStatusEvent[] | null>;
    setPrinterCallbacks(
      calls: Array<{ onEvent?: (event: QzStatusEvent) => void }>,
    ): void;
  }

  interface QzApi {
    websocket: QzWebSocketApi;
    printers: QzPrintersApi;
    security: {
      setCertificatePromise(callback: (resolve: (value: string) => void, reject: (reason?: unknown) => void) => void): void;
      setSignatureAlgorithm(algorithm: "SHA512" | "SHA256" | "SHA1"): void;
      setSignaturePromise(callback: (toSign: string) => (resolve: (value: string) => void, reject: (reason?: unknown) => void) => void): void;
    };
  }

  const qz: QzApi;
  export default qz;
}
