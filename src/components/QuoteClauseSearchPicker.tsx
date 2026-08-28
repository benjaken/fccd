import { Plus, Search } from "lucide-react";

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
  const filteredOptions = options.filter(
    (option) => !search.trim() || option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="quote-clause-search-wrap">
      <div className="quote-additional-search">
        <Search />
        <input
          autoFocus
          aria-label={searchLabel}
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAdd(search);
          }}
        />
        <Button variant="outline" onClick={() => onAdd(search)}><Plus />加入</Button>
      </div>
      <ul className="quote-clause-option-list">
        {filteredOptions.map((option) => (
          <li key={option}>
            <span>{option}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="quote-clause-suggestion-add"
              onClick={() => onAdd(option)}
            >
              <Plus />加入
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
