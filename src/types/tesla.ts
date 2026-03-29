// ─── Tesla Fleet API Response Types ───────────────────────────────────

export interface TeslaVehicle {
  id: number;
  id_s: string; // string version of id — safe for large integers
  vehicle_id: number;
  vin: string;
  display_name: string;
  state: "online" | "asleep" | "offline";
  color: string | null;
  access_type: string;
}

export interface TeslaVehicleList {
  response: TeslaVehicle[];
  count: number;
}

// ─── Vehicle Data Sub-States ──────────────────────────────────────────

export interface DriveState {
  gps_as_of: number;
  heading: number;
  latitude: number;
  longitude: number;
  power: number; // kW, negative = regen
  shift_state: "D" | "R" | "P" | "N" | null;
  speed: number | null; // mph
  timestamp: number;
}

export interface ChargeState {
  battery_level: number; // 0-100
  battery_range: number; // miles
  charge_energy_added: number; // kWh
  charge_rate: number; // mph of range
  charger_actual_current: number;
  charger_power: number; // kW
  charger_voltage: number;
  charging_state: "Charging" | "Complete" | "Disconnected" | "Stopped" | "NoPower";
  est_battery_range: number;
  ideal_battery_range: number;
  minutes_to_full_charge: number;
  time_to_full_charge: number; // hours
  timestamp: number;
  usable_battery_level: number;
}

export interface ClimateState {
  driver_temp_setting: number; // °C
  fan_status: number;
  inside_temp: number; // °C
  is_auto_conditioning_on: boolean;
  is_climate_on: boolean;
  outside_temp: number; // °C
  passenger_temp_setting: number;
  timestamp: number;
}

export interface VehicleState {
  car_version: string;
  fd_window: number; // 0 = closed
  fp_window: number;
  rd_window: number;
  rp_window: number;
  locked: boolean;
  odometer: number;
  sentry_mode: boolean;
  sentry_mode_available: boolean;
  timestamp: number;
  vehicle_name: string;
}

export interface VehicleConfig {
  car_type: string;
  exterior_color: string;
  wheel_type: string;
  trim_badging: string;
}

export interface TirePressure {
  front_left: number;
  front_right: number;
  rear_left: number;
  rear_right: number;
  timestamp: number;
}

// ─── Full Vehicle Data ────────────────────────────────────────────────

export interface TeslaVehicleData {
  id: number;
  vehicle_id: number;
  vin: string;
  display_name: string;
  state: string;
  charge_state: ChargeState;
  climate_state: ClimateState;
  drive_state: DriveState;
  vehicle_state: VehicleState;
  vehicle_config: VehicleConfig;
}

export interface TeslaVehicleDataResponse {
  response: TeslaVehicleData;
}

// ─── Auth Types ───────────────────────────────────────────────────────

export interface TeslaTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  expires_at?: number; // unix timestamp we compute
}

// ─── Telemetry Point (our internal format) ────────────────────────────

export interface TelemetryPoint {
  timestamp: number;
  speed: number | null;
  power: number;
  battery_level: number;
  battery_range: number;
  latitude: number;
  longitude: number;
  heading: number;
  inside_temp: number;
  outside_temp: number;
  shift_state: string | null;
  charging_state: string;
  charge_rate: number;
  charger_power: number;
  odometer: number;
}

// ─── Trip Types ───────────────────────────────────────────────────────

export interface Trip {
  id: string;
  started_at: number;
  ended_at: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_miles: number;
  energy_used_kwh: number;
  avg_speed_mph: number;
  max_speed_mph: number;
  efficiency_wh_per_mile: number;
  start_battery: number;
  end_battery: number;
  ai_summary: string | null;
  ai_efficiency_score: number | null;
  ai_highlights: string | null; // JSON array
  ai_tip: string | null;
}

// ─── AI Types ─────────────────────────────────────────────────────────

export interface AICoachTip {
  tip: string;
  timestamp: number;
}

export interface AITripSummary {
  summary: string;
  efficiency_score: number;
  highlights: string[];
  tip: string;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── Anomaly Types ────────────────────────────────────────────────────

export interface Anomaly {
  id: string;
  type: "tire_pressure" | "vampire_drain" | "power_spike" | "temp_outlier";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, number | string>;
  timestamp: number;
  ai_explanation?: string;
}

// ─── Vehicle Command Types ────────────────────────────────────────────

export type VehicleCommand =
  | "honk_horn"
  | "flash_lights"
  | "door_lock"
  | "door_unlock"
  | "auto_conditioning_start"
  | "auto_conditioning_stop"
  | "set_temps";

export interface CommandResult {
  result: boolean;
  reason?: string;
}

// ─── App State ────────────────────────────────────────────────────────

export type DashboardMode = "driving" | "charging" | "parked" | "offline" | "asleep";

export interface AppState {
  mode: DashboardMode;
  connected: boolean;
  demoMode: boolean;
  selectedVehicleId: number | null;
}
