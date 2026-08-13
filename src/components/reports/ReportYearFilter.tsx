import type { ReactNode } from "react";

export function ReportYearFilter({
  label,
  year,
  years,
  onYearChange,
  children,
  className = "raw-meat-price-filter",
}: {
  label: string;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {children}
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
