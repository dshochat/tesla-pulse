"use client";

import { motion } from "framer-motion";
import type { Trip } from "@/types/tesla";

interface TripHistoryProps {
  trips: Trip[];
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#00ff88" : score >= 40 ? "#ffaa00" : "#ff4466";
  return (
    <span
      className="font-mono-telemetry text-xs font-bold"
      style={{ color }}
    >
      {score}
    </span>
  );
}

function TimeAgo({ timestamp }: { timestamp: number }) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3600_000);
  const days = Math.floor(hours / 24);

  let label: string;
  if (days > 0) label = `${days}d ago`;
  else if (hours > 0) label = `${hours}h ago`;
  else label = "Just now";

  return <span className="text-[10px] text-text-secondary">{label}</span>;
}

export default function TripHistory({ trips }: TripHistoryProps) {
  if (trips.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">
          Trip History
        </h3>
        <p className="text-xs text-text-secondary">No trips recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">
        Trip History
      </h3>

      <div className="space-y-3">
        {trips.map((trip, i) => {
          const highlights: string[] = trip.ai_highlights
            ? JSON.parse(trip.ai_highlights)
            : [];
          const durationMin = Math.round((trip.ended_at - trip.started_at) / 60_000);

          return (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-lg border border-border bg-bg-hover p-3"
            >
              {/* Header row */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TimeAgo timestamp={trip.started_at} />
                  <span className="text-[10px] text-text-secondary">·</span>
                  <span className="font-mono-telemetry text-[10px] text-text-secondary">
                    {durationMin}min · {trip.distance_miles.toFixed(1)} mi
                  </span>
                </div>
                {trip.ai_efficiency_score && (
                  <ScoreBadge score={trip.ai_efficiency_score} />
                )}
              </div>

              {/* Metrics row */}
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                <span className="text-text-secondary">
                  Avg{" "}
                  <span className="font-mono-telemetry text-text-primary">
                    {Math.round(trip.avg_speed_mph)}
                  </span>{" "}
                  mph
                </span>
                <span className="text-text-secondary">
                  Max{" "}
                  <span className="font-mono-telemetry text-text-primary">
                    {Math.round(trip.max_speed_mph)}
                  </span>{" "}
                  mph
                </span>
                <span className="text-text-secondary">
                  <span className="font-mono-telemetry text-text-primary">
                    {Math.round(trip.efficiency_wh_per_mile)}
                  </span>{" "}
                  Wh/mi
                </span>
                <span className="text-text-secondary">
                  {Math.round(trip.start_battery)}% → {Math.round(trip.end_battery)}%
                </span>
              </div>

              {/* AI Summary */}
              {trip.ai_summary && (
                <p className="mb-2 text-xs leading-relaxed text-text-primary">
                  {trip.ai_summary}
                </p>
              )}

              {/* Highlights */}
              {highlights.length > 0 && (
                <div className="space-y-1">
                  {highlights.map((h, j) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[8px] text-accent">●</span>
                      <span className="text-[10px] leading-tight text-text-secondary">{h}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Tip */}
              {trip.ai_tip && (
                <div className="mt-2 rounded-md bg-accent/5 px-2 py-1.5">
                  <span className="text-[10px] font-medium text-accent">Tip: </span>
                  <span className="text-[10px] text-text-secondary">{trip.ai_tip}</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
