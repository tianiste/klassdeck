import { auth } from "@/lib/auth";

// RFC 9728 metadata for the /mcp resource. The mcp() auth plugin builds this
// document when the request reaches the auth handler, so forward it there.
export const GET = (request: Request) => auth.handler(request);
