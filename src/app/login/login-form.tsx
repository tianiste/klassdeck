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

/** Messages for errors Better Auth appends to the URL after a failed Google sign-in. */
function socialError(code: string | null): string | null {
  if (!code) return null;
  if (code === "account_not_linked") {
    return "This email already has a Klassdeck account with a password. Log in with your password instead.";
  }
  return "Google sign-in didn't work. Try again, or use your email and password.";
}

export function LoginForm({ google, emailPassword }: { google: boolean; emailPassword: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [error, setError] = useState<string | null>(socialError(params.get("error")));
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

  async function onGoogle() {
    setError(null);
    setPending(true);
    // While connecting an AI, the auth client adds the signed OAuth query to this request
    // and Better Auth resumes the connect flow after Google's callback (consent → AI app).
    // On failure Google's callback comes back to this same page, query included.
    const here = window.location.pathname + window.location.search;
    const res = await authClient.signIn.social({
      provider: "google",
      callbackURL: safeNext(params.get("next")),
      errorCallbackURL: here,
    });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong.");
      setPending(false);
      return;
    }
    followRedirect(res.data);
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
      {google && (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={pending}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 font-medium hover:border-accent disabled:opacity-60"
          >
            <GoogleMark />
            Continue with Google
          </button>
          {emailPassword && <p className="mt-4 text-center text-xs text-muted">or with email</p>}
        </>
      )}
      {!google && !emailPassword && (
        <p className="mt-6 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          Sign-in isn&apos;t available right now. Please try again later.
        </p>
      )}
      {!emailPassword && error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {emailPassword && (
        <>
          <form onSubmit={onSubmit} className={google ? "mt-4 space-y-3" : "mt-6 space-y-3"}>
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
        </>
      )}
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

/** Google's "G" mark, as its sign-in branding guidelines ask for on the button. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
