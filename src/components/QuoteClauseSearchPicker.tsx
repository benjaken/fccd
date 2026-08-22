import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export function QuoteClauseSearchPicker({
  search,
  onSearchChange,
  options,
  searchLabel,
  placeholder,
  onAdd,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  options: string[];
  searchLabel: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const filteredOptions = options.filter(
    (option) => !search.trim() || option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const closeWhenFocusLeaves = () => {
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      setOpen(Boolean(
        active
        && (active === inputRef.current || suggestionsRef.current?.contains(active)),
      ));
    });
  };

  return (
    <div
      ref={anchorRef}
      className="quote-clause-search-wrap"
      onBlurCapture={closeWhenFocusLeaves}
    >
      <div className="quote-additional-search">
        <Search />
        <input
          ref={inputRef}
          aria-label={searchLabel}
          placeholder={placeholder}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAdd(search);
          }}
        />
        <Button variant="outline" onClick={() => onAdd(search)}>加入</Button>
      </div>
      {open ? createPortal(
        <ul
          ref={suggestionsRef}
          className="quote-clause-suggestions is-floating"
          style={{ top: position.top, left: position.left, width: position.width }}
          onBlurCapture={closeWhenFocusLeaves}
        >
          {filteredOptions.map((option) => (
            <li key={option}>
              <span>{option}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="quote-clause-suggestion-add"
                onClick={() => {
                  onAdd(option);
                  setOpen(false);
                }}
              >
                加入
              </Button>
            </li>
          ))}
        </ul>,
        anchorRef.current?.closest('[role="dialog"]') ?? document.body,
      ) : null}
    </div>
  );
}
