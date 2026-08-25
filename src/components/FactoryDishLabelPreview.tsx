import {
  buildFactoryDishLabelLayout,
  type FactoryDishLabelCommandInput,
} from "@/lib/factory-label";
import { cn } from "@/lib/utils";

export function FactoryDishLabelPreview({
  input,
  className,
}: {
  input: FactoryDishLabelCommandInput;
  className?: string;
}) {
  const layout = buildFactoryDishLabelLayout(input);
  return (
    <div
      className={cn("factory-dish-label-preview", className)}
      aria-label={`50 × 75 mm 標籤預覽：${layout.orderNumber}`}
    >
      <strong className="factory-dish-label-order">{layout.orderNumber}</strong>
      <section className="factory-dish-label-date">
        <span>－ 送貨日期 －</span>
        <strong>{layout.deliveryDate}</strong>
      </section>
      <div className="factory-dish-label-count">
        <strong>1份 / 共{layout.copies}份</strong>
        <i aria-hidden="true" />
      </div>
      <section className="factory-dish-label-body">
        {layout.bodyLines.map((item, index) => (
          <strong
            className={item.isDishName ? "is-dish-name" : "is-remark"}
            key={`${item.line}-${index}`}
          >
            {item.line}
          </strong>
        ))}
      </section>
    </div>
  );
}
