# Plan: Compile supabase-slim into a single binary

## Context

Currently `supabase-slim` runs via `bun run src/index.ts` and depends on `node_modules/` at runtime — specifically `embedded-postgres` which ships platform-specific PostgreSQL binaries. `bun build --compile` can't bundle native executables from node_modules (they need to be on the real filesystem to be spawned). The `embedded-postgres` package uses dynamic `import()` for platform detection which the bundler can't resolve.

**Goal:** Single compiled binary that on first run downloads all needed binaries and manages the full stack.

## Approach

Replace `embedded-postgres` with our own Postgres download + process management (same pattern as PostgREST/Auth). All runtime state goes into a home directory (`~/.supabase-slim/` by default, configurable via `SUPABASE_SLIM_HOME`).

## Changes

### 1. Introduce home directory concept

**New: `src/home.ts`**
```ts
export const HOME = process.env.SUPABASE_SLIM_HOME ?? `${os.homedir()}/.supabase-slim`;
export const BIN_DIR = `${HOME}/bin`;
export const DATA_DIR = `${HOME}/data`;
export const SECRETS_FILE = `${HOME}/secrets.json`;
```

**Modify: `src/index.ts`** — replace all `process.cwd()` references with `HOME`
**Modify: `src/binaries/download.ts`** — use `BIN_DIR` from home.ts instead of `${process.cwd()}/bin`
**Modify: `src/binaries/auth.ts`** — use `BIN_DIR`
**Modify: `src/binaries/postgrest.ts`** — use `BIN_DIR` for binary and lib path

### 2. Replace embedded-postgres with Postgres download + management

**New: `src/db/postgres.ts`** — replaces `src/db/embedded.ts`
- Add Postgres to download.ts (source: [zonky embedded-postgres-binaries](https://github.com/zonkyio/embedded-postgres-binaries) on Maven, same source as the npm package)
- Run `initdb` via `Bun.spawnSync` if `data/PG_VERSION` doesn't exist
- Start `postgres` via `Bun.spawn`
- Connect with `pg` npm package (pure JS, bundles fine) for init SQL
- PostgREST gets `LD_LIBRARY_PATH` pointing to `${BIN_DIR}/pg/lib`

**Remove:** `embedded-postgres` from dependencies, delete `src/binaries/libpq.ts`

### 3. Embed static assets

**Modify: `src/config.ts`** — embed config.default.toml inline (it's 12 lines, no need for a file)
**Modify: `src/db/postgres.ts`** — embed init.sql via `import initSql from "./init.sql" with { type: "text" }`

### 4. Add compile script

**Modify: `package.json`** — add `"compile": "bun build --compile src/index.ts --outfile supabase-slim"`

### 5. Remove checked-in auth binary

The darwin binary `bin/auth-darwin-arm64` is no longer needed — auth downloads on all platforms now. Remove it and simplify `.gitignore`.

## Files touched

| File | Action |
|------|--------|
| `src/home.ts` | New — home dir + path constants |
| `src/index.ts` | Modify — use home.ts paths |
| `src/db/postgres.ts` | New — replaces embedded.ts |
| `src/db/embedded.ts` | Delete |
| `src/binaries/download.ts` | Modify — add Postgres download, use BIN_DIR |
| `src/binaries/libpq.ts` | Delete |
| `src/binaries/auth.ts` | Modify — use BIN_DIR |
| `src/binaries/postgrest.ts` | Modify — use BIN_DIR, pg lib path |
| `src/config.ts` | Modify — inline config defaults |
| `package.json` | Modify — remove embedded-postgres, add pg, add compile script |
| `bin/auth-darwin-arm64` | Delete |
| `.gitignore` | Simplify bin/ rules |
| `README.md` | Update setup instructions |

## First-run behavior

```
$ ./supabase-slim
[download] Downloading postgres v18.1.0...     # ~20MB
[download] Downloading postgrest v14.5...       # ~4MB
[download] Downloading auth v2.186.0...         # ~20MB
[pg]       Initialising data dir...
[pg]       Starting on port 54322
[pg]       Init SQL applied
[auth]     Running auth migrations...
...
supabase-slim is ready!
```

Subsequent runs skip downloads (version stamp files in `~/.supabase-slim/bin/`).

## Verification

1. `bun run start` still works (unbundled, for development)
2. `bun run compile` produces `./supabase-slim` binary
3. `./supabase-slim` from an empty dir downloads deps to `~/.supabase-slim/` and boots
4. `bun test` passes (tests need updating to use SUPABASE_SLIM_HOME override)

## Unresolved questions

- Zonky maven binaries vs official PostgreSQL tarballs — zonky is simpler (pre-configured), official is more transparent?
- `pg` npm package adds a dependency — alternatively raw TCP for the 3 init queries?
- Should `SUPABASE_SLIM_HOME` default to `~/.supabase-slim` or current dir? (home dir is more conventional for a compiled binary, cwd is better for dev)
