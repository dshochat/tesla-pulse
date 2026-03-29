"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface CommandPanelProps {
  onCommand: (command: string) => Promise<void>;
  disabled?: boolean;
  liveMode?: boolean;
}

function HornIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15V9a1 1 0 0 1 1-1h2l5-5v18l-5-5H3a1 1 0 0 1-1-1z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.5 6.5a10 10 0 0 1 0 11" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function ClimateOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10 1.4-1.4" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ClimateOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2" />
      <circle cx="12" cy="12" r="4" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

const commands = [
  { id: "honk_horn", label: "Honk", Icon: HornIcon, confirm: true },
  { id: "flash_lights", label: "Flash", Icon: FlashIcon, confirm: true },
  { id: "door_lock", label: "Lock", Icon: LockIcon, confirm: false },
  { id: "door_unlock", label: "Unlock", Icon: UnlockIcon, confirm: true },
  { id: "auto_conditioning_start", label: "Climate On", Icon: ClimateOnIcon, confirm: false },
  { id: "auto_conditioning_stop", label: "Climate Off", Icon: ClimateOffIcon, confirm: false },
];

export default function CommandPanel({ onCommand, disabled, liveMode }: CommandPanelProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; success: boolean } | null>(null);

  const handleClick = async (cmd: (typeof commands)[0]) => {
    if (cmd.confirm && confirming !== cmd.id) {
      setConfirming(cmd.id);
      setTimeout(() => setConfirming(null), 3000);
      return;
    }

    setConfirming(null);
    setExecuting(cmd.id);
    setResult(null);

    try {
      await onCommand(cmd.id);
      setResult({ id: cmd.id, success: true });
    } catch {
      setResult({ id: cmd.id, success: false });
    } finally {
      setExecuting(null);
      setTimeout(() => setResult(null), 2000);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">
        Commands
      </h3>

      {liveMode && (
        <div className="mb-3 rounded-lg bg-bg-hover px-3 py-2 text-[10px] text-text-secondary leading-relaxed">
          Commands require Tesla Vehicle Command Protocol. Available in Demo Mode.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {commands.map((cmd) => {
          const isConfirming = confirming === cmd.id;
          const isExecuting = executing === cmd.id;
          const cmdResult = result?.id === cmd.id ? result : null;

          return (
            <motion.button
              key={cmd.id}
              onClick={() => handleClick(cmd)}
              disabled={disabled || isExecuting}
              whileTap={{ scale: 0.95 }}
              className={`relative flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs transition-all duration-200 ${
                isConfirming
                  ? "border border-warning/50 bg-warning/10 text-warning"
                  : cmdResult?.success
                    ? "border border-positive/50 bg-positive/10 text-positive"
                    : cmdResult && !cmdResult.success
                      ? "border border-negative/50 bg-negative/10 text-negative"
                      : "border border-transparent bg-bg-hover text-text-secondary hover:bg-border hover:text-text-primary"
              } disabled:opacity-40`}
            >
              {isExecuting ? (
                <motion.div
                  className="h-[18px] w-[18px] rounded-full border-2 border-accent border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                <cmd.Icon />
              )}
              <span className="font-medium leading-none">
                {isConfirming ? "Confirm?" : cmd.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
