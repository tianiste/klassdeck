// Build the Worker and deploy it to Cloudflare (run by the owner; see docs/DEPLOY.md).
//
// OpenNext copies values from local .env files (e.g. .env.local with the dev
// BETTER_AUTH_SECRET) into .open-next/cloudflare/next-env.mjs, which would be
// uploaded with the Worker. Production values come from Worker secrets instead,
// so this script empties that file between the build and the deploy.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function run(command) {
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx opennextjs-cloudflare build");

writeFileSync(
  ".open-next/cloudflare/next-env.mjs",
  "export const production = {};\nexport const development = {};\nexport const test = {};\n",
);
console.log("[deploy] cleared local .env values from the Worker bundle");

run(`npx opennextjs-cloudflare deploy ${process.argv.slice(2).join(" ")}`);
