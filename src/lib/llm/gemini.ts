import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AITripSummary } from "@/types/tesla";
import type { LLMProvider, TelemetryContext, TripContext, AnomalyContext, VehicleContext, ChatMessage } from "./types";
import { SYSTEM_PROMPTS } from "./types";

const FAST_MODEL = "gemini-3.1-flash-lite";
const FULL_MODEL = "gemini-3.1-pro-preview";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(apiKey?: string): GoogleGenerativeAI {
  if (!genAI) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required for Gemini provider");
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

async function complete(modelName: string, system: string, userMessage: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });
  const result = await model.generateContent(userMessage);
  return result.response.text();
}

export const geminiProvider: LLMProvider = {
  name: "gemini",

  async generateCoachTip(ctx: TelemetryContext): Promise<string> {
    return complete(FAST_MODEL, SYSTEM_PROMPTS.coach, ctx.summary);
  },

  async generateTripSummary(ctx: TripContext): Promise<AITripSummary> {
    const text = await complete(FULL_MODEL, SYSTEM_PROMPTS.tripSummary, ctx.summary);
    // Gemini sometimes wraps JSON in markdown
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      return JSON.parse(cleaned) as AITripSummary;
    } catch {
      return { summary: text, efficiency_score: 50, highlights: [], tip: "" };
    }
  },

  async generateAnomalyExplanation(ctx: AnomalyContext): Promise<string> {
    return complete(FAST_MODEL, SYSTEM_PROMPTS.anomaly, `Anomaly: ${ctx.type}\nMessage: ${ctx.message}\nData: ${JSON.stringify(ctx.data)}`);
  },

  async chat(messages: ChatMessage[], vehicleContext: VehicleContext): Promise<string> {
    const systemPrompt = `${SYSTEM_PROMPTS.chat}\n\nCurrent vehicle context:\n${vehicleContext.contextString}`;
    const model = getGenAI().getGenerativeModel({
      model: FULL_MODEL,
      systemInstruction: systemPrompt,
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMsg.content);
    return result.response.text();
  },
};

export function resetGeminiClient() {
  genAI = null;
}
