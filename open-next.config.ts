import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (auth-dependent) and nothing uses ISR or
// `use cache`, so the default (no incremental cache, no R2 bucket) is enough.
export default defineCloudflareConfig({});
