"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ConsentButtons() {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    setError(null);
    const res = await authClient.oauth2.consent({ accept });
    const url = (res.data as { url?: string } | null)?.url;
    if (url) {
      window.location.href = url;
      return;
    }
    setError(res.error?.message ?? "Something went wrong. Try connecting again from your AI app.");
    setPending(null);
  }

  return (
    <div className="mt-6">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide(true)}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending === "accept" ? "Connecting…" : "Allow"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => decide(false)}
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 font-medium hover:border-foreground disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
