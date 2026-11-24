import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth, getUser } from "@/lib/auth";
import { ConsentButtons } from "./consent-buttons";

export const metadata = { title: "Connect your AI · Klassdeck" };

const SCOPE_LABELS: Record<string, string> = {
  openid: "Know who you are on Klassdeck",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected until you disconnect it",
};

function toQueryString(params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v !== undefined) qs.append(k, v);
  }
  return qs.toString();
}

export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  const params = await searchParams;
  const query = toQueryString(params);

  const user = await getUser();
  if (!user) redirect(`/login?${query}`);

  const { secret } = await auth.$context;
  const valid = query ? await verifyOAuthQueryParams(query, secret) : false;
  const clientId = typeof params.client_id === "string" ? params.client_id : null;
  if (!valid || !clientId) {
    return (
      <div className="mx-auto max-w-md py-6">
        <h1 className="text-2xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-muted">Go back to your AI app and start connecting Klassdeck again.</p>
      </div>
    );
  }

  const client = await auth.api
    .getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() })
    .catch(() => null);
  // Client names come from whoever registered the client: show as plain text only.
  const clientName = client?.client_name || "An AI app";
  const scopes = (typeof params.scope === "string" ? params.scope : "").split(" ").filter(Boolean);

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Connect {clientName} to Klassdeck?</h1>
      <p className="mt-2 text-muted">
        Signed in as <span className="text-foreground">{user.email}</span>
      </p>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <p className="font-medium">{clientName} will be able to:</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>✓ Save quizzes and flashcards to your account</li>
          <li>✓ Read the sets you have saved</li>
          {scopes
            .filter((s) => SCOPE_LABELS[s])
            .map((s) => (
              <li key={s}>✓ {SCOPE_LABELS[s]}</li>
            ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Only approve this if you just started connecting Klassdeck in your AI app.
        </p>
      </div>
      <ConsentButtons />
    </div>
  );
}
