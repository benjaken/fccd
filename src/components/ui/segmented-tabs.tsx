type SegmentedTab<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedTabs<T extends string>({
  value,
  tabs,
  label,
  onChange,
}: {
  value: T;
  tabs: SegmentedTab<T>[];
  label: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-muted p-1" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`cursor-pointer whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            value === tab.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
