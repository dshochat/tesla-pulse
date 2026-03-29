"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AIChatMessage } from "@/types/tesla";

interface ChatPanelProps {
  demoMode?: boolean;
  className?: string;
}

const suggestions = [
  "Battery status?",
  "Last trip efficiency?",
  "Any anomalies?",
  "Charging history?",
  "Climate status?",
  "Estimated range?",
];

export default function ChatPanel({ demoMode = true, className }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: AIChatMessage = { role: "user", content: msg, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          demo: demoMode,
        }),
      });

      const data = await res.json();
      const assistantMsg: AIChatMessage = {
        role: "assistant",
        content: data.reply || data.error || "No response",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className ?? ""}`}>
      {/* Toggle button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-bg-card text-accent shadow-lg shadow-accent/10 transition-all hover:bg-accent/10 hover:shadow-accent/20"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full border border-accent/40"
              animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex h-[480px] w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-bg-card shadow-2xl shadow-black/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <motion.div
                  className="h-2 w-2 rounded-full bg-accent"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm font-medium text-text-primary">TeslaPulse AI</span>
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                  {demoMode ? "DEMO" : "LIVE"}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4m0-4h.01" />
                      </svg>
                    </div>
                    <p className="text-sm text-text-secondary mb-1">
                      Ask about your Tesla
                    </p>
                    <p className="text-[10px] text-text-secondary/60 mb-4">
                      Powered by vehicle telemetry + AI
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {suggestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="rounded-full border border-border px-2.5 py-1 text-[10px] text-text-secondary transition-all hover:border-accent/30 hover:text-accent hover:bg-accent/5"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-accent/15 text-accent"
                        : "bg-bg-hover text-text-primary"
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="rounded-lg bg-bg-hover px-4 py-2.5">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-accent/60"
                          animate={{ y: [-1, 1, -1] }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.15,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your Tesla..."
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="flex items-center justify-center rounded-lg bg-accent/20 px-3 py-2 text-accent transition-all hover:bg-accent/30 disabled:opacity-30 disabled:hover:bg-accent/20"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
