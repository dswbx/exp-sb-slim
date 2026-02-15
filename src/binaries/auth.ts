import { createLogger, pipeOutput } from "../utils/logger.ts";
import { waitForReady } from "../utils/wait.ts";
import type { Config } from "../config.ts";
import type { Subprocess } from "bun";

const log = createLogger("auth");

export interface AuthProcess {
  proc: Subprocess;
  url: string;
  stop: () => void;
}

function authEnv(config: Config, jwtSecret: string, dbConnString: string) {
  return {
    ...process.env,
    DATABASE_URL: dbConnString,
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_JWT_SECRET: jwtSecret,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_SITE_URL: config.auth.siteUrl,
    API_EXTERNAL_URL: `http://127.0.0.1:${config.api.port}`,
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(config.auth.port),
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_PHONE_AUTOCONFIRM: "true",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_EXTERNAL_PHONE_ENABLED: "false",
  };
}

export async function startAuth(
  config: Config,
  jwtSecret: string,
  dbConnString: string,
): Promise<AuthProcess> {
  const binPath = `${process.cwd()}/bin/auth`;
  const env = authEnv(config, jwtSecret, dbConnString);

  // Run migrations before starting the server
  log.info("Running auth migrations...");
  const migrate = Bun.spawnSync([binPath, "migrate"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (migrate.exitCode !== 0) {
    throw new Error(`Auth migration failed: ${migrate.stderr.toString()}`);
  }
  log.info("Auth migrations complete");

  const proc = Bun.spawn([binPath, "serve"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  pipeOutput(proc, "auth", true);

  const url = `http://127.0.0.1:${config.auth.port}`;
  await waitForReady(`${url}/health`, 60_000);

  return {
    proc,
    url,
    stop: () => proc.kill(),
  };
}
