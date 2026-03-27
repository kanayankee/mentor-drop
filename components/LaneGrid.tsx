import { LANES } from "@/lib/physics";

type LaneGridProps = {
  laneWidthPercent?: number;
};

export function LaneGrid({ laneWidthPercent = 12.5 }: LaneGridProps) {
  return (
    <div className="lane-grid" aria-label="AからHレーン">
      {LANES.map((lane, index) => (
        <div
          className={`lane-cell ${index === LANES.length - 1 ? "no-border" : ""}`}
          key={lane}
          style={{ width: `${laneWidthPercent}%` }}
        >
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "32px", height: "32px",
            borderRadius: "50%", background: "#fff",
            fontWeight: 700, fontSize: "0.85rem", color: "#19150f",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}>{lane}</span>
        </div>
      ))}
    </div>
  );
}
