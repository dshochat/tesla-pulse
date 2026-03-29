"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";

interface MiniMapProps {
  latitude: number;
  longitude: number;
  heading: number;
  className?: string;
}

export default function MiniMap({ latitude, longitude, heading, className }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    // Inject Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    let cancelled = false;

    import("leaflet").then((Leaflet) => {
      if (cancelled || !mapRef.current) return;

      // Clean up any stale Leaflet state on the DOM node
      const container = mapRef.current;
      if ((container as unknown as Record<string, unknown>)._leaflet_id) {
        delete (container as unknown as Record<string, unknown>)._leaflet_id;
      }

      const map = Leaflet.default.map(container, {
        center: [latitude, longitude],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      });

      Leaflet.default
        .tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 19 }
        )
        .addTo(map);

      const carIcon = Leaflet.default.divIcon({
        html: `<div style="
          width: 16px; height: 16px;
          background: #00d4ff;
          border: 2px solid #0a0a0f;
          border-radius: 50%;
          box-shadow: 0 0 12px #00d4ff88;
        "><div style="
          position: absolute; top: -4px; left: 50%; transform: translateX(-50%) rotate(${heading}deg);
          width: 0; height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 6px solid #00d4ff;
        "></div></div>`,
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = Leaflet.default
        .marker([latitude, longitude], { icon: carIcon })
        .addTo(map);

      mapInstance.current = map;
      markerRef.current = marker;
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update position
  useEffect(() => {
    if (!mapInstance.current || !markerRef.current) return;
    mapInstance.current.panTo([latitude, longitude], { animate: true, duration: 1 });
    markerRef.current.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border ${className ?? ""}`}>
      <div ref={mapRef} className="h-full w-full" style={{ minHeight: 200 }} />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-card">
          <span className="text-xs text-text-secondary">Loading map...</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded-md bg-bg/80 px-2 py-1 backdrop-blur">
        <span className="font-mono-telemetry text-[10px] text-text-secondary">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
