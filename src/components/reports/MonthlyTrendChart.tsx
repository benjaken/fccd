import { useMemo } from "react";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export type MonthlyTrendPoint = {
  month: number;
  value: number;
};

export function MonthlyTrendChart({
  eyebrow,
  title,
  badge,
  ariaLabel,
  points,
  formatValue,
}: {
  eyebrow: string;
  title: string | undefined;
  badge: string;
  ariaLabel: string;
  points: MonthlyTrendPoint[];
  formatValue: (value: number) => string;
}) {
  const chart = useMemo(() => {
    if (!points.length) return { path: "", plotted: [] };
    const values = points.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    const plotted = points.map((point) => ({
      ...point,
      x: 48 + ((point.month - 1) / 11) * 644,
      y: 24 + ((maximum - point.value) / range) * 136,
    }));
    return {
      path: plotted.map((point) => `${point.x},${point.y}`).join(" "),
      plotted,
    };
  }, [points]);

  return (
    <section className="panel meat-price-trend">
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <strong>{badge}</strong>
      </header>
      <div className="meat-price-chart">
        <svg aria-label={ariaLabel} role="img" viewBox="0 0 740 210">
          {[24, 92, 160].map((y) => (
            <line
              className="price-chart-grid"
              key={y}
              x1="48"
              x2="692"
              y1={y}
              y2={y}
            />
          ))}
          <polyline className="price-chart-line" points={chart.path} />
          {chart.plotted.map((point) => (
            <g key={point.month}>
              <circle
                className="price-chart-point"
                cx={point.x}
                cy={point.y}
                r="5"
              />
              <title>
                {point.month}: {formatValue(point.value)}
              </title>
            </g>
          ))}
          {MONTHS.map((month) => (
            <text
              className="price-chart-month"
              key={month}
              x={48 + ((month - 1) / 11) * 644}
              y="192"
              textAnchor="middle"
            >
              {month}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
