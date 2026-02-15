import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const secretsPath = resolve(root, ".supabase-slim/secrets.json");

// 1. Read secrets → write .env.local
console.log("Reading secrets from", secretsPath);
const secrets = JSON.parse(readFileSync(secretsPath, "utf-8"));

const envContent = [
   `VITE_SUPABASE_URL=http://127.0.0.1:54321`,
   `VITE_SUPABASE_ANON_KEY=${secrets.anonKey}`,
].join("\n");

const envPath = resolve(import.meta.dirname, ".env.local");
writeFileSync(envPath, envContent + "\n");
console.log("Wrote", envPath);

// 2. Run todos migration via PostgREST RPC (or direct pg)
const sqlPath = resolve(root, "web/seed.sql");
const sql = readFileSync(sqlPath, "utf-8");

console.log("Running seed migration...");
const res = await fetch("http://127.0.0.1:54321/rest/v1/rpc/", {
   method: "POST",
   headers: {
      apikey: secrets.serviceRoleKey,
      Authorization: `Bearer ${secrets.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
   },
   body: JSON.stringify({}),
}).catch(() => null);

// Fallback: use psql directly
const proc = Bun.spawn(
   ["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-f", sqlPath],
   {
      env: { ...process.env, PGPASSWORD: "postgres" },
      stdout: "inherit",
      stderr: "inherit",
   }
);
const exitCode = await proc.exited;
if (exitCode !== 0) {
   console.error("Migration failed with exit code", exitCode);
   process.exit(1);
}
console.log("Migration complete!");
