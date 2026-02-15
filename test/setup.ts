import { loadConfig, type Config } from "../src/config.ts";
import { generateSecret, mintJWT } from "../src/jwt.ts";
import { startPostgres, type PgInstance } from "../src/db/embedded.ts";
import { downloadAll } from "../src/binaries/download.ts";
import { startPostgREST, type PostgRESTProcess } from "../src/binaries/postgrest.ts";
import { startGateway, type Gateway } from "../src/gateway/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TestStack {
  config: Config;
  db: PgInstance;
  postgrest: PostgRESTProcess;
  gateway: Gateway;
  jwtSecret: string;
  anonKey: string;
  serviceRoleKey: string;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  teardown: () => Promise<void>;
}

let stack: TestStack | null = null;

export async function getStack(): Promise<TestStack> {
  if (stack) return stack;

  // Use test-offset ports
  process.env.SUPABASE_DB_PORT = "55322";
  process.env.SUPABASE_API_PORT = "55321";
  process.env.SUPABASE_API_INTERNAL_PORT = "55001";

  const config = await loadConfig();
  const jwtSecret = generateSecret();
  const anonKey = await mintJWT(jwtSecret, "anon");
  const serviceRoleKey = await mintJWT(jwtSecret, "service_role");

  const db = await startPostgres(config);
  await downloadAll();

  const postgrest = await startPostgREST(
    config,
    jwtSecret,
    db.connectionString("authenticator", config.db.password),
  );

  const validKeys = new Set([anonKey, serviceRoleKey]);
  const gateway = startGateway(config, postgrest.url, validKeys);

  const supabase = createClient(gateway.url, anonKey);
  const supabaseAdmin = createClient(gateway.url, serviceRoleKey);

  const teardown = async () => {
    gateway.stop();
    postgrest.stop();
    await db.stop();
    stack = null;
  };

  stack = {
    config, db, postgrest, gateway,
    jwtSecret, anonKey, serviceRoleKey,
    supabase, supabaseAdmin, teardown,
  };

  return stack;
}
