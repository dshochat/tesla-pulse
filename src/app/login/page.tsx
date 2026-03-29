"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setIsSetup(!d.passwordSet))
      .catch(() => setIsSetup(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setError("");
    setLoading(true);

    try {
      const endpoint = isSetup ? "/api/auth/setup" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }

      router.push("/");
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  };

  if (isSetup === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-mono-telemetry text-2xl font-bold text-accent">TeslaPulse</h1>
          <p className="mt-1 text-xs text-text-secondary">
            {isSetup ? "Create a password to secure your dashboard" : "Enter your password to continue"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl border border-border bg-bg-card p-6">
            {isSetup && (
              <div className="mb-4 rounded-lg bg-accent/5 border border-accent/20 px-3 py-2 text-xs text-accent">
                First time setup — choose a password for your TeslaPulse dashboard.
              </div>
            )}

            <label className="mb-2 block text-xs font-medium text-text-secondary">
              {isSetup ? "New Password" : "Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetup ? "Choose a password..." : "Enter password..."}
              autoFocus
              className="w-full rounded-lg border border-border bg-bg px-4 py-3 font-mono-telemetry text-sm text-text-primary placeholder-text-secondary/40 outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 text-xs text-negative"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              className="mt-4 w-full rounded-lg bg-accent/20 py-3 text-sm font-medium text-accent transition-all hover:bg-accent/30 disabled:opacity-40"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />
                  {isSetup ? "Setting up..." : "Signing in..."}
                </span>
              ) : isSetup ? (
                "Set Password & Enter"
              ) : (
                "Enter"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
