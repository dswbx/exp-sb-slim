import { loadConfig } from "./config.ts";
import { generateSecret, mintJWT } from "./jwt.ts";
import { startPostgres } from "./db/embedded.ts";
import { downloadAll } from "./binaries/download.ts";
import { startPostgREST } from "./binaries/postgrest.ts";
import { startGateway } from "./gateway/server.ts";
import { createLogger } from "./utils/logger.ts";
import { mkdirSync, existsSync } from "fs";

const log = createLogger("main");
const SECRETS_DIR = `${process.cwd()}/.supabase-slim`;
const SECRETS_FILE = `${SECRETS_DIR}/secrets.json`;

interface Secrets {
   jwtSecret: string;
   anonKey: string;
   serviceRoleKey: string;
}

async function loadOrCreateSecrets(): Promise<Secrets> {
   mkdirSync(SECRETS_DIR, { recursive: true });

   if (existsSync(SECRETS_FILE)) {
      const raw = await Bun.file(SECRETS_FILE).json();
      log.info("Loaded existing JWT secrets");
      return raw as Secrets;
   }

   const jwtSecret = generateSecret();
   const anonKey = await mintJWT(jwtSecret, "anon");
   const serviceRoleKey = await mintJWT(jwtSecret, "service_role");
   const secrets: Secrets = { jwtSecret, anonKey, serviceRoleKey };

   await Bun.write(SECRETS_FILE, JSON.stringify(secrets, null, 2));
   log.info("Generated new JWT secrets");
   return secrets;
}

async function main() {
   log.info("Starting supabase-slim...");

   // 1. Config (resolves available ports)
   const config = await loadConfig();

   // 2. Secrets
   const secrets = await loadOrCreateSecrets();

   // 3. Start Postgres
   const db = await startPostgres(config);
   log.info(`Postgres running on port ${config.db.port}`);

   // 4. Download binaries
   await downloadAll();

   // 5. Start PostgREST
   const postgrest = await startPostgREST(
      config,
      secrets.jwtSecret,
      db.connectionString("authenticator", config.db.password)
   );
   log.info(`PostgREST ready on ${postgrest.url}`);

   // 6. Start Gateway
   const validKeys = new Set([secrets.anonKey, secrets.serviceRoleKey]);
   const gateway = startGateway(config, postgrest.url, validKeys);

   // Print connection info
   console.log("\n" + "=".repeat(60));
   console.log("supabase-slim is ready!");
   console.log("=".repeat(60));
   console.log(`  Gateway:          ${gateway.url}`);
   console.log(
      `  DB:               postgresql://postgres:${config.db.password}@127.0.0.1:${config.db.port}/postgres`
   );
   console.log(`  Anon key:         ${secrets.anonKey}`);
   console.log(`  Service role key: ${secrets.serviceRoleKey}`);
   console.log("=".repeat(60) + "\n");

   // Graceful shutdown
   const shutdown = async () => {
      log.info("Shutting down...");
      gateway.stop();
      postgrest.stop();
      await db.stop();
      log.info("All services stopped");
      process.exit(0);
   };

   process.on("SIGINT", shutdown);
   process.on("SIGTERM", shutdown);
}

main().catch((err) => {
   log.error("Fatal:", err);
   process.exit(1);
});
