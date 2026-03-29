import Anthropic from "@anthropic-ai/sdk";
import type { AITripSummary } from "@/types/tesla";
import type { LLMProvider, TelemetryContext, TripContext, AnomalyContext, VehicleContext, ChatMessage } from "./types";
import { SYSTEM_PROMPTS } from "./types";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(apiKey?: string): Anthropic {
  if (!client) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required for Claude provider");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

async function complete(system: string, userMessage: string, maxTokens: number): Promise<string> {
  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

export const claudeProvider: LLMProvider = {
  name: "claude",

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
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const block = msg.content[0];
    return block.type === "text" ? block.text : "I couldn't process that request.";
  },
};

export function resetClaudeClient() {
  client = null;
}
