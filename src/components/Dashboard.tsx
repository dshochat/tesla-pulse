"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HeroMetric from "./HeroMetric";
import BatteryGauge from "./BatteryGauge";
import TelemetryChart from "./TelemetryChart";
import ConnectionStatus from "./ConnectionStatus";
import VehicleStatus from "./VehicleStatus";
import MiniMap from "./MiniMap";
import CommandPanel from "./CommandPanel";
import AICoachCard from "./AICoachCard";
import TripHistory from "./TripHistory";
import AnomalyAlert from "./AnomalyAlert";
import ChatPanel from "./ChatPanel";
import VoiceCoPilot from "./VoiceCoPilot";
import { useVehicle } from "@/hooks/useVehicle";
import { useTelemetry, type DemoScenario } from "@/hooks/useTelemetry";
import { useAICoach } from "@/hooks/useAICoach";
import { mockTrips, mockAnomalies } from "@/lib/mock-data";
import type { Trip, Anomaly } from "@/types/tesla";

const scenarios: { id: DemoScenario; label: string }[] = [
  { id: "driving", label: "Driving" },
  { id: "charging", label: "Charging" },
  { id: "parked", label: "Parked" },
];

export default function Dashboard() {
  const [demoMode, setDemoMode] = useState<boolean | null>(null); // null = loading
  const [scenario, setScenario] = useState<DemoScenario>("driving");

  // Hooks only activate once demoMode is resolved (non-null)
  const resolved = demoMode !== null;
  const effectiveDemo = demoMode ?? true;
  const { selectedVehicle, selectedId } = useVehicle(effectiveDemo);
  const telemetry = useTelemetry(
    resolved ? selectedId : null, // don't poll until settings loaded
    effectiveDemo,
    scenario
  );
  const coach = useAICoach(telemetry.mode, effectiveDemo);

  // Load demo_mode from settings API on mount (single source of truth)
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setDemoMode(typeof data.demo_mode === "boolean" ? data.demo_mode : true);
      })
      .catch(() => setDemoMode(true));
  }, []);

  // Persist demo mode toggle to settings
  const handleToggleDemo = useCallback(() => {
    const next = !effectiveDemo;
    setDemoMode(next);
    // Fire-and-forget save
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_mode: next }),
    }).catch(() => {});
  }, [effectiveDemo]);

  // Trip detection: track when driving stops
  const prevMode = useRef(telemetry.mode);
  const [tripJustEnded, setTripJustEnded] = useState(false);

  useEffect(() => {
    if (prevMode.current === "driving" && telemetry.mode !== "driving") {
      setTripJustEnded(true);
      setTimeout(() => setTripJustEnded(false), 10_000);
    }
    prevMode.current = telemetry.mode;
  }, [telemetry.mode]);

  // Data sources
  // Load persisted trips in live mode
  const [liveTrips, setLiveTrips] = useState<Trip[]>([]);
  useEffect(() => {
    if (!effectiveDemo) {
      fetch("/api/trips")
        .then((r) => r.json())
        .then((d) => setLiveTrips(d.trips || []))
        .catch(() => {});
    }
  }, [effectiveDemo]);

  const trips: Trip[] = effectiveDemo ? mockTrips : liveTrips;
  const anomalies: Anomaly[] = effectiveDemo ? mockAnomalies : telemetry.anomalies;

  const handleCommand = useCallback(
    async (command: string) => {
      const vehicleId = selectedId ?? "1234567890";
      const res = await fetch("/api/tesla/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, command }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    [selectedId]
  );

  const vehicleData = telemetry.vehicleData;
  const ds = vehicleData?.drive_state;
  const cs = vehicleData?.charge_state;

  const needsAuth = !effectiveDemo && telemetry.error?.includes("authenticate");
  const tokenExpired = !effectiveDemo && telemetry.errorType === "token_expired";

  // Show loading while settings are being fetched
  if (demoMode === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-xs text-text-secondary">Loading TeslaPulse...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-mono-telemetry text-lg font-bold text-accent shrink-0">
              TeslaPulse
            </h1>
            {selectedVehicle && (
              <span className="hidden sm:inline rounded-md bg-bg-hover px-2 py-0.5 text-xs text-text-secondary truncate">
                {selectedVehicle.display_name}
              </span>
            )}
            {/* Scenario selector (demo only) */}
            {effectiveDemo && (
              <div className="hidden md:flex items-center gap-1 rounded-lg bg-bg-hover p-0.5">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setScenario(s.id)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-all ${
                      scenario === s.id
                        ? "bg-accent/20 text-accent shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ConnectionStatus
            connected={telemetry.connected}
            mode={telemetry.mode}
            lastUpdate={telemetry.lastUpdate}
            demoMode={effectiveDemo}
            onToggleDemo={handleToggleDemo}
          />
        </div>
      </header>

      {/* Error / Auth / Token Expired banner */}
      <AnimatePresence>
        {telemetry.error && !effectiveDemo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden border-b ${
              tokenExpired ? "border-warning/20 bg-warning/5"
              : needsAuth ? "border-warning/20 bg-warning/5"
              : "border-negative/20 bg-negative/5"
            }`}
          >
            <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 py-2 sm:px-6">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${(needsAuth || tokenExpired) ? "text-warning" : "text-negative"}`}>
                  {tokenExpired ? "Token Expired" : needsAuth ? "Tesla Auth Required" : (
                    <>
                      {telemetry.errorType === "asleep" && "Vehicle Asleep"}
                      {telemetry.errorType === "rate_limited" && "Rate Limited"}
                      {telemetry.errorType === "offline" && "Vehicle Offline"}
                      {telemetry.errorType === "auth" && "Auth Required"}
                      {telemetry.errorType === "generic" && "Connection Error"}
                    </>
                  )}
                </span>
                <span className="text-xs text-text-secondary">
                  {tokenExpired
                    ? "Re-authenticate locally and sync tokens via Settings."
                    : needsAuth
                      ? "Sign in with Tesla to connect your vehicle."
                      : telemetry.error}
                </span>
              </div>
              {tokenExpired ? (
                <a
                  href="/settings"
                  className="rounded-md bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors"
                >
                  Settings
                </a>
              ) : needsAuth ? (
                <a
                  href="/api/tesla/auth"
                  className="rounded-md bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20 transition-colors"
                >
                  Sign In
                </a>
              ) : (
                <button
                  onClick={telemetry.refetch}
                  className="rounded-md bg-negative/10 px-3 py-1 text-xs font-medium text-negative hover:bg-negative/20 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trip ended banner */}
      <AnimatePresence>
        {tripJustEnded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-accent/20 bg-accent/5"
          >
            <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-2.5 sm:px-6">
              <span className="text-xs font-medium text-accent">Trip Complete</span>
              <span className="text-xs text-text-secondary">AI summary is being generated...</span>
              <motion.div
                className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main grid */}
      <main className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
        <div className="grid grid-cols-12 gap-4">
          {/* Left Column: Hero + Charts */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-4">
            {/* Hero metric */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-bg-card p-6"
            >
              <HeroMetric
                mode={telemetry.mode}
                speed={ds?.speed ?? null}
                batteryLevel={cs?.battery_level ?? 72}
                batteryRange={cs?.battery_range ?? 198}
                power={ds?.power ?? 0}
                chargerPower={cs?.charger_power ?? 0}
                chargeRate={cs?.charge_rate ?? 0}
                timeToFull={cs?.time_to_full_charge ?? 0}
              />
            </motion.div>

            {/* AI Coach */}
            <AICoachCard
              tip={coach.tip}
              loading={coach.loading}
              visible={telemetry.mode === "driving"}
            />

            {/* Sparkline charts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <TelemetryChart data={telemetry.telemetry} />
            </motion.div>

            {/* Map + Anomalies row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="h-[280px]"
              >
                <MiniMap
                  latitude={ds?.latitude ?? 37.3861}
                  longitude={ds?.longitude ?? -122.0839}
                  heading={ds?.heading ?? 245}
                  className="h-full"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <div className="rounded-xl border border-border bg-bg-card p-4 h-full">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">
                    Anomalies
                  </h3>
                  {anomalies.length > 0 ? (
                    <AnomalyAlert anomalies={anomalies} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-positive">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      All systems normal
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Trip History */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <TripHistory trips={trips} />
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-4">
            {/* Battery Gauge */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex justify-center rounded-xl border border-border bg-bg-card p-6"
            >
              <BatteryGauge
                level={cs?.battery_level ?? 72}
                isCharging={cs?.charging_state === "Charging"}
              />
            </motion.div>

            {/* Vehicle Status */}
            {vehicleData && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <VehicleStatus data={vehicleData} />
              </motion.div>
            )}

            {/* Commands */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <CommandPanel
                onCommand={handleCommand}
                disabled={(!telemetry.connected && !effectiveDemo) || (!effectiveDemo)}
                liveMode={!effectiveDemo}
              />
            </motion.div>
          </div>
        </div>
      </main>

      {/* Chat Panel (floating) */}
      <ChatPanel demoMode={effectiveDemo} />
      <VoiceCoPilot demoMode={effectiveDemo} />
    </div>
  );
}
