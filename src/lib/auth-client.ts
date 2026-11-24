"use client";

import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/**
 * Browser auth client. oauthProviderClient() forwards the signed OAuth query
 * when the login/consent pages are part of an MCP connect flow, so signing in
 * continues the flow back to the AI app automatically.
 */
export const authClient = createAuthClient({
  plugins: [oauthProviderClient()],
});
