import { parse } from "smol-toml";
import { findAvailablePort } from "./ports.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("config");

export interface Config {
  db: { port: number; user: string; password: string };
  api: { port: number; internalPort: number };
  auth: { port: number; siteUrl: string };
}

interface TomlShape {
  db?: { port?: number; user?: string; password?: string };
  api?: { port?: number; internal_port?: number };
  auth?: { port?: number; site_url?: string };
}

export async function loadConfig(configPath?: string): Promise<Config> {
  // load TOML
  const path = configPath ?? `${import.meta.dir}/../config.default.toml`;
  const raw = await Bun.file(path).text();
  const toml = parse(raw) as TomlShape;

  // merge env overrides
  const dbPort = num(process.env.SUPABASE_DB_PORT) ?? toml.db?.port ?? 54322;
  const dbUser = process.env.SUPABASE_DB_USER ?? toml.db?.user ?? "postgres";
  const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? toml.db?.password ?? "postgres";
  const apiPort = num(process.env.SUPABASE_API_PORT) ?? toml.api?.port ?? 54321;
  const apiInternal = num(process.env.SUPABASE_API_INTERNAL_PORT) ?? toml.api?.internal_port ?? 54001;
  const authPort = num(process.env.SUPABASE_AUTH_PORT) ?? toml.auth?.port ?? 54002;
  const siteUrl = process.env.SUPABASE_AUTH_SITE_URL ?? toml.auth?.site_url ?? "http://localhost:3000";

  // resolve available ports
  const resolvedDbPort = await resolve("db", dbPort);
  const resolvedApiPort = await resolve("gateway", apiPort);
  const resolvedInternalPort = await resolve("postgrest", apiInternal);
  const resolvedAuthPort = await resolve("auth", authPort);

  return {
    db: { port: resolvedDbPort, user: dbUser, password: dbPassword },
    api: { port: resolvedApiPort, internalPort: resolvedInternalPort },
    auth: { port: resolvedAuthPort, siteUrl },
  };
}

async function resolve(name: string, preferred: number): Promise<number> {
  const actual = await findAvailablePort(preferred);
  if (actual !== preferred) {
    log.info(`${name} port ${preferred} busy → using ${actual}`);
  }
  return actual;
}

function num(val: string | undefined): number | undefined {
  return val ? Number(val) : undefined;
}
