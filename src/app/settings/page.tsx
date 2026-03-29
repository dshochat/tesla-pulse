"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

type ProviderName = "grok" | "claude" | "openai" | "gemini";

interface ProviderOption {
  id: ProviderName;
  label: string;
  description: string;
  color: string;
  keyField: string;
  keyLabel: string;
  placeholder: string;
}

const providers: ProviderOption[] = [
  {
    id: "grok",
    label: "Grok (xAI)",
    description: "Fast and affordable. Uses grok-4-fast for tips, grok-4 for analysis.",
    color: "#ffffff",
    keyField: "xai_api_key",
    keyLabel: "xAI API Key",
    placeholder: "xai-...",
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    description: "Excellent reasoning. Uses claude-sonnet-4.6 for all features.",
    color: "#e8734a",
    keyField: "anthropic_api_key",
    keyLabel: "Anthropic API Key",
    placeholder: "sk-ant-...",
  },
  {
    id: "openai",
    label: "GPT (OpenAI)",
    description: "Widely available. Uses gpt-5.4 for all features.",
    color: "#10a37f",
    keyField: "openai_api_key",
    keyLabel: "OpenAI API Key",
    placeholder: "sk-...",
  },
  {
    id: "gemini",
    label: "Gemini (Google)",
    description: "Uses gemini-3.1-flash-lite for tips, gemini-3.1-pro for analysis.",
    color: "#4285f4",
    keyField: "gemini_api_key",
    keyLabel: "Gemini API Key",
    placeholder: "AIza...",
  },
];

export default function SettingsPage() {
  const [demoMode, setDemoMode] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>("grok");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [hasKey, setHasKey] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    // Check if already in standalone
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (installPrompt as any).prompt();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (installPrompt as any).userChoice;
    if (result.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
  };

  // Load settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setDemoMode(data.demo_mode ?? true);
        setSelectedProvider(data.llm_provider || "grok");
        setKeys(data.keys || {});
        setHasKey(data.hasKey || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Toggle demo mode — saves immediately (no need to hit Save)
  const handleToggleDemo = async (next: boolean) => {
    setDemoMode(next);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo_mode: next }),
      });
    } catch {
      // revert on failure
      setDemoMode(!next);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo_mode: demoMode, llm_provider: selectedProvider, keys }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.settings.keys);
        setHasKey(data.settings.hasKey);
        setEditing({});
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (providerId: string) => {
    setTesting(providerId);
    setTestResult(null);
    try {
      const p = providers.find((p) => p.id === providerId)!;
      const keyValue = editing[p.keyField] ? keys[p.keyField] : undefined;
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: keyValue }),
      });
      const data = await res.json();
      setTestResult({ provider: providerId, ...data });
    } catch {
      setTestResult({ provider: providerId, success: false, message: "Network error" });
    } finally {
      setTesting(null);
    }
  };

  const activeProvider = providers.find((p) => p.id === selectedProvider)!;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <motion.div
          className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-text-secondary hover:text-accent transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-xs">Dashboard</span>
            </Link>
            <h1 className="font-mono-telemetry text-lg font-bold text-text-primary">Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-all ${
              saved
                ? "bg-positive/20 text-positive"
                : "bg-accent/20 text-accent hover:bg-accent/30"
            } disabled:opacity-50`}
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-8">
        {/* Demo Mode Toggle */}
        <section className="rounded-xl border border-border bg-bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-text-primary">Demo Mode</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {demoMode
                  ? "Using simulated data — no API keys required."
                  : "Using live Tesla + AI APIs. Requires configured keys below."}
              </p>
            </div>
            <button
              onClick={() => handleToggleDemo(!demoMode)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
                demoMode ? "bg-accent" : "bg-border"
              }`}
            >
              <motion.span
                className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
                animate={{ x: demoMode ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          {!demoMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning"
            >
              Live mode requires a Tesla API key and at least one LLM provider key configured below.
            </motion.div>
          )}
        </section>

        {/* Background Polling */}
        <BackgroundPollingSection />

        {/* Provider Selection */}
        <section>
          <h2 className="mb-1 text-sm font-medium text-text-primary">AI Provider</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Choose which LLM powers TeslaPulse AI features.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={`relative rounded-xl border p-4 text-left transition-all ${
                  selectedProvider === p.id
                    ? "border-accent/50 bg-accent/5"
                    : "border-border bg-bg-card hover:border-border/80"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-sm font-medium text-text-primary">{p.label}</span>
                  {hasKey[p.keyField] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <p className="text-[10px] text-text-secondary leading-relaxed">{p.description}</p>
                {selectedProvider === p.id && (
                  <motion.div
                    layoutId="provider-ring"
                    className="absolute inset-0 rounded-xl border-2 border-accent/40 pointer-events-none"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* API Key for Selected Provider */}
        <section>
          <h2 className="mb-1 text-sm font-medium text-text-primary">
            {activeProvider.keyLabel}
          </h2>
          <p className="mb-4 text-xs text-text-secondary">
            Required for {activeProvider.label} integration. Keys are stored server-side only.
          </p>

          <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-center gap-3">
              {editing[activeProvider.keyField] ? (
                <input
                  type="password"
                  value={keys[activeProvider.keyField] || ""}
                  onChange={(e) =>
                    setKeys((k) => ({ ...k, [activeProvider.keyField]: e.target.value }))
                  }
                  placeholder={activeProvider.placeholder}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
                />
              ) : (
                <div className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-secondary">
                  {hasKey[activeProvider.keyField]
                    ? keys[activeProvider.keyField] || "••••••••"
                    : "Not configured"}
                </div>
              )}
              <button
                onClick={() =>
                  setEditing((e) => ({
                    ...e,
                    [activeProvider.keyField]: !e[activeProvider.keyField],
                  }))
                }
                className="rounded-lg bg-bg-hover px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {editing[activeProvider.keyField] ? "Cancel" : "Change"}
              </button>
              <button
                onClick={() => handleTest(activeProvider.id)}
                disabled={testing === activeProvider.id}
                className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                {testing === activeProvider.id ? "Testing..." : "Test"}
              </button>
            </div>

            {testResult && testResult.provider === activeProvider.id && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  testResult.success
                    ? "bg-positive/10 text-positive"
                    : "bg-negative/10 text-negative"
                }`}
              >
                {testResult.message}
              </motion.div>
            )}
          </div>
        </section>

        {/* Tesla API Keys */}
        <section>
          <h2 className="mb-1 text-sm font-medium text-text-primary">Tesla Fleet API</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Required for live vehicle data. Not needed in Demo Mode.
          </p>

          <div className="space-y-3">
            {[
              { field: "tesla_client_id", label: "Client ID", placeholder: "your-client-id" },
              { field: "tesla_client_secret", label: "Client Secret", placeholder: "your-client-secret" },
            ].map((item) => (
              <div key={item.field} className="rounded-xl border border-border bg-bg-card p-4">
                <label className="mb-2 block text-xs font-medium text-text-secondary">
                  {item.label}
                </label>
                <div className="flex items-center gap-3">
                  {editing[item.field] ? (
                    <input
                      type="password"
                      value={keys[item.field] || ""}
                      onChange={(e) =>
                        setKeys((k) => ({ ...k, [item.field]: e.target.value }))
                      }
                      placeholder={item.placeholder}
                      className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
                    />
                  ) : (
                    <div className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-secondary">
                      {hasKey[item.field] ? keys[item.field] || "••••••••" : "Not configured"}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      setEditing((e) => ({ ...e, [item.field]: !e[item.field] }))
                    }
                    className="rounded-lg bg-bg-hover px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {editing[item.field] ? "Cancel" : "Change"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tesla Tokens */}
        <TeslaTokensSection />

        {/* Change Password */}
        <ChangePasswordSection />

        {/* Install App */}
        {(installPrompt || installed) && (
          <section className="rounded-xl border border-border bg-bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-text-primary">Install App</h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {installed
                    ? "TeslaPulse is installed on this device."
                    : "Add TeslaPulse to your home screen for a native app experience."}
                </p>
              </div>
              {installed ? (
                <span className="rounded-lg bg-positive/10 px-3 py-1.5 text-xs font-medium text-positive">
                  Installed
                </span>
              ) : (
                <button
                  onClick={handleInstall}
                  className="rounded-lg bg-accent/20 px-4 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
                >
                  Install
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleChange = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: "Password changed" });
        setCurrentPw("");
        setNewPw("");
        setTimeout(() => { setResult(null); setOpen(false); }, 2000);
      } else {
        setResult({ ok: false, msg: data.error });
      }
    } catch {
      setResult({ ok: false, msg: "Failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Security</h2>
          <p className="mt-0.5 text-xs text-text-secondary">Change your dashboard password.</p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg bg-bg-hover px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {open ? "Cancel" : "Change Password"}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Current password"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleChange}
              disabled={!currentPw || !newPw || saving}
              className="rounded-lg bg-accent/20 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Update Password"}
            </button>
            {result && (
              <span className={`text-xs ${result.ok ? "text-positive" : "text-negative"}`}>
                {result.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function BackgroundPollingSection() {
  const [enabled, setEnabled] = useState(false);
  const [pollerStatus, setPollerStatus] = useState<string>("disabled");
  const [browserConnected, setBrowserConnected] = useState(false);

  useEffect(() => {
    // Load current state
    fetch("/api/settings").then(r => r.json()).then(d => setEnabled(d.background_polling ?? false)).catch(() => {});
    const poll = () => {
      fetch("/api/poller").then(r => r.json()).then(d => {
        setPollerStatus(d.status);
        setBrowserConnected(d.browserConnected);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background_polling: next }),
    });
    // Refresh status
    setTimeout(() => {
      fetch("/api/poller").then(r => r.json()).then(d => setPollerStatus(d.status)).catch(() => {});
    }, 1000);
  };

  const statusColor = pollerStatus === "active" ? "#00ff88" : pollerStatus === "paused" ? "#ffaa00" : "#6b6b80";
  const statusLabel = pollerStatus === "active" ? "Active" : pollerStatus === "paused" ? "Paused (browser connected)" : "Disabled";

  return (
    <section className="rounded-xl border border-border bg-bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Background Polling</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Record telemetry when no browser is open. Passive only — never wakes the car.
          </p>
        </div>
        <button
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
            enabled ? "bg-accent" : "bg-border"
          }`}
        >
          <motion.span
            className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
            animate={{ x: enabled ? 22 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-xs text-text-secondary">
          Background poller: <span style={{ color: statusColor }}>{statusLabel}</span>
        </span>
      </div>
    </section>
  );
}

function TeslaTokensSection() {
  const [tokenStatus, setTokenStatus] = useState<{
    has_access_token: boolean;
    has_refresh_token: boolean;
    expires_at: number;
    expired: boolean;
  } | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushPw, setPushPw] = useState("");
  const [showPush, setShowPush] = useState(false);
  const [prodUrl, setProdUrl] = useState("");
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    // Load token status
    fetch("/api/tesla/sync-token")
      .then((r) => r.json())
      .then(setTokenStatus)
      .catch(() => {});
    // Load production URL
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setProdUrl(d.production_url || ""))
      .catch(() => {});
  }, []);

  const handleSaveTokens = async () => {
    if (!accessToken || !refreshToken) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/tesla/sync-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: "Tokens saved" });
        setAccessToken("");
        setRefreshToken("");
        // Refresh status
        fetch("/api/tesla/sync-token").then((r) => r.json()).then(setTokenStatus);
      } else {
        setResult({ ok: false, msg: data.error });
      }
    } catch {
      setResult({ ok: false, msg: "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const handlePushToProduction = async () => {
    if (!pushPw) return;
    setPushing(true);
    setResult(null);
    try {
      // Call local server proxy — avoids CORS by doing server-to-server
      const res = await fetch("/api/tesla/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pushPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: "Tokens pushed to production" });
        setShowPush(false);
        setPushPw("");
      } else {
        setResult({ ok: false, msg: data.error || "Push failed" });
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : "Push failed" });
    } finally {
      setPushing(false);
    }
  };

  const expiresAt = tokenStatus?.expires_at;
  const expiryStr = expiresAt && expiresAt > 0
    ? new Date(expiresAt).toLocaleString()
    : "Unknown";
  const isExpired = tokenStatus?.expired;

  return (
    <section>
      <h2 className="mb-1 text-sm font-medium text-text-primary">Tesla Tokens</h2>
      <p className="mb-4 text-xs text-text-secondary">
        OAuth tokens for Tesla Fleet API access. Authenticate locally, then sync to production.
      </p>

      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${tokenStatus?.has_access_token ? (isExpired ? "bg-warning" : "bg-positive") : "bg-negative"}`} />
              <span className="text-xs text-text-primary">
                {tokenStatus?.has_access_token
                  ? isExpired ? "Token expired" : "Token active"
                  : "No token"}
              </span>
            </div>
            {tokenStatus?.has_access_token && (
              <p className="text-[10px] text-text-secondary ml-4">
                Expires: {expiryStr}
              </p>
            )}
          </div>
        </div>

        {/* Manual paste */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">Manual Token Entry</label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Access token"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
          />
          <input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="Refresh token"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSaveTokens}
            disabled={!accessToken || !refreshToken || saving}
            className="rounded-lg bg-accent/20 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Tokens"}
          </button>
        </div>

        {/* Push to production (localhost only) */}
        {isLocalhost && tokenStatus?.has_access_token && (
          <div className="border-t border-border pt-4">
            {!showPush ? (
              <button
                onClick={() => setShowPush(true)}
                className="rounded-lg bg-accent/10 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
              >
                Push to Production
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-text-secondary">
                  Push local tokens to <span className="font-mono-telemetry text-accent">{prodUrl}</span>
                </p>
                <input
                  type="password"
                  value={pushPw}
                  onChange={(e) => setPushPw(e.target.value)}
                  placeholder="Production password"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono-telemetry text-xs text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePushToProduction}
                    disabled={!pushPw || pushing}
                    className="rounded-lg bg-accent/20 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
                  >
                    {pushing ? "Pushing..." : "Push Tokens"}
                  </button>
                  <button
                    onClick={() => { setShowPush(false); setPushPw(""); }}
                    className="rounded-lg bg-bg-hover px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className={`rounded-lg px-3 py-2 text-xs ${result.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
            {result.msg}
          </div>
        )}
      </div>
    </section>
  );
}
