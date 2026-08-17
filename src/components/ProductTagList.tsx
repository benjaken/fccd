import { cn } from "@/lib/utils";

export function ProductTagList({
  tags,
  empty,
  selectable = false,
  selectedIds,
  onToggle,
}: {
  tags: Array<{ id?: string; name: string }>;
  empty?: string;
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
}) {
  if (tags.length === 0) {
    return empty ? <span className="product-tag-empty">{empty}</span> : null;
  }

  return (
    <div className="product-tag-list">
      {tags.map((tag, index) => {
        const id = tag.id ?? tag.name;
        const selected = selectedIds?.includes(id) ?? true;
        const className = cn(
          "product-tag",
          selectable && selected && "is-selected",
        );

        if (!selectable || !onToggle || !tag.id) {
          return (
            <span key={`${id}-${index}`} className={className}>
              {tag.name}
            </span>
          );
        }

        return (
          <button
            key={id}
            type="button"
            className={className}
            aria-pressed={selected}
            onClick={() => onToggle(id)}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
