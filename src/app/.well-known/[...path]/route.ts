import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/**
 * Discovery documents, in one route so the auth library is bundled once rather than
 * once per document (keeps the Cloudflare Worker under its size limit).
 */
const cors = { headers: { "Access-Control-Allow-Origin": "*" } };
const handlers: Record<string, (request: Request) => Response | Promise<Response>> = {
  // RFC 8414 metadata for the issuer <origin>/api/auth.
  "oauth-authorization-server/api/auth": oauthProviderAuthServerMetadata(auth, cors),
  // OpenID discovery for the issuer <origin>/api/auth (path-insertion form).
  "openid-configuration/api/auth": oauthProviderOpenIdConfigMetadata(auth, cors),
  // RFC 9728 metadata for the /mcp resource. The mcp() auth plugin builds this
  // document when the request reaches the auth handler, so forward it there.
  "oauth-protected-resource/mcp": (request) => auth.handler(request),
};

export async function GET(request: Request, ctx: RouteContext<"/.well-known/[...path]">) {
  const { path } = await ctx.params;
  const handler = handlers[path.join("/")];
  return handler ? handler(request) : new Response("Not found", { status: 404 });
}
