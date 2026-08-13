import { useCallback, useEffect, useState } from "react";

export type PaginatedResult<T> = {
  items: T[];
  total: number;
};

export function usePaginatedList<T, F extends { page: number }>({
  filters,
  load,
  enabled = true,
}: {
  filters: Omit<F, "page">;
  load: (filters: F) => Promise<PaginatedResult<T>>;
  enabled?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void load({ ...filters, page } as F)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const code =
          typeof loadError === "object" &&
          loadError &&
          "code" in loadError &&
          typeof loadError.code === "string"
            ? loadError.code
            : "list_load_failed";
        setItems([]);
        setTotal(0);
        setError(code);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, filters, load, page, reloadKey]);

  return { page, setPage, items, total, loading, error, reload };
}
