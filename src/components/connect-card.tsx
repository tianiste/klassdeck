"use client";

import { useState } from "react";

export function ConnectCard({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Connect your AI</h2>
      <p className="mt-1 text-sm text-muted">
        Add Klassdeck as a custom connector in Claude or ChatGPT, then ask it to “save this quiz to
        Klassdeck”.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-sm">{mcpUrl}</code>
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          onClick={async () => {
            await navigator.clipboard.writeText(mcpUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>In your AI app, open Settings → Connectors → Add custom connector.</li>
        <li>Paste the URL above and click Connect.</li>
        <li>Log in to Klassdeck and approve access.</li>
      </ol>
    </section>
  );
}
