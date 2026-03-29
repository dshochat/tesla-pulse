"use client";

import { motion } from "framer-motion";

interface BatteryGaugeProps {
  level: number; // 0-100
  isCharging: boolean;
  size?: number;
}

export default function BatteryGauge({ level, isCharging, size = 180 }: BatteryGaugeProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (level / 100) * circumference;
  const center = size / 2;

  // Color gradient based on level
  const getColor = (l: number) => {
    if (l > 60) return "#00ff88";
    if (l > 30) return "#ffaa00";
    return "#ff4466";
  };

  const color = getColor(level);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth={strokeWidth}
        />

        {/* Progress arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />

        {/* Charging pulse ring */}
        {isCharging && (
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#00ff88"
            strokeWidth={2}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={level.toFixed(0)}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-mono-telemetry text-3xl font-bold"
          style={{ color }}
        >
          {level.toFixed(0)}%
        </motion.span>
        {isCharging && (
          <motion.span
            className="mt-1 text-[10px] font-medium uppercase tracking-widest"
            style={{ color: "#00ff88" }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            charging
          </motion.span>
        )}
      </div>
    </div>
  );
}
