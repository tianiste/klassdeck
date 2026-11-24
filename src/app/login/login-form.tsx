"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/** Follows the OAuth provider's "continue" redirect when signing in as part of connecting an AI. */
function followRedirect(data: unknown): boolean {
  if (data && typeof data === "object" && "url" in data && "redirect" in data) {
    const { url, redirect } = data as { url?: unknown; redirect?: unknown };
    if (redirect && typeof url === "string") {
      window.location.href = url;
      return true;
    }
  }
  return false;
}

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The OAuth authorize endpoint sends people here with a signed query (client_id, sig, ...).
  const connectingAi = params.has("client_id") && params.has("sig");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const res =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(form.get("name")) })
        : await authClient.signIn.email({ email, password });

    if (res.error) {
      setError(res.error.message ?? "Something went wrong.");
      setPending(false);
      return;
    }
    if (followRedirect(res.data)) return;
    router.push(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "signup" ? "Create your account" : "Log in"}
      </h1>
      {connectingAi && (
        <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
          Log in to connect your AI to Klassdeck.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        {mode === "signup" && (
          <Field label="Name" name="name" type="text" autoComplete="name" />
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {mode === "signup" ? "Already have an account? " : "New to Klassdeck? "}
        <button
          type="button"
          className="font-medium text-accent"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? "Log in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}

function Field(props: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { label, ...input } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        required
        {...input}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
      />
    </label>
  );
}
