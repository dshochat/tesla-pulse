"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type VoiceState = "idle" | "connecting" | "listening" | "processing" | "speaking" | "error";

interface Transcript {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export default function VoiceCoPilot({ demoMode }: { demoMode: boolean }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const currentTranscriptRef = useRef("");

  // Auto-fade transcripts after 10s
  useEffect(() => {
    if (transcripts.length === 0) return;
    const timer = setTimeout(() => {
      setTranscripts((prev) => prev.filter((t) => Date.now() - t.timestamp < 10000));
    }, 10000);
    return () => clearTimeout(timer);
  }, [transcripts]);

  const getWsUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocal) return "ws://localhost:3101";
    return `wss://${window.location.host}/voice`;
  }, []);

  const playAudioChunk = useCallback((base64: string) => {
    if (!audioCtxRef.current) return;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // PCM 16-bit LE to Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    playbackQueueRef.current.push(float32);
    if (!isPlayingRef.current) {
      drainPlaybackQueue();
    }
  }, []);

  const drainPlaybackQueue = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const chunk = playbackQueueRef.current.shift()!;
    const buffer = ctx.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => drainPlaybackQueue();
    source.start();
  }, []);

  const stopPlayback = useCallback(() => {
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Resample audio to target rate
  const resample = useCallback((input: Float32Array, inputRate: number, outputRate: number): Float32Array => {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const outputLen = Math.round(input.length / ratio);
    const output = new Float32Array(outputLen);
    for (let i = 0; i < outputLen; i++) {
      const srcIdx = i * ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      output[i] = idx + 1 < input.length
        ? input[idx] * (1 - frac) + input[idx + 1] * frac
        : input[idx] || 0;
    }
    return output;
  }, []);

  // startCapture and connect are now inlined in toggle

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    stopPlayback();
    setState("idle");
  }, [stopPlayback]);

  const toggle = useCallback(async () => {
    if (state !== "idle" && state !== "error") {
      disconnect();
      return;
    }

    if (demoMode) {
      setError("Voice requires live mode");
      setState("error");
      return;
    }

    // CRITICAL: getUserMedia MUST be called directly from the click handler
    // on Android. If we await anything first, the user gesture is "consumed"
    // and the browser auto-denies mic access.
    setState("connecting");
    setError(null);
    stopPlayback();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Voice] getUserMedia failed:", msg);
      setError("Mic: " + msg);
      setState("error");
      return;
    }

    mediaStreamRef.current = stream;

    // Now set up AudioContext and WebSocket
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const nativeSampleRate = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      let chunkCount = 0;

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const resampled = resample(input, nativeSampleRate, 24000);

        const pcm16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          const s = Math.max(-1, Math.min(1, resampled[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const bytes = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }

        wsRef.current.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: btoa(binary),
        }));

        chunkCount++;
        if (chunkCount === 1) console.log("[Voice] First audio chunk sent");
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Audio: " + msg);
      setState("error");
      return;
    }

    // Connect WebSocket
    const wsUrl = getWsUrl();
    console.log("[Voice] Connecting to:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log("[Voice] WebSocket connected");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "voice.ready":
            setState("listening");
            break;
          case "input_audio_buffer.speech_started":
            setState("listening");
            stopPlayback();
            currentTranscriptRef.current = "";
            break;
          case "input_audio_buffer.speech_stopped":
            setState("processing");
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (msg.transcript) {
              setTranscripts((prev) => [...prev.slice(-3), { role: "user", text: msg.transcript, timestamp: Date.now() }]);
            }
            break;
          case "response.created":
            setState("processing");
            break;
          case "response.output_audio.delta":
            setState("speaking");
            if (msg.delta) playAudioChunk(msg.delta);
            break;
          case "response.output_audio_transcript.delta":
            if (msg.delta) currentTranscriptRef.current += msg.delta;
            break;
          case "response.output_audio_transcript.done":
          case "response.done":
            if (currentTranscriptRef.current) {
              setTranscripts((prev) => [...prev.slice(-3), { role: "assistant", text: currentTranscriptRef.current, timestamp: Date.now() }]);
              currentTranscriptRef.current = "";
            }
            setState("listening");
            break;
          case "voice.error":
            setError(msg.error || "Voice error");
            setState("error");
            break;
        }
      } catch { /* non-JSON */ }
    };

    ws.onerror = (ev) => {
      console.error("[Voice] WebSocket error:", ev);
      setError("WebSocket failed");
      setState("error");
    };

    ws.onclose = () => {
      setState((prev) => prev === "error" ? "error" : "idle");
      wsRef.current = null;
    };
  }, [state, demoMode, getWsUrl, stopPlayback, playAudioChunk, disconnect, resample]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const stateConfig: Record<VoiceState, { color: string; label: string }> = {
    idle: { color: "#6b6b80", label: "Voice Co-Pilot" },
    connecting: { color: "#00d4ff", label: "Connecting..." },
    listening: { color: "#00d4ff", label: "Listening..." },
    processing: { color: "#ffaa00", label: "Thinking..." },
    speaking: { color: "#00ff88", label: "Speaking..." },
    error: { color: "#ff4466", label: error || "Error" },
  };

  const config = stateConfig[state];
  const isActive = state !== "idle" && state !== "error";
  const showLabel = state !== "idle";

  return (
    <>
      {/* Mic button */}
      <div className="fixed bottom-6 left-6 z-50">
        <motion.button
          onClick={toggle}
          disabled={demoMode}
          className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all disabled:opacity-40"
          style={{
            backgroundColor: isActive ? config.color + "20" : "#1a1a2e",
            border: `2px solid ${config.color}`,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={demoMode ? "Voice co-pilot available in live mode with Grok" : config.label}
        >
          {/* Pulsing rings when active */}
          <AnimatePresence>
            {(state === "listening" || state === "speaking") && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${config.color}` }}
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${config.color}` }}
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                />
              </>
            )}
          </AnimatePresence>

          {/* Connecting spinner */}
          {state === "connecting" && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          )}

          {/* Icon */}
          {state === "speaking" ? (
            // Speaker icon
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : state === "processing" ? (
            // Brain/thinking dots
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: config.color }}
                  animate={{ y: [-2, 2, -2] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          ) : state === "error" ? (
            // Error X
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            // Mic icon
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </motion.button>

        {/* State label */}
        <AnimatePresence>
          {showLabel && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="absolute left-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: "#0a0a0f",
                border: `1px solid ${config.color}30`,
                color: config.color,
              }}
            >
              {config.label}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Transcript overlay */}
      <AnimatePresence>
        {transcripts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-6 z-40 max-w-md space-y-1.5"
          >
            {transcripts.slice(-4).map((t, i) => (
              <motion.div
                key={t.timestamp + i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 0.9 }}
                className="rounded-lg px-3 py-2 text-xs backdrop-blur-md"
                style={{
                  backgroundColor: t.role === "user" ? "rgba(0,212,255,0.1)" : "rgba(0,255,136,0.1)",
                  border: `1px solid ${t.role === "user" ? "rgba(0,212,255,0.2)" : "rgba(0,255,136,0.2)"}`,
                  color: t.role === "user" ? "#00d4ff" : "#00ff88",
                }}
              >
                <span className="font-medium">
                  {t.role === "user" ? "You" : "Pulse"}:
                </span>{" "}
                <span className="text-text-primary">{t.text}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
