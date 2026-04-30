import type { ConfidenceLevel } from "../../../shared/types";

const levelClasses: Record<ConfidenceLevel, string> = {
  High: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-200",
  Low: "bg-rose-100 text-rose-800 border-rose-200",
};

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${levelClasses[level]}`}
      title={`Confidence: ${level}`}
    >
      {level}
    </span>
  );
}
