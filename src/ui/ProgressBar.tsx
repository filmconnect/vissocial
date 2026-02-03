// ============================================================
// UI: ProgressBar
// ============================================================
// Jednostavan progress bar 0-100
// ============================================================

interface ProgressBarProps {
  value: number; // 0-100
  color?: "blue" | "green" | "amber" | "red";
  showLabel?: boolean;
}

export function ProgressBar({ 
  value, 
  color = "blue",
  showLabel = false 
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  
  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500"
  };

  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-xs text-zinc-500 text-right">
          {clampedValue}%
        </div>
      )}
    </div>
  );
}
