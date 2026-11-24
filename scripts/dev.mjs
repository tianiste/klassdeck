// Local development: start a real Postgres (embedded-postgres, data in
// ./.data/postgres), apply migrations, then run `next dev` pointed at it.
// No Docker or system Postgres install needed.
//
// To use another Postgres instead, set DATABASE_URL and run `npm run dev:next`.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = process.env.LOCAL_PG_DIR ?? "./.data/postgres";
const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const DB_NAME = "klassdeck";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  autoRehydrateSymlinks: true,
  // Windows otherwise defaults to WIN1252, which can't store e.g. "CO₂".
  initdbFlags: ["--encoding=UTF8", "--no-locale"],
  onLog: () => {},
});

const firstRun = !existsSync(`${DATA_DIR}/PG_VERSION`);
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase(DB_NAME);
console.log(`[db] Postgres running on 127.0.0.1:${PORT} (data: ${DATA_DIR})`);

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB_NAME}`,
};

let child;
let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child && child.exitCode === null) child.kill();
  await pg.stop().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const run = (command) => spawn(command, { stdio: "inherit", shell: true, env });

child = run("npx drizzle-kit migrate");
const migrated = await new Promise((resolve) => child.on("exit", (c) => resolve(c === 0)));
if (!migrated) {
  console.error("[db] migrations failed");
  await shutdown(1);
}

child = run(`npx next dev ${process.argv.slice(2).join(" ")}`);
child.on("exit", (c) => shutdown(c ?? 0));
