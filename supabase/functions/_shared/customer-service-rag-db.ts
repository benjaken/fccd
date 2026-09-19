/** Minimal structural port, implemented by Supabase and by isolated test adapters. */
export type RagRpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type RagRpcCall = PromiseLike<RagRpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RagRpcResult> };
export type CustomerServiceRagDatabase = { rpc(name: string, args?: Record<string, unknown>): RagRpcCall };

export async function ragRpc(db: CustomerServiceRagDatabase, name: string, args: Record<string, unknown>, timeoutMs = 5_000): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = db.rpc(name, args);
  try {
    const result = await Promise.race([
      Promise.resolve(request.abortSignal ? request.abortSignal(controller.signal) : request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("rag_database_timeout")); }, Math.max(1, timeoutMs));
      }),
    ]);
    if (result.error) throw new Error("rag_database_error");
    return result.data;
  } finally { if (timer) clearTimeout(timer); }
}
