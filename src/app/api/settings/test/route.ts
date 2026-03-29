import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json() as {
      provider: string;
      apiKey?: string;
    };

    // Attempt a minimal API call to verify the key works
    switch (provider) {
      case "grok": {
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({
          apiKey: apiKey || process.env.XAI_API_KEY || "",
          baseURL: "https://api.x.ai/v1",
        });
        await client.models.list();
        return NextResponse.json({ success: true, message: "Grok connection successful" });
      }

      case "claude": {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY || "" });
        await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
        return NextResponse.json({ success: true, message: "Claude connection successful" });
      }

      case "openai": {
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY || "" });
        await client.models.list();
        return NextResponse.json({ success: true, message: "OpenAI connection successful" });
      }

      case "gemini": {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY || "");
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        await model.generateContent("Hi");
        return NextResponse.json({ success: true, message: "Gemini connection successful" });
      }

      default:
        return NextResponse.json({ success: false, message: `Unknown provider: ${provider}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ success: false, message }, { status: 200 }); // 200 so frontend can read the message
  }
}
