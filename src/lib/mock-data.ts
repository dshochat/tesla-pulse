import type {
  TeslaVehicle,
  TeslaVehicleData,
  TelemetryPoint,
  Trip,
  Anomaly,
  AICoachTip,
} from "@/types/tesla";

// ─── Mock Vehicle ─────────────────────────────────────────────────────

export const mockVehicle: TeslaVehicle = {
  id: 1234567890,
  id_s: "1234567890",
  vehicle_id: 9876543210,
  vin: "5YJ3E1EA1PF000001",
  display_name: "Midnight Storm",
  state: "online",
  color: "MidnightSilver",
  access_type: "OWNER",
};

// ─── Mock Vehicle Data (snapshot) ─────────────────────────────────────

export const mockVehicleData: TeslaVehicleData = {
  id: 1234567890,
  vehicle_id: 9876543210,
  vin: "5YJ3E1EA1PF000001",
  display_name: "Midnight Storm",
  state: "online",
  drive_state: {
    gps_as_of: Date.now() / 1000,
    heading: 245,
    latitude: 37.3861,
    longitude: -122.0839,
    power: 18.5,
    shift_state: "D",
    speed: 42,
    timestamp: Date.now(),
  },
  charge_state: {
    battery_level: 72,
    battery_range: 198.5,
    charge_energy_added: 0,
    charge_rate: 0,
    charger_actual_current: 0,
    charger_power: 0,
    charger_voltage: 0,
    charging_state: "Disconnected",
    est_battery_range: 185.2,
    ideal_battery_range: 210.8,
    minutes_to_full_charge: 0,
    time_to_full_charge: 0,
    timestamp: Date.now(),
    usable_battery_level: 71,
  },
  climate_state: {
    driver_temp_setting: 21,
    fan_status: 3,
    inside_temp: 22.5,
    is_auto_conditioning_on: true,
    is_climate_on: true,
    outside_temp: 18.3,
    passenger_temp_setting: 21,
    timestamp: Date.now(),
  },
  vehicle_state: {
    car_version: "2025.12.6 abc123",
    fd_window: 0,
    fp_window: 0,
    rd_window: 0,
    rp_window: 0,
    locked: true,
    odometer: 12847.3,
    sentry_mode: false,
    sentry_mode_available: true,
    timestamp: Date.now(),
    vehicle_name: "Midnight Storm",
  },
  vehicle_config: {
    car_type: "model3",
    exterior_color: "MidnightSilver",
    wheel_type: "Pinwheel18",
    trim_badging: "74d",
  },
};

// ─── Generate Simulated Drive (25 min) ────────────────────────────────

export function generateMockDrive(): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const startTime = Date.now() - 25 * 60 * 1000;
  const startOdo = 12842.1;
  const startBattery = 78;
  let odo = startOdo;
  let battery = startBattery;
  let lat = 37.3861;
  let lng = -122.0839;

  // Phase 1: Residential streets (0-5 min)
  for (let i = 0; i < 60; i++) {
    const t = startTime + i * 5000;
    const speed = 25 + Math.sin(i * 0.3) * 10;
    const power = speed * 0.35 + Math.random() * 3;
    odo += (speed / 3600) * 5;
    battery -= 0.008;
    lat += 0.00005;
    lng -= 0.00008;

    points.push({
      timestamp: t,
      speed: Math.max(0, speed),
      power,
      battery_level: battery,
      battery_range: battery * 2.75,
      latitude: lat,
      longitude: lng,
      heading: 245 + Math.sin(i * 0.2) * 15,
      inside_temp: 22.5,
      outside_temp: 18.3,
      shift_state: "D",
      charging_state: "Disconnected",
      charge_rate: 0,
      charger_power: 0,
      odometer: odo,
    });
  }

  // Phase 2: Highway on-ramp and cruise (5-18 min)
  for (let i = 60; i < 216; i++) {
    const t = startTime + i * 5000;
    const rampUp = Math.min(1, (i - 60) / 20);
    const speed = 25 + rampUp * 45 + Math.sin(i * 0.15) * 5;
    const power = speed > 55 ? speed * 0.5 + Math.random() * 8 : speed * 0.35;
    odo += (speed / 3600) * 5;
    battery -= speed > 55 ? 0.018 : 0.01;
    lat += 0.0001;
    lng -= 0.00015;

    points.push({
      timestamp: t,
      speed: Math.max(0, speed),
      power: power + (i === 80 ? 45 : 0), // brief acceleration spike
      battery_level: battery,
      battery_range: battery * 2.75,
      latitude: lat,
      longitude: lng,
      heading: 280 + Math.sin(i * 0.1) * 5,
      inside_temp: 22.3 + Math.random() * 0.4,
      outside_temp: 18.3 + (i - 60) * 0.01,
      shift_state: "D",
      charging_state: "Disconnected",
      charge_rate: 0,
      charger_power: 0,
      odometer: odo,
    });
  }

  // Phase 3: Highway exit and deceleration (18-22 min)
  for (let i = 216; i < 264; i++) {
    const t = startTime + i * 5000;
    const decel = Math.max(0, 1 - (i - 216) / 30);
    const speed = 15 + decel * 55;
    const power = decel > 0.5 ? speed * 0.3 : -12 * (1 - decel); // regen braking
    odo += (speed / 3600) * 5;
    battery -= power > 0 ? 0.008 : -0.003; // regen recovers
    lat += 0.00003;
    lng -= 0.0001;

    points.push({
      timestamp: t,
      speed: Math.max(0, speed),
      power,
      battery_level: battery,
      battery_range: battery * 2.75,
      latitude: lat,
      longitude: lng,
      heading: 200 + Math.sin(i * 0.3) * 20,
      inside_temp: 22.1,
      outside_temp: 19.1,
      shift_state: "D",
      charging_state: "Disconnected",
      charge_rate: 0,
      charger_power: 0,
      odometer: odo,
    });
  }

  // Phase 4: Arrival and park (22-25 min)
  for (let i = 264; i < 300; i++) {
    const t = startTime + i * 5000;
    const slow = Math.max(0, 15 * (1 - (i - 264) / 30));
    const power = slow > 2 ? slow * 0.2 : -3;
    odo += (slow / 3600) * 5;
    battery -= 0.002;

    points.push({
      timestamp: t,
      speed: slow > 0.5 ? slow : null,
      power: slow > 0.5 ? power : 0,
      battery_level: battery,
      battery_range: battery * 2.75,
      latitude: lat,
      longitude: lng,
      heading: 180,
      inside_temp: 22.0,
      outside_temp: 19.2,
      shift_state: slow > 0.5 ? "D" : "P",
      charging_state: "Disconnected",
      charge_rate: 0,
      charger_power: 0,
      odometer: odo,
    });
  }

  return points;
}

// ─── Generate Charging Session (45% to 80%) ───────────────────────────

export function generateMockChargingSession(): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const startTime = Date.now() - 45 * 60 * 1000;
  let battery = 45;
  const lat = 37.3947;
  const lng = -122.0798;

  for (let i = 0; i < 540; i++) {
    // 5s intervals for 45 min
    const t = startTime + i * 5000;
    const chargerPower = battery < 60 ? 48 : battery < 70 ? 35 : 22; // taper
    battery += (chargerPower / 75) * (5 / 3600) * 100; // rough % gain
    battery = Math.min(80, battery);

    points.push({
      timestamp: t,
      speed: null,
      power: -chargerPower, // negative = charging
      battery_level: battery,
      battery_range: battery * 2.75,
      latitude: lat,
      longitude: lng,
      heading: 90,
      inside_temp: 21.5 + Math.sin(i * 0.01) * 0.5,
      outside_temp: 16.8,
      shift_state: null,
      charging_state: battery >= 80 ? "Complete" : "Charging",
      charge_rate: chargerPower * 3.5,
      charger_power: chargerPower,
      odometer: 12847.3,
    });
  }

  return points;
}

// ─── Mock Trips ───────────────────────────────────────────────────────

export const mockTrips: Trip[] = [
  {
    id: "trip-001",
    started_at: Date.now() - 2 * 3600_000,
    ended_at: Date.now() - 2 * 3600_000 + 25 * 60_000,
    start_lat: 37.3861,
    start_lng: -122.0839,
    end_lat: 37.4019,
    end_lng: -122.1098,
    distance_miles: 5.2,
    energy_used_kwh: 1.35,
    avg_speed_mph: 38,
    max_speed_mph: 68,
    efficiency_wh_per_mile: 260,
    start_battery: 78,
    end_battery: 72,
    ai_summary:
      "A smooth 25-minute commute through Mountain View to Palo Alto. Highway cruise was efficient at 245 Wh/mi, but the residential segment pulled the average up with frequent stops.",
    ai_efficiency_score: 72,
    ai_highlights: JSON.stringify([
      "Maintained 65 mph cruise for 12 minutes with only 230 Wh/mi",
      "Recovered 0.8 kWh through regenerative braking on the exit ramp",
      "Peak acceleration of 85 kW merging onto highway — smooth entry",
    ]),
    ai_tip:
      "Pre-condition the cabin before departure to avoid running HVAC at full blast during the first 5 minutes — that alone could save 3-4% on short trips like this.",
  },
  {
    id: "trip-002",
    started_at: Date.now() - 26 * 3600_000,
    ended_at: Date.now() - 26 * 3600_000 + 42 * 60_000,
    start_lat: 37.4019,
    start_lng: -122.1098,
    end_lat: 37.3382,
    end_lng: -121.8863,
    distance_miles: 18.7,
    energy_used_kwh: 4.8,
    avg_speed_mph: 52,
    max_speed_mph: 72,
    efficiency_wh_per_mile: 257,
    start_battery: 85,
    end_battery: 72,
    ai_summary:
      "Highway-heavy drive from Palo Alto to San Jose. Consistent speeds kept efficiency reasonable despite moderate headwinds. Battery consumption was predictable.",
    ai_efficiency_score: 68,
    ai_highlights: JSON.stringify([
      "Smooth 70 mph cruise for 22 minutes straight — great lane discipline",
      "Regen captured 1.2 kWh on the long downhill into the valley",
      "Climate system draw was minimal at 0.3 kW average",
    ]),
    ai_tip:
      "Try drafting behind larger vehicles at safe distances on long highway stretches — aerodynamic savings can reduce consumption by 8-12% at highway speeds.",
  },
  {
    id: "trip-003",
    started_at: Date.now() - 50 * 3600_000,
    ended_at: Date.now() - 50 * 3600_000 + 15 * 60_000,
    start_lat: 37.3382,
    start_lng: -121.8863,
    end_lat: 37.3516,
    end_lng: -121.9053,
    distance_miles: 3.1,
    energy_used_kwh: 0.95,
    avg_speed_mph: 22,
    max_speed_mph: 35,
    efficiency_wh_per_mile: 306,
    start_battery: 92,
    end_battery: 90,
    ai_summary:
      "Short urban errand run with frequent stops. Stop-and-go traffic resulted in higher-than-usual consumption. Good regen usage at intersections.",
    ai_efficiency_score: 45,
    ai_highlights: JSON.stringify([
      "11 full stops in 3 miles — heavy urban traffic",
      "Regen recaptured 0.25 kWh despite short distance",
      "Cabin pre-conditioned — zero HVAC ramp-up penalty",
    ]),
    ai_tip:
      "For sub-5-mile urban trips, consider combining errands to avoid the fixed energy cost of warming up the drivetrain each time.",
  },
];

// ─── Mock Anomalies ───────────────────────────────────────────────────

export const mockAnomalies: Anomaly[] = [
  {
    id: "anomaly-001",
    type: "vampire_drain",
    severity: "warning",
    message: "Battery draining 2.3%/hr while parked",
    data: { drain_rate: 2.3, battery_level: 68, hours_monitored: 4.2 },
    timestamp: Date.now() - 8 * 3600_000,
    ai_explanation:
      "Your car lost 2.3% per hour over 4 hours while parked. This is slightly above normal (0.5-1%). Sentry Mode was active — that's the most likely cause. Each camera draws continuous power. Consider disabling Sentry when parked in trusted locations to preserve range.",
  },
];

// ─── Mock AI Coach Tips ───────────────────────────────────────────────

export const mockCoachTips: AICoachTip[] = [
  {
    tip: "Your average power draw is 22 kW at 42 mph — that's solid. Ease off the accelerator 200 feet earlier before stops to maximize regen and you could shave another 15 Wh/mi.",
    timestamp: Date.now() - 30_000,
  },
  {
    tip: "Highway cruise at 68 mph is using 285 Wh/mi. Dropping to 62 mph would save about 12% energy — worth it if you're not in a rush.",
    timestamp: Date.now() - 90_000,
  },
  {
    tip: "Nice regen capture on that downhill — you recovered 0.4 kWh in 30 seconds. Keep one-pedal driving engaged for maximum energy recapture at intersections.",
    timestamp: Date.now() - 150_000,
  },
  {
    tip: "Cabin climate is pulling 1.8 kW right now. Switching from AC to fan-only would cut that to 0.3 kW and add roughly 8 miles of range on this trip.",
    timestamp: Date.now() - 210_000,
  },
  {
    tip: "You accelerated from 0-45 mph in 4 seconds there — fun, but that burst used 85 kW. A gentler 8-second launch would use about half the energy.",
    timestamp: Date.now() - 270_000,
  },
  {
    tip: "Steady 35 mph through this neighborhood is perfect for efficiency. You're averaging 195 Wh/mi in this zone — well below EPA.",
    timestamp: Date.now() - 330_000,
  },
  {
    tip: "Tire pressure check: front tires are at 42 PSI which is ideal for highway. Consider dropping to 40 PSI for a slightly softer ride if you're doing city driving.",
    timestamp: Date.now() - 390_000,
  },
  {
    tip: "Wind resistance increases exponentially above 50 mph. Your current 72 mph cruise costs 22% more energy than 60 mph would. Time vs. range trade-off!",
    timestamp: Date.now() - 450_000,
  },
];

// ─── Demo Mode Toggle ─────────────────────────────────────────────────
// This is a lightweight check for env vars only. Server-side API routes
// should use isDemoModeFromSettings() from settings.ts instead.
// This function exists for backward compat and is safe to import client-side.

export function isDemoMode(): boolean {
  return process.env.USE_MOCK === "true" || process.env.NEXT_PUBLIC_USE_MOCK === "true";
}
