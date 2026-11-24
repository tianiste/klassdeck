import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { auth } from "@/lib/auth";
import { mcpResource } from "@/lib/auth-options";
import { createKlassdeckServer } from "@/mcp/server";

/**
 * The Klassdeck MCP endpoint. AI apps add https://<host>/mcp as a connector;
 * requireMcpAuth sends unauthenticated clients through Klassdeck's OAuth login
 * and only lets through access tokens issued for this resource.
 */
const mcpHandler = createMcpHandler(({ authInfo }) => {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string") throw new Error("MCP request reached the server without a user");
  const agentName = typeof authInfo?.extra?.agentName === "string" ? authInfo.extra.agentName : null;
  return createKlassdeckServer({ userId, agentName });
});

async function clientName(clientId: string | undefined): Promise<string | null> {
  if (!clientId) return null;
  const [row] = await db
    .select({ name: oauthClient.name })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return row?.name ?? null;
}

const handle = requireMcpAuth(
  auth,
  async (request, claims) => {
    const userId = claims.sub;
    if (!userId) {
      return Response.json({ error: "invalid_token", error_description: "Token has no subject" }, { status: 401 });
    }
    const clientId = (claims.azp ?? claims.client_id) as string | undefined;
    const token = request.headers.get("authorization")?.replace(/^\w+\s+/, "") ?? "";
    return mcpHandler.fetch(request, {
      authInfo: {
        token,
        clientId: clientId ?? "unknown",
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
        expiresAt: claims.exp,
        resource: new URL(mcpResource),
        extra: { userId, agentName: await clientName(clientId) },
      },
    });
  },
  { resource: mcpResource },
);

export { handle as GET, handle as POST, handle as DELETE };
