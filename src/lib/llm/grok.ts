import OpenAI from "openai";
import type { AITripSummary } from "@/types/tesla";
import type { LLMProvider, TelemetryContext, TripContext, AnomalyContext, VehicleContext, ChatMessage } from "./types";
import { SYSTEM_PROMPTS } from "./types";
import { getSettings } from "../settings";

const FAST_MODEL = "grok-4-fast";
const FULL_MODEL = "grok-4";

let client: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  if (!client) {
    const settings = getSettings();
    const key = apiKey || settings.keys?.xai_api_key || process.env.XAI_API_KEY;
    if (!key) throw new Error("XAI_API_KEY is required for Grok provider");
    client = new OpenAI({ apiKey: key, baseURL: "https://api.x.ai/v1" });
  }
  return client;
}

async function complete(model: string, system: string, userMessage: string, maxTokens: number, apiKey?: string): Promise<string> {
  const res = await getClient(apiKey).chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export const grokProvider: LLMProvider = {
  name: "grok",

  async generateCoachTip(ctx: TelemetryContext): Promise<string> {
    return complete(FAST_MODEL, SYSTEM_PROMPTS.coach, ctx.summary, 150);
  },

  async generateTripSummary(ctx: TripContext): Promise<AITripSummary> {
    const text = await complete(FULL_MODEL, SYSTEM_PROMPTS.tripSummary, ctx.summary, 400);
    try {
      return JSON.parse(text) as AITripSummary;
    } catch {
      return { summary: text, efficiency_score: 50, highlights: [], tip: "" };
    }
  },

  async generateAnomalyExplanation(ctx: AnomalyContext): Promise<string> {
    return complete(FAST_MODEL, SYSTEM_PROMPTS.anomaly, `Anomaly: ${ctx.type}\nMessage: ${ctx.message}\nData: ${JSON.stringify(ctx.data)}`, 200);
  },

  async chat(messages: ChatMessage[], vehicleContext: VehicleContext): Promise<string> {
    const systemPrompt = `${SYSTEM_PROMPTS.chat}\n\nCurrent vehicle context:\n${vehicleContext.contextString}`;
    const res = await getClient().chat.completions.create({
      model: FULL_MODEL,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });
    return res.choices[0]?.message?.content ?? "I couldn't process that request.";
  },
};

/** Reset client (for when API key changes via settings) */
export function resetGrokClient() {
  client = null;
}
