"use client";

import { useState, useEffect, useRef } from "react";
import type { DashboardMode } from "@/types/tesla";
import { mockCoachTips } from "@/lib/mock-data";

interface CoachState {
  tip: string | null;
  loading: boolean;
  lastUpdate: number | null;
}

export function useAICoach(mode: DashboardMode, demoMode: boolean) {
  const [state, setState] = useState<CoachState>({
    tip: null,
    loading: false,
    lastUpdate: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipIndex = useRef(0);

  useEffect(() => {
    if (mode !== "driving") {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const fetchTip = async () => {
      if (demoMode) {
        // Cycle through mock tips
        const tip = mockCoachTips[tipIndex.current % mockCoachTips.length];
        tipIndex.current++;
        setState({ tip: tip.tip, loading: false, lastUpdate: Date.now() });
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch("/api/ai/coach");
        if (res.ok) {
          const data = await res.json();
          setState({ tip: data.tip, loading: false, lastUpdate: data.timestamp });
        }
      } catch {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    // Fetch immediately, then every 15s in demo, 60s in live
    fetchTip();
    const interval = demoMode ? 15_000 : 60_000;
    intervalRef.current = setInterval(fetchTip, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mode, demoMode]);

  return state;
}
