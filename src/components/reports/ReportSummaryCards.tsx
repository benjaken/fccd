import type { ReactNode } from "react";

export type ReportSummaryCard = {
  label: ReactNode;
  value: ReactNode;
  caption: ReactNode;
  valueClassName?: string;
};

export function ReportSummaryCards({
  ariaLabel,
  cards,
  className = "raw-meat-price-summary",
}: {
  ariaLabel: string;
  cards: ReportSummaryCard[];
  className?: string;
}) {
  return (
    <section className={className} aria-label={ariaLabel}>
      {cards.map((card, index) => (
        <article className="panel" key={index}>
          <span>{card.label}</span>
          <strong className={card.valueClassName}>{card.value}</strong>
          <small>{card.caption}</small>
        </article>
      ))}
    </section>
  );
}
