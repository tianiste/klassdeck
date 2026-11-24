import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// OpenID discovery for the issuer <origin>/api/auth (path-insertion form).
export const GET = oauthProviderOpenIdConfigMetadata(auth, {
  headers: { "Access-Control-Allow-Origin": "*" },
});
