import type { AITripSummary } from "@/types/tesla";

/** Pre-aggregated telemetry context for coach tips */
export interface TelemetryContext {
  avgSpeed: number;
  avgPower: number;
  batteryDrain: number;
  maxPower: number;
  minPower: number;
  regenEvents: number;
  totalPoints: number;
  summary: string; // pre-formatted summary string
}

/** Pre-aggregated trip data for summaries */
export interface TripContext {
  durationMin: number;
  distanceMiles: number;
  batteryStart: number;
  batteryEnd: number;
  batteryUsed: number;
  avgSpeed: number;
  maxSpeed: number;
  avgPower: number;
  whPerMile: number;
  summary: string; // pre-formatted summary string
}

/** Anomaly context for explanations */
export interface AnomalyContext {
  type: string;
  message: string;
  data: Record<string, number | string>;
}

/** Vehicle context for chat */
export interface VehicleContext {
  contextString: string;
}

/** Chat message format */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** System prompts shared across all providers */
export const SYSTEM_PROMPTS = {
  coach:
    "You are TeslaPulse, an AI driving efficiency coach. Analyze the telemetry data and give ONE short, specific tip (max 2 sentences) to improve efficiency. Be conversational, not robotic. Reference specific numbers from the data.",
  tripSummary: `You are TeslaPulse. Generate a trip summary as JSON with these fields:
- summary (2-3 sentence narrative of the trip)
- efficiency_score (1-100 based on Wh/mi vs 250 Wh/mi EPA estimate)
- highlights (array of 3 notable moments)
- tip (one actionable improvement for next time)
Respond ONLY with valid JSON, no markdown.`,
  anomaly:
    "You are TeslaPulse AI. Explain this vehicle anomaly in plain English. Be concise (2-3 sentences). Include what it means and whether the driver should be concerned.",
  chat: "You are TeslaPulse AI. You have access to the user's Tesla telemetry data. Answer questions about their vehicle's status, efficiency, trip history, and provide recommendations. Be concise and data-driven.",
} as const;

/** Provider interface — all LLM providers must implement this */
export interface LLMProvider {
  name: string;
  generateCoachTip(ctx: TelemetryContext): Promise<string>;
  generateTripSummary(ctx: TripContext): Promise<AITripSummary>;
  generateAnomalyExplanation(ctx: AnomalyContext): Promise<string>;
  chat(messages: ChatMessage[], vehicleContext: VehicleContext): Promise<string>;
}

export type ProviderName = "grok" | "claude" | "openai" | "gemini";

export const PROVIDER_INFO: Record<ProviderName, { label: string; color: string; envKey: string }> = {
  grok: { label: "Grok", color: "#ffffff", envKey: "XAI_API_KEY" },
  claude: { label: "Claude", color: "#e8734a", envKey: "ANTHROPIC_API_KEY" },
  openai: { label: "GPT", color: "#10a37f", envKey: "OPENAI_API_KEY" },
  gemini: { label: "Gemini", color: "#4285f4", envKey: "GEMINI_API_KEY" },
};
