"use client";

import { useState, useEffect } from "react";
import type { TeslaVehicle } from "@/types/tesla";

export function useVehicle(demoMode: boolean) {
  const [vehicles, setVehicles] = useState<TeslaVehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVehicles() {
      try {
        const params = new URLSearchParams();
        if (demoMode) params.set("demo", "true");
        const res = await fetch(`/api/tesla/vehicles?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setVehicles(data.vehicles);
        if (data.vehicles.length > 0) {
          // Use id_s (string) if available, fall back to id as string
          const v = data.vehicles[0];
          setSelectedId(v.id_s || String(v.id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch vehicles");
      } finally {
        setLoading(false);
      }
    }

    fetchVehicles();
  }, [demoMode]);

  const selectedVehicle = vehicles.find((v) => (v.id_s || String(v.id)) === selectedId) ?? null;

  return {
    vehicles,
    selectedVehicle,
    selectedId,
    setSelectedId,
    loading,
    error,
  };
}
