import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { telemetryStore } from "./telemetry-store";
import { getSettings } from "./settings";
import { buildVoiceSystemPrompt } from "./voice-prompt";

const VOICE_PORT = parseInt(process.env.VOICE_PORT || "3101");
const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";
const TELEMETRY_REFRESH_INTERVAL = 30_000; // 30s

let server: WebSocketServer | null = null;
let started = false;

export function startVoiceServer() {
  if (started) return;
  started = true;

  const settings = getSettings();
  const apiKey = settings.keys?.xai_api_key;
  if (!apiKey) {
    console.log("[Voice] No XAI_API_KEY configured — voice server disabled");
    return;
  }

  try {
    server = new WebSocketServer({ port: VOICE_PORT });
    console.log(`[Voice] WebSocket server listening on port ${VOICE_PORT}`);
  } catch (err) {
    console.error("[Voice] Failed to start:", err);
    started = false;
    return;
  }

  server.on("connection", (clientWs: WebSocket, req: IncomingMessage) => {
    console.log("[Voice] Client connected from", req.socket.remoteAddress);

    const settings = getSettings();
    const apiKey = settings.keys?.xai_api_key;
    if (!apiKey) {
      clientWs.close(4001, "No XAI_API_KEY configured");
      return;
    }

    const voiceSettings = settings.voice || {};
    const voice = voiceSettings.voice || "Rex";

    // Connect to xAI Realtime API
    let xaiWs: WebSocket | null = null;
    let telemetryTimer: ReturnType<typeof setInterval> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    const SILENCE_TIMEOUT = 120_000; // 2 min idle disconnect

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (!voiceSettings.always_listening) {
        silenceTimer = setTimeout(() => {
          console.log("[Voice] Silence timeout — closing connection");
          cleanup();
        }, SILENCE_TIMEOUT);
      }
    };

    const cleanup = () => {
      if (telemetryTimer) clearInterval(telemetryTimer);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (xaiWs && xaiWs.readyState <= WebSocket.OPEN) {
        xaiWs.close();
      }
      if (clientWs.readyState <= WebSocket.OPEN) {
        clientWs.close();
      }
      xaiWs = null;
    };

    try {
      xaiWs = new WebSocket(XAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch (err) {
      console.error("[Voice] Failed to connect to xAI:", err);
      clientWs.close(4002, "Failed to connect to voice service");
      return;
    }

    xaiWs.on("open", () => {
      console.log("[Voice] Connected to xAI Realtime API");

      // Configure session
      const systemPrompt = buildVoiceSystemPrompt();
      const sessionUpdate = {
        type: "session.update",
        session: {
          instructions: systemPrompt,
          voice,
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            silence_duration_ms: 800,
            prefix_padding_ms: 300,
          },
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
            },
          },
        },
      };

      xaiWs!.send(JSON.stringify(sessionUpdate));

      // Notify client that session is ready
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "voice.ready" }));
      }

      // Refresh telemetry in instructions every 30s
      telemetryTimer = setInterval(() => {
        if (xaiWs && xaiWs.readyState === WebSocket.OPEN) {
          const freshPrompt = buildVoiceSystemPrompt();
          xaiWs.send(JSON.stringify({
            type: "session.update",
            session: { instructions: freshPrompt },
          }));
        }
      }, TELEMETRY_REFRESH_INTERVAL);

      resetSilenceTimer();
    });

    // Relay xAI → Client
    xaiWs.on("message", (data: Buffer | string) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        const msg = data.toString();
        clientWs.send(msg);

        // Log key events
        try {
          const parsed = JSON.parse(msg);
          const t = parsed.type;
          if (t === "session.updated") {
            console.log("[Voice] Session configured successfully");
          } else if (t === "error") {
            console.error("[Voice] xAI error:", JSON.stringify(parsed.error || parsed));
          } else if (t === "input_audio_buffer.speech_started") {
            console.log("[Voice] Speech detected");
          } else if (t === "response.created") {
            console.log("[Voice] Generating response...");
          } else if (t === "response.done") {
            console.log("[Voice] Response complete");
          } else if (t?.startsWith("response.")) {
            resetSilenceTimer();
          }
        } catch { /* not JSON, relay as-is */ }
      }
    });

    xaiWs.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => {
        console.error(`[Voice] xAI rejected connection: HTTP ${res.statusCode} ${res.statusMessage}`);
        console.error(`[Voice] Response body: ${body}`);
        console.error(`[Voice] Headers: ${JSON.stringify(res.headers)}`);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: "voice.error",
            error: `Voice service rejected: ${res.statusCode} ${body.slice(0, 200)}`,
          }));
        }
        cleanup();
      });
    });

    xaiWs.on("error", (err) => {
      console.error("[Voice] xAI WebSocket error:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: "voice.error",
          error: "Voice service connection error: " + err.message,
        }));
      }
    });

    xaiWs.on("close", (code, reason) => {
      console.log(`[Voice] xAI connection closed: ${code} ${reason.toString()}`);
      cleanup();
    });

    // Relay Client → xAI
    clientWs.on("message", (data: Buffer | string) => {
      resetSilenceTimer();
      if (xaiWs && xaiWs.readyState === WebSocket.OPEN) {
        xaiWs.send(data.toString());
      }
    });

    clientWs.on("close", () => {
      console.log("[Voice] Client disconnected");
      cleanup();
    });

    clientWs.on("error", (err) => {
      console.error("[Voice] Client error:", err.message);
      cleanup();
    });
  });

  server.on("error", (err) => {
    console.error("[Voice] Server error:", err);
  });
}

export function stopVoiceServer() {
  if (server) {
    server.close();
    server = null;
    started = false;
    console.log("[Voice] Server stopped");
  }
}

export function isVoiceServerRunning(): boolean {
  return started && server !== null;
}
