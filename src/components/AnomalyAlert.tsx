"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Anomaly } from "@/types/tesla";

interface AnomalyAlertProps {
  anomalies: Anomaly[];
}

const severityConfig = {
  info: { color: "#00d4ff", bg: "bg-accent/10", border: "border-accent/20", label: "INFO" },
  warning: { color: "#ffaa00", bg: "bg-warning/10", border: "border-warning/20", label: "WARN" },
  critical: { color: "#ff4466", bg: "bg-negative/10", border: "border-negative/20", label: "CRIT" },
};

const typeIcons: Record<string, string> = {
  tire_pressure: "🛞",
  vampire_drain: "🧛",
  power_spike: "⚡",
  temp_outlier: "🌡️",
};

export default function AnomalyAlert({ anomalies }: AnomalyAlertProps) {
  if (anomalies.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {anomalies.map((anomaly) => {
          const config = severityConfig[anomaly.severity];
          return (
            <motion.div
              key={anomaly.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`rounded-lg border ${config.border} ${config.bg} p-3`}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm">{typeIcons[anomaly.type] ?? "⚠️"}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono-telemetry text-[9px] font-bold"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                    <span className="text-xs font-medium text-text-primary">
                      {anomaly.message}
                    </span>
                  </div>
                  {anomaly.ai_explanation && (
                    <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
                      {anomaly.ai_explanation}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
