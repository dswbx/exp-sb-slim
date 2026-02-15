import { pipeOutput } from "../utils/logger.ts";
import { waitForReady } from "../utils/wait.ts";
import { embeddedPgLibDir } from "./libpq.ts";
import type { Config } from "../config.ts";
import type { Subprocess } from "bun";

export interface PostgRESTProcess {
  proc: Subprocess;
  url: string;
  stop: () => void;
}

export async function startPostgREST(
  config: Config,
  jwtSecret: string,
  dbConnString: string,
): Promise<PostgRESTProcess> {
  const port = config.api.internalPort;
  const binPath = `${process.cwd()}/bin/postgrest`;
  const libDir = embeddedPgLibDir();

  const proc = Bun.spawn([binPath], {
    env: {
      PGRST_DB_URI: dbConnString,
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: jwtSecret,
      PGRST_SERVER_PORT: String(port),
      // Use libpq from embedded-postgres so no system install needed
      DYLD_LIBRARY_PATH: libDir,
      LD_LIBRARY_PATH: libDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  pipeOutput(proc, "postgrest", true);

  const url = `http://127.0.0.1:${port}`;
  await waitForReady(url);

  return {
    proc,
    url,
    stop: () => proc.kill(),
  };
}
