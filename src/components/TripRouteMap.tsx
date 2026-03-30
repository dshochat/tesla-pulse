"use client";

import { useEffect, useRef } from "react";
import type { TripSegment } from "@/types/tesla";

function getSegmentColor(whPerMile: number): string {
  if (whPerMile < 250) return "#00ff88";
  if (whPerMile < 300) return "#ffaa00";
  return "#ff4466";
}

interface TripRouteMapProps {
  segments: TripSegment[];
  className?: string;
}

export default function TripRouteMap({ segments, className = "" }: TripRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || segments.length === 0) return;
    if (mapInstance.current) return; // already initialized

    let L: typeof import("leaflet") | null = null;

    const init = async () => {
      // Dynamic import
      L = (await import("leaflet")).default;

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Draw segments as colored polylines
      const allCoords: [number, number][] = [];

      for (const seg of segments) {
        try {
          const coords = JSON.parse(seg.polyline_json) as [number, number][];
          if (coords.length < 2) continue;

          const color = getSegmentColor(seg.wh_per_mile);
          L.polyline(coords, {
            color,
            weight: 4,
            opacity: 0.85,
          }).addTo(map);

          allCoords.push(...coords);
        } catch {
          // skip invalid polyline
        }
      }

      // Fit bounds to all coordinates
      if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords.map(([lat, lng]) => [lat, lng]));
        map.fitBounds(bounds, { padding: [20, 20] });
      }

      // Add start/end markers
      if (allCoords.length >= 2) {
        const start = allCoords[0];
        const end = allCoords[allCoords.length - 1];

        L.circleMarker(start, {
          radius: 5,
          color: "#00d4ff",
          fillColor: "#00d4ff",
          fillOpacity: 1,
        }).addTo(map);

        L.circleMarker(end, {
          radius: 5,
          color: "#ff4466",
          fillColor: "#ff4466",
          fillOpacity: 1,
        }).addTo(map);
      }

      mapInstance.current = map;
    };

    init();

    return () => {
      if (mapInstance.current) {
        try {
          (mapInstance.current as { remove: () => void }).remove();
        } catch { /* */ }
        mapInstance.current = null;
      }
    };
  }, [segments]);

  if (segments.length === 0) return null;

  return (
    <div className={`rounded-lg overflow-hidden border border-border ${className}`}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={mapRef} className="h-full w-full" style={{ minHeight: 180 }} />
    </div>
  );
}
