import type { PotentialLevel } from "../../../shared/types";

const levelClasses: Record<PotentialLevel, string> = {
  "Very High": "level-very-high",
  High: "level-high",
  Moderate: "level-moderate",
  Low: "level-low",
};

export function LevelBadge({ level }: { level: PotentialLevel }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${levelClasses[level]}`}
    >
      {level}
    </span>
  );
}
