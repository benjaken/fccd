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
    <div
      className="inline-flex h-10 shrink-0 items-stretch rounded-lg bg-muted p-1"
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`inline-flex h-full cursor-pointer items-center whitespace-nowrap rounded-md px-4 py-0 text-sm font-semibold leading-none transition-colors ${
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
