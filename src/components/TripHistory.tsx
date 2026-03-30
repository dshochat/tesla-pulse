"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TripWithSegments, TripSegment } from "@/types/tesla";
import dynamic from "next/dynamic";

const TripRouteMap = dynamic(() => import("./TripRouteMap"), { ssr: false });

interface TripHistoryProps {
  trips: TripWithSegments[];
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#00ff88" : score >= 40 ? "#ffaa00" : "#ff4466";
  return (
    <span className="font-mono-telemetry text-xs font-bold" style={{ color }}>
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

function EfficiencyBar({ whPerMile, maxWh }: { whPerMile: number; maxWh: number }) {
  const pct = Math.min(100, (whPerMile / maxWh) * 100);
  const color = whPerMile < 250 ? "#00ff88" : whPerMile < 300 ? "#ffaa00" : "#ff4466";

  return (
    <div className="h-1.5 w-full rounded-full bg-bg-hover">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SegmentBreakdown({ segments }: { segments: TripSegment[] }) {
  if (segments.length === 0) return null;

  const maxWh = Math.max(...segments.map((s) => s.wh_per_mile), 300);
  const sorted = [...segments].sort((a, b) => a.segment_order - b.segment_order);
  const worst = [...segments].sort((a, b) => b.wh_per_mile - a.wh_per_mile)[0];
  const best = [...segments].sort((a, b) => a.wh_per_mile - b.wh_per_mile)[0];

  return (
    <div className="space-y-3">
      {/* Route map */}
      <div className="h-[180px]">
        <TripRouteMap segments={segments} className="h-full" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-text-secondary">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-positive" /> &lt;250 Wh/mi
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full" style={{ backgroundColor: "#ffaa00" }} /> 250-300
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-negative" /> &gt;300
        </span>
      </div>

      {/* Segment list */}
      <div className="space-y-1.5">
        {sorted.map((seg) => {
          const isWorst = seg === worst;
          const isBest = seg === best;
          return (
            <div
              key={seg.segment_order}
              className={`rounded-md border px-2.5 py-1.5 ${
                isWorst
                  ? "border-negative/30 bg-negative/5"
                  : isBest
                  ? "border-positive/30 bg-positive/5"
                  : "border-border bg-bg-hover/30"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {isWorst && <span className="text-[9px]" title="Worst segment">🔴</span>}
                  {isBest && <span className="text-[9px]" title="Best segment">🟢</span>}
                  <span className="text-[10px] font-medium text-text-primary">
                    {seg.road_name || "Unknown"}
                  </span>
                  <span className="rounded bg-bg-hover px-1 py-0.5 text-[8px] text-text-secondary">
                    {seg.heading_bucket}
                  </span>
                </div>
                <span className="font-mono-telemetry text-[10px] text-text-primary">
                  {seg.wh_per_mile} Wh/mi
                </span>
              </div>
              <EfficiencyBar whPerMile={seg.wh_per_mile} maxWh={maxWh} />
              <div className="mt-1 flex gap-3 text-[9px] text-text-secondary">
                <span>{seg.distance_miles.toFixed(1)} mi</span>
                <span>{Math.round(seg.avg_speed_mph)} mph</span>
                <span>{seg.avg_power_kw} kW</span>
                <span>{Math.round(seg.duration_sec / 60)}min</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TripHistory({ trips }: TripHistoryProps) {
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

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
            ? (() => { try { return JSON.parse(trip.ai_highlights); } catch { return []; } })()
            : [];
          const durationMin = Math.round((trip.ended_at - trip.started_at) / 60_000);
          const hasSegments = trip.segments && trip.segments.length > 0;
          const isExpanded = expandedTrip === trip.id;

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
                <div className="mb-2 space-y-1">
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
                <div className="mb-2 rounded-md bg-accent/5 px-2 py-1.5">
                  <span className="text-[10px] font-medium text-accent">Tip: </span>
                  <span className="text-[10px] text-text-secondary">{trip.ai_tip}</span>
                </div>
              )}

              {/* Segment toggle */}
              {hasSegments && (
                <>
                  <button
                    onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
                    className="w-full rounded-md border border-border py-1.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-accent/30 transition-colors"
                  >
                    {isExpanded ? "Hide Segments" : `Show ${trip.segments!.length} Road Segments`}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3">
                          <SegmentBreakdown segments={trip.segments!} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
