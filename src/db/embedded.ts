import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "fs";
import { createLogger } from "../utils/logger.ts";
import type { Config } from "../config.ts";

const log = createLogger("pg");

export interface PgInstance {
  pg: InstanceType<typeof EmbeddedPostgres>;
  connectionString: (user?: string, password?: string, db?: string) => string;
  stop: () => Promise<void>;
}

export async function startPostgres(config: Config): Promise<PgInstance> {
  const { port, user, password } = config.db;
  const dataDir = `${process.cwd()}/data/db`;

  const pg = new EmbeddedPostgres({
    port,
    user,
    password,
    databaseDir: dataDir,
    persistent: true,
    onLog: (msg: string) => log.info(msg),
    onError: (err: unknown) => log.error(err),
  });

  const alreadyInitialised = existsSync(`${dataDir}/PG_VERSION`);

  if (!alreadyInitialised) {
    log.info(`Initialising data dir: ${dataDir}`);
    await pg.initialise();
  } else {
    log.info("Data dir already exists, skipping init");
  }

  log.info(`Starting on port ${port}`);
  await pg.start();

  // Run init SQL (idempotent — uses IF NOT EXISTS)
  const initSql = await Bun.file(`${import.meta.dir}/init.sql`).text();
  const client = pg.getPgClient();
  await client.connect();
  await client.query(initSql);

  // Set passwords for login roles
  await client.query(`ALTER ROLE authenticator PASSWORD '${password}'`);
  await client.query(`ALTER ROLE supabase_auth_admin PASSWORD '${password}'`);

  await client.end();
  log.info("Init SQL applied");

  const connectionString = (
    u = user,
    p = password,
    db = "postgres",
  ) => `postgresql://${u}:${p}@127.0.0.1:${port}/${db}`;

  return {
    pg,
    connectionString,
    stop: () => pg.stop(),
  };
}
