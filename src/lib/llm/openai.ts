import OpenAI from "openai";
import type { AITripSummary } from "@/types/tesla";
import type { LLMProvider, TelemetryContext, TripContext, AnomalyContext, VehicleContext, ChatMessage } from "./types";
import { SYSTEM_PROMPTS } from "./types";

const MODEL = "gpt-5.4";

let client: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  if (!client) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required for OpenAI provider");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

async function complete(system: string, userMessage: string, maxTokens: number): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export const openaiProvider: LLMProvider = {
  name: "openai",

  async generateCoachTip(ctx: TelemetryContext): Promise<string> {
    return complete(SYSTEM_PROMPTS.coach, ctx.summary, 150);
  },

  async generateTripSummary(ctx: TripContext): Promise<AITripSummary> {
    const text = await complete(SYSTEM_PROMPTS.tripSummary, ctx.summary, 400);
    try {
      return JSON.parse(text) as AITripSummary;
    } catch {
      return { summary: text, efficiency_score: 50, highlights: [], tip: "" };
    }
  },

  async generateAnomalyExplanation(ctx: AnomalyContext): Promise<string> {
    return complete(SYSTEM_PROMPTS.anomaly, `Anomaly: ${ctx.type}\nMessage: ${ctx.message}\nData: ${JSON.stringify(ctx.data)}`, 200);
  },

  async chat(messages: ChatMessage[], vehicleContext: VehicleContext): Promise<string> {
    const systemPrompt = `${SYSTEM_PROMPTS.chat}\n\nCurrent vehicle context:\n${vehicleContext.contextString}`;
    const res = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });
    return res.choices[0]?.message?.content ?? "I couldn't process that request.";
  },
};

export function resetOpenAIClient() {
  client = null;
}
