import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { classifyHost } from "@better-auth/core/utils/host";
import { fetchClientMetadataResource as nodeTransport } from "@better-auth/cimd/node";

/**
 * Transport for CIMD client-metadata documents and their `jwks_uri` keys.
 *
 * On Node we use Better Auth's transport, which resolves DNS once, checks every
 * address is public and pins the connection to it. Cloudflare Workers have no DNS or
 * socket-level control (fetch resolves inside Cloudflare's network), so there we use
 * fetch with every check that can be made before and after the request:
 * - HTTPS only, GET/HEAD only, no credentials in the URL;
 * - the host must be public: IP literals outside public ranges, `localhost`,
 *   `.local`/`.internal`-style names and cloud-metadata names are refused;
 * - redirects are never followed (returned to the caller, which rejects them);
 * - a hard timeout and body size cap, on top of the plugin's own (5 KB, a few seconds).
 *
 * What a Worker cannot do is pin the resolved address, so a public name that resolves
 * to a private address isn't caught here. On Workers that address is resolved and
 * dialled from Cloudflare's edge, where private ranges don't reach any network of
 * ours, and `global_fetch_strictly_public` keeps the request off our own zone.
 * See docs/decisions.md ("CIMD transport on Workers").
 */

const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

/** Host suffixes that only make sense inside a private network. */
const PRIVATE_SUFFIXES = [".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

function assertPublicHttpsUrl(url: URL) {
  if (url.protocol !== "https:") throw new TypeError("metadata URL must use HTTPS");
  if (url.username || url.password) throw new TypeError("metadata URL must not contain credentials");
  const host = classifyHost(url.hostname);
  if (host.kind !== "public") {
    throw new TypeError("metadata hostname must be public-routable");
  }
  if (host.literal === "fqdn") {
    const name = host.canonical.replace(/\.$/, "");
    if (!name.includes(".") || PRIVATE_SUFFIXES.some((s) => name.endsWith(s))) {
      throw new TypeError("metadata hostname must be a public domain name");
    }
  }
}

/** Passes the body through, erroring once it exceeds MAX_BYTES. */
function capBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BYTES) controller.error(new TypeError("metadata response too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
}

export const fetchClientMetadataResourceViaFetch: ClientMetadataResourceFetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assertPublicHttpsUrl(url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new TypeError("metadata transport supports only GET and HEAD");
  }

  const signals = [AbortSignal.timeout(TIMEOUT_MS)];
  if (init?.signal) signals.push(init.signal);
  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
    signal: AbortSignal.any(signals),
  });

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new TypeError("metadata response too large");
  }
  if (!response.body) return response;
  return new Response(capBody(response.body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

/** True inside the Cloudflare Workers runtime (including `wrangler dev`). */
function onWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/** Picks the strongest transport the current runtime supports. */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = (input, init) =>
  onWorkers() ? fetchClientMetadataResourceViaFetch(input, init) : nodeTransport(input, init);
