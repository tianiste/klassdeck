// End-to-end smoke test of the MCP connect flow against a running dev server.
// Acts like an AI app: registers an OAuth client, signs a test user in,
// approves consent, exchanges the code for a token, then calls the MCP tools.
//
//   npm run dev            (in another terminal)
//   node scripts/smoke-mcp.mjs [baseUrl]
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const RESOURCE = `${BASE}/mcp`;
const REDIRECT = "http://127.0.0.1:8976/callback";
const b64url = (buf) => buf.toString("base64url");

let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    redirect: "manual",
    ...init,
    headers: { origin: BASE, ...(cookie ? { cookie } : {}), ...init.headers },
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
    for (const c of set) {
      const [kv] = c.split(";");
      const [k, v] = kv.split(/=(.*)/s);
      jar.set(k, v);
    }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  return res;
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function check(cond, msg, extra) {
  if (!cond) {
    console.error("FAIL:", msg, extra ?? "");
    process.exit(1);
  }
  console.log("ok  ", msg);
}

// 1. Test user
const email = `smoke-${Date.now()}@example.test`;
let r = await call("/api/auth/sign-up/email", json({ email, password: "smoke-test-pass", name: "Smoke Test" }));
check(r.ok, "sign up test user", await r.clone().text());

// 2. Unauthenticated MCP call gets a challenge pointing at resource metadata
r = await fetch(RESOURCE, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const challenge = r.headers.get("www-authenticate") ?? "";
check(r.status === 401 && challenge.includes("resource_metadata"), "MCP returns 401 + resource_metadata", challenge);
const prmUrl = challenge.match(/resource_metadata="([^"]+)"/)[1];
const prm = await (await fetch(prmUrl)).json();
check(prm.resource === RESOURCE, "protected resource metadata", prm);
const issuer = prm.authorization_servers[0];
const asUrl = new URL(issuer);
const as = await (await fetch(`${asUrl.origin}/.well-known/oauth-authorization-server${asUrl.pathname}`)).json();
check(as.authorization_endpoint && as.token_endpoint, "authorization server metadata");

// 3. Dynamic client registration (2025-era clients)
r = await call(as.registration_endpoint, json({
  client_name: "Smoke Test AI",
  redirect_uris: [REDIRECT],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
}));
const client = await r.json();
check(r.ok && client.client_id, "register client", client);

// 4. Authorize with PKCE (user already signed in via cookie)
const verifier = b64url(randomBytes(32));
const challengeS256 = b64url(createHash("sha256").update(verifier).digest());
const authUrl = new URL(as.authorization_endpoint);
Object.entries({
  response_type: "code",
  client_id: client.client_id,
  redirect_uri: REDIRECT,
  scope: "openid profile offline_access",
  state: "xyz",
  code_challenge: challengeS256,
  code_challenge_method: "S256",
  resource: RESOURCE,
}).forEach(([k, v]) => authUrl.searchParams.set(k, v));
r = await call(authUrl.toString());
// Browser navigations get a 302; fetch-style requests get { redirect, url } JSON.
const consentLoc = r.headers.get("location") ?? (await r.clone().json().catch(() => ({}))).url ?? "";
check(consentLoc.includes("/consent"), "authorize sends the user to consent", `${r.status} ${consentLoc} ${await r.text()}`);

// 5. Approve consent
const oauthQuery = new URL(consentLoc, BASE).search.slice(1);
r = await call("/api/auth/oauth2/consent", json({ accept: true, oauth_query: oauthQuery }));
const consent = await r.json();
check(r.ok && consent.url?.startsWith(REDIRECT), "consent returns redirect with code", consent);
const code = new URL(consent.url).searchParams.get("code");

// 6. Token exchange
r = await fetch(as.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: RESOURCE,
  }),
});
const tokens = await r.json();
check(r.ok && tokens.access_token, "exchange code for access token", tokens);

// 7. MCP calls (2025-era streamable HTTP, stateless)
let id = 0;
async function rpc(method, params) {
  const res = await fetch(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${tokens.access_token}`,
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const payload = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))?.slice(5);
  return { status: res.status, body: payload ? JSON.parse(payload) : text };
}

let out = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
check(out.body?.result?.serverInfo?.name === "klassdeck", "initialize", out);

out = await rpc("tools/list", {});
const names = out.body?.result?.tools?.map((t) => t.name) ?? [];
check(["create_set", "add_questions", "list_sets", "get_set"].every((n) => names.includes(n)), `tools/list: ${names.join(", ")}`, out);

out = await rpc("tools/call", {
  name: "create_set",
  arguments: {
    title: "Photosynthesis basics",
    subject: "Biology",
    questions: [
      { type: "flashcard", prompt: "What gas do plants absorb for photosynthesis?", answer: "Carbon dioxide (CO₂)", explanation: "CO₂ is fixed into sugars in the Calvin cycle." },
      { type: "multiple_choice", prompt: "Where does photosynthesis take place?", choices: ["Mitochondria", "Chloroplasts", "Nucleus", "Ribosomes"], correct_index: 1, source_ref: "Textbook p. 45" },
      { type: "true_false", prompt: "Oxygen is a by-product of photosynthesis.", answer: true },
    ],
  },
});
const created = out.body?.result?.structuredContent;
check(!out.body?.result?.isError && created?.id, "create_set", out);
console.log("     ->", created.url);

out = await rpc("tools/call", { name: "add_questions", arguments: { set_id: created.id, questions: [{ type: "short_answer", prompt: "Name the green pigment in leaves.", answer: "Chlorophyll" }] } });
check(out.body?.result?.structuredContent?.questionCount === 4, "add_questions", out);

out = await rpc("tools/call", { name: "create_set", arguments: { title: "Bad", questions: [{ type: "multiple_choice", prompt: "x", choices: ["a", "b"], correct_index: 5 }] } });
check(out.body?.result?.isError || out.body?.error, "invalid correct_index is rejected", out);

out = await rpc("tools/call", { name: "list_sets", arguments: { query: "photo" } });
check(out.body?.result?.structuredContent?.sets?.length === 1, "list_sets finds the set", out);

out = await rpc("tools/call", { name: "get_set", arguments: { set_id: created.id } });
const got = out.body?.result?.structuredContent;
check(got?.questions?.length === 4 && got.questions[1].correct_index === 1, "get_set returns questions", out);

out = await rpc("tools/call", { name: "get_set", arguments: { set_id: "does-not-exist" } });
check(out.body?.result?.isError, "get_set on unknown id is an error");

// 8. Wrong token is rejected
r = await fetch(RESOURCE, { method: "POST", headers: { authorization: "Bearer nope", "content-type": "application/json" }, body: "{}" });
check(r.status === 401, "invalid token rejected");

console.log(`\nAll checks passed. Test user: ${email}`);
