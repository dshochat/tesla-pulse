"use client";

import { motion, AnimatePresence } from "framer-motion";

interface AICoachCardProps {
  tip: string | null;
  loading: boolean;
  visible: boolean;
}

export default function AICoachCard({ tip, loading, visible }: AICoachCardProps) {
  return (
    <AnimatePresence>
      {visible && tip && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden rounded-xl border border-accent/20 bg-bg-card p-4"
        >
          {/* Glow effect */}
          <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-accent/10 blur-2xl" />

          <div className="relative">
            <div className="mb-2 flex items-center gap-2">
              <motion.div
                className="h-1.5 w-1.5 rounded-full bg-accent"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] font-medium uppercase tracking-widest text-accent">
                AI Coach
              </span>
              {loading && (
                <motion.div
                  className="h-3 w-3 rounded-full border border-accent border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>

            <p className="text-sm leading-relaxed text-text-primary">{tip}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
