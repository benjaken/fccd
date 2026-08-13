import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TablePagination({
  summary,
  page,
  totalPages,
  loading,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  pageLabel,
  jumpLabel,
  onPageChange,
}: {
  summary: string;
  page: number;
  totalPages: number;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
  jumpLabel: string;
  onPageChange: (page: number) => void;
}) {
  const [pageInput, setPageInput] = useState(String(page));

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const jumpToPage = () => {
    const requested = Number.parseInt(pageInput, 10);
    if (Number.isNaN(requested)) {
      setPageInput(String(page));
      return;
    }
    onPageChange(Math.min(totalPages, Math.max(1, requested)));
  };

  return (
    <footer className="operational-list-pagination">
      <span>{summary}</span>
      <div>
        <Button
          variant="outline"
          size="icon"
          disabled={loading || page <= 1}
          onClick={onPrevious}
          aria-label={previousLabel}
        >
          <ChevronLeft />
        </Button>
        <label className="table-pagination-jump">
          <span className="sr-only">{jumpLabel}</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            disabled={loading}
            aria-label={jumpLabel}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={jumpToPage}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jumpToPage();
              }
            }}
          />
          <span>
            {pageLabel} {totalPages}
          </span>
        </label>
        <Button
          variant="outline"
          size="icon"
          disabled={loading || page >= totalPages}
          onClick={onNext}
          aria-label={nextLabel}
        >
          <ChevronRight />
        </Button>
      </div>
    </footer>
  );
}
