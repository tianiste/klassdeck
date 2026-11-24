import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// RFC 8414 metadata for the issuer <origin>/api/auth.
export const GET = oauthProviderAuthServerMetadata(auth, {
  headers: { "Access-Control-Allow-Origin": "*" },
});
