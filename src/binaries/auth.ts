import { pipeOutput } from "../utils/logger.ts";
import { waitForReady } from "../utils/wait.ts";
import type { Config } from "../config.ts";
import type { Subprocess } from "bun";

export interface AuthProcess {
  proc: Subprocess;
  url: string;
  stop: () => void;
}

export async function startAuth(
  config: Config,
  jwtSecret: string,
  dbConnString: string,
): Promise<AuthProcess> {
  const port = config.auth.port;
  const binPath = `${process.cwd()}/bin/auth`;
  const gatewayUrl = `http://127.0.0.1:${config.api.port}`;

  const proc = Bun.spawn([binPath, "serve"], {
    env: {
      ...process.env,
      DATABASE_URL: dbConnString,
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_JWT_SECRET: jwtSecret,
      GOTRUE_JWT_EXP: "3600",
      GOTRUE_SITE_URL: config.auth.siteUrl,
      API_EXTERNAL_URL: gatewayUrl,
      GOTRUE_API_HOST: "127.0.0.1",
      PORT: String(port),
      GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_PHONE_AUTOCONFIRM: "true",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_EXTERNAL_PHONE_ENABLED: "false",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  pipeOutput(proc, "auth");

  const url = `http://127.0.0.1:${port}`;
  await waitForReady(`${url}/health`, 60_000);

  return {
    proc,
    url,
    stop: () => proc.kill(),
  };
}
