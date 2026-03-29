"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TeslaVehicleData, TelemetryPoint, DashboardMode, Anomaly } from "@/types/tesla";

interface TelemetryState {
  vehicleData: TeslaVehicleData | null;
  telemetry: TelemetryPoint[];
  mode: DashboardMode;
  anomalies: Anomaly[];
  loading: boolean;
  error: string | null;
  errorType: "asleep" | "rate_limited" | "offline" | "auth" | "token_expired" | "generic" | null;
  connected: boolean;
  lastUpdate: number | null;
}

export type DemoScenario = "driving" | "charging" | "parked";

export function useTelemetry(vehicleId: string | null, demoMode: boolean, scenario: DemoScenario = "driving") {
  const [state, setState] = useState<TelemetryState>({
    vehicleData: null,
    telemetry: [],
    mode: "offline",
    anomalies: [],
    loading: false,
    error: null,
    errorType: null,
    connected: false,
    lastUpdate: null,
  });

  const nextPollMs = useRef(5000);
  const retryCount = useRef(0);

  // Stable refetch (for Retry button)
  const manualFetchRef = useRef<(() => void) | null>(null);
  const refetch = useCallback(() => {
    manualFetchRef.current?.();
  }, []);

  // Single polling effect
  useEffect(() => {
    // In live mode, require vehicleId; in demo mode, don't
    if (!demoMode && !vehicleId) return;

    let aborted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    retryCount.current = 0;
    nextPollMs.current = demoMode ? 2000 : 5000;

    const fetchOnce = async () => {
      if (aborted) return;
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const params = new URLSearchParams();
        if (vehicleId) params.set("id", String(vehicleId));
        if (demoMode) {
          params.set("demo", "true");
          params.set("scenario", scenario);
        }

        const res = await fetch(`/api/tesla/vehicle-data?${params}`);
        if (aborted) return;

        if (!res.ok) {
          const data = await res.json();
          const msg = data.error || `HTTP ${res.status}`;
          let errorType: TelemetryState["errorType"] = "generic";
          if (data.errorType) errorType = data.errorType;
          else if (res.status === 408) errorType = "asleep";
          else if (res.status === 429) errorType = "rate_limited";
          else if (res.status === 503 || res.status === 504) errorType = "offline";
          else if (res.status === 401) errorType = "auth";
          else if (res.status === 403) errorType = "token_expired";

          retryCount.current++;
          setState((prev) => ({ ...prev, loading: false, error: msg, errorType, connected: false }));
          nextPollMs.current = Math.min(60000, nextPollMs.current * 2);
          return;
        }

        const data = await res.json();
        retryCount.current = 0;

        setState({
          vehicleData: data.vehicleData,
          telemetry: data.recentTelemetry,
          mode: data.mode,
          anomalies: data.anomalies,
          loading: false,
          error: null,
          errorType: null,
          connected: true,
          lastUpdate: Date.now(),
        });

        nextPollMs.current = data.nextPollMs || 5000;
      } catch (err) {
        if (aborted) return;
        retryCount.current++;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Network error",
          errorType: "generic",
          connected: false,
        }));
        nextPollMs.current = Math.min(60000, nextPollMs.current * 2);
      }
    };

    const poll = async () => {
      await fetchOnce();
      if (!aborted) {
        timer = setTimeout(poll, nextPollMs.current);
      }
    };

    manualFetchRef.current = fetchOnce;
    poll();

    return () => {
      aborted = true;
      if (timer) clearTimeout(timer);
    };
  }, [vehicleId, demoMode, scenario]);

  return { ...state, refetch, retryCount: retryCount.current };
}
