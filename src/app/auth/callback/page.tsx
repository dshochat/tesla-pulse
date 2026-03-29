"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function CallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing Tesla authorization...");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`Authorization failed: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received.");
      return;
    }

    fetch(`/api/tesla/callback?code=${code}`)
      .then((res) => {
        if (res.redirected) {
          window.location.href = res.url;
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.error) {
          setStatus("error");
          setMessage(data.error);
        } else {
          setStatus("success");
          setMessage("Authorization successful! Redirecting...");
          setTimeout(() => (window.location.href = "/"), 2000);
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Failed to complete authorization.");
      });
  }, [searchParams]);

  return (
    <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
      <div className="mb-4 text-4xl">
        {status === "loading" && "..."}
        {status === "success" && "OK"}
        {status === "error" && "X"}
      </div>
      <h1 className="mb-2 text-xl font-semibold text-text-primary">
        Tesla Authorization
      </h1>
      <p className="text-text-secondary">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense
        fallback={
          <div className="text-text-secondary">Processing authorization...</div>
        }
      >
        <CallbackContent />
      </Suspense>
    </main>
  );
}
