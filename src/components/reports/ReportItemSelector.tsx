import type { ReactNode } from "react";

export type ReportSelectorItem = {
  id: string;
  name: string;
  updateLabel: string;
  value: ReactNode;
  valueClassName?: string;
  status?: ReactNode;
  statusClassName?: string;
};

export function ReportItemSelector({
  eyebrow,
  title,
  items,
  selectedId,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  items: ReportSelectorItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel meat-price-product-browser">
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <strong>{items.length}</strong>
      </header>
      <div className="meat-price-product-list">
        {items.map((item) => (
          <button
            className={selectedId === item.id ? "selected" : undefined}
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
          >
            <span>
              <strong>{item.name}</strong>
              <small>{item.updateLabel}</small>
            </span>
            <span>
              <strong className={item.valueClassName}>{item.value}</strong>
              {item.status !== undefined && (
                <small className={item.statusClassName}>{item.status}</small>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
