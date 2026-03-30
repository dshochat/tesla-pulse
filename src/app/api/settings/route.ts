import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, getMaskedSettings, clearSettingsCache, maskKey } from "@/lib/settings";
import { resetProvider } from "@/lib/llm/provider";
import { restartBackgroundPoller } from "@/lib/background-poller";

export async function GET() {
  try {
    const masked = getMaskedSettings();
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { demo_mode, background_polling, llm_provider, keys, voice } = body as {
      demo_mode?: boolean;
      background_polling?: boolean;
      llm_provider?: string;
      keys?: Record<string, string>;
      voice?: { enabled?: boolean; voice?: string; always_listening?: boolean };
    };

    const current = getSettings();
    let pollerChanged = false;

    // Update demo mode
    if (typeof demo_mode === "boolean") {
      current.demo_mode = demo_mode;
    }

    // Update background polling
    if (typeof background_polling === "boolean") {
      if (current.background_polling !== background_polling) pollerChanged = true;
      current.background_polling = background_polling;
    }

    // Update provider if provided
    if (llm_provider && ["grok", "claude", "openai", "gemini"].includes(llm_provider)) {
      current.llm_provider = llm_provider;
    }

    // Update voice settings
    if (voice) {
      if (!current.voice) current.voice = { enabled: true, voice: "Rex", always_listening: false };
      if (typeof voice.enabled === "boolean") current.voice.enabled = voice.enabled;
      if (voice.voice) current.voice.voice = voice.voice;
      if (typeof voice.always_listening === "boolean") current.voice.always_listening = voice.always_listening;
    }

    // Update keys — skip if empty or still masked
    if (keys) {
      for (const [k, v] of Object.entries(keys)) {
        if (k in current.keys) {
          const key = k as keyof typeof current.keys;
          if (v && !v.includes("••••") && v !== maskKey(current.keys[key])) {
            current.keys[key] = v;
          }
        }
      }
    }

    saveSettings(current);
    clearSettingsCache();
    resetProvider();

    if (pollerChanged) {
      restartBackgroundPoller();
    }

    return NextResponse.json({ success: true, settings: getMaskedSettings() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
