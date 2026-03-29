"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { DashboardMode } from "@/types/tesla";

interface ConnectionStatusProps {
  connected: boolean;
  mode: DashboardMode;
  lastUpdate: number | null;
  demoMode: boolean;
  onToggleDemo: () => void;
}

export default function ConnectionStatus({
  connected,
  mode,
  lastUpdate,
  demoMode,
  onToggleDemo,
}: ConnectionStatusProps) {
  const [providerInfo, setProviderInfo] = useState<{ provider: string; label: string; color: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/provider")
      .then((r) => r.json())
      .then(setProviderInfo)
      .catch(() => {});
  }, []);

  const modeLabels: Record<DashboardMode, string> = {
    driving: "Driving",
    charging: "Charging",
    parked: "Parked",
    offline: "Offline",
    asleep: "Asleep",
  };

  const modeColors: Record<DashboardMode, string> = {
    driving: "#00d4ff",
    charging: "#00ff88",
    parked: "#6b6b80",
    offline: "#ff4466",
    asleep: "#ffaa00",
  };

  const elapsed = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
      {/* Provider badge */}
      {providerInfo && (
        <span
          className="hidden sm:inline rounded-md px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: providerInfo.color + "15",
            color: providerInfo.color,
            border: `1px solid ${providerInfo.color}30`,
          }}
        >
          {providerInfo.label}
        </span>
      )}

      {/* Demo mode toggle */}
      <button
        onClick={onToggleDemo}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          demoMode
            ? "bg-accent/20 text-accent"
            : "bg-bg-hover text-text-secondary hover:text-text-primary"
        }`}
      >
        {demoMode ? "Demo Mode" : "Live"}
      </button>

      {/* Mode badge */}
      <span
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: modeColors[mode] }}
      >
        {modeLabels[mode]}
      </span>

      {/* Connection dot */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <motion.div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: connected ? "#00ff88" : "#ff4466" }}
            animate={
              connected
                ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }
                : {}
            }
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {connected && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "#00ff88" }}
              animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>
        {elapsed !== null && (
          <span className="text-[10px] text-text-secondary">
            {elapsed < 10 ? "live" : `${elapsed}s ago`}
          </span>
        )}
      </div>

      {/* Settings gear */}
      <Link
        href="/settings"
        className="rounded-md p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
        title="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>

      {/* Logout */}
      <button
        onClick={() => {
          fetch("/api/auth/logout", { method: "POST" }).then(() => {
            window.location.href = "/login";
          });
        }}
        className="rounded-md p-1.5 text-text-secondary hover:text-negative hover:bg-negative/10 transition-colors"
        title="Logout"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
