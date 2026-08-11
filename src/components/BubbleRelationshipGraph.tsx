import type { BubbleRelationshipReport } from "@/lib/bubble-relations";
import { useTranslation } from "react-i18next";

export function BubbleRelationshipGraph({
  report,
}: {
  report: BubbleRelationshipReport;
}) {
  const { t } = useTranslation();
  const targets = [...new Set(report.relationships.map((item) => item.targetSchemaType))];
  const nodes = targets.map((target, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(targets.length, 1) - Math.PI / 2;
    return {
      target,
      x: 400 + Math.cos(angle) * 285,
      y: 180 + Math.sin(angle) * 125,
    };
  });

  return (
    <div className="relationship-graph-wrap">
      <svg
        className="relationship-graph"
        viewBox="0 0 800 360"
        role="img"
        aria-label={t("migration.relationships.graphLabel", {
          sourceType: report.sourceType,
        })}
      >
        <defs>
          <marker
            id="relationship-arrow"
            markerHeight="7"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3.5"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" />
          </marker>
        </defs>

        {nodes.map((node) => {
          const relationships = report.relationships.filter(
            (item) => item.targetSchemaType === node.target,
          );
          const isArray = relationships.some((item) => item.isArray);
          const isIncoming = relationships.some(
            (item) => item.direction === "incoming",
          );
          return (
            <g key={`edge-${node.target}`}>
              <line
                className={
                  isArray ? "array" : isIncoming ? "incoming" : undefined
                }
                x1="400"
                y1="180"
                x2={node.x}
                y2={node.y}
                markerEnd="url(#relationship-arrow)"
              />
              <text
                className="relationship-edge-label"
                x={(400 + node.x) / 2}
                y={(180 + node.y) / 2 - 5}
                textAnchor="middle"
              >
                {relationships.length > 1
                  ? t("migration.relationships.fieldCount", {
                      count: relationships.length,
                    })
                  : relationships[0]?.sourceField.slice(0, 22)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => (
          <g
            className="relationship-node relationship-target-node"
            key={node.target}
            transform={`translate(${node.x - 68} ${node.y - 23})`}
          >
            <rect width="136" height="46" rx="10" />
            <text x="68" y="20" textAnchor="middle">
              {node.target.length > 20
                ? `${node.target.slice(0, 18)}…`
                : node.target}
            </text>
            <text className="relationship-node-type" x="68" y="35" textAnchor="middle">
              {t("migration.relationships.target")}
            </text>
          </g>
        ))}

        <g
          className="relationship-node relationship-source-node"
          transform="translate(315 148)"
        >
          <rect width="170" height="64" rx="14" />
          <text x="85" y="27" textAnchor="middle">
            {report.sourceType.length > 24
              ? `${report.sourceType.slice(0, 22)}…`
              : report.sourceType}
          </text>
          <text className="relationship-node-type" x="85" y="46" textAnchor="middle">
            {t("migration.relationships.sourceRecords", {
              count: report.sourceCount.toLocaleString(),
            })}
          </text>
        </g>
      </svg>
      <div className="relationship-graph-legend">
        <span>
          <i />
          {t("migration.relationships.scalarReference")}
        </span>
        <span>
          <i className="array" />
          {t("migration.relationships.arrayReference")}
        </span>
        <span>
          <i className="incoming" />
          {t("migration.relationships.incomingReference")}
        </span>
      </div>
    </div>
  );
}

