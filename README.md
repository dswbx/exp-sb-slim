# supabase-slim

Minimal, single-command Supabase stack for local development. Runs embedded Postgres, PostgREST, GoTrue Auth, and an API gateway — no Docker required.

## What's in the box

| Service | Description |
|---------|-------------|
| **Postgres** | Embedded via `embedded-postgres` (persistent data in `data/db/`) |
| **PostgREST** | Auto-downloaded binary, exposes REST API over Postgres |
| **Auth (GoTrue)** | Signup/signin/JWT — built from source for macOS arm64, checked into `bin/` |
| **Gateway** | Bun HTTP server proxying `/rest/v1/*` → PostgREST, `/auth/v1/*` → Auth |

All services boot from a single `bun run start` and shut down together on Ctrl+C.

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- macOS arm64 (auth binary is pre-built for this platform)
- For Linux: auth binary downloads automatically from GitHub releases

## Getting started

```sh
bun install
bun run start
```

On first run this will:
1. Init a Postgres data directory
2. Download PostgREST
3. Copy the checked-in auth binary (macOS) or download it (Linux)
4. Run auth schema migrations
5. Generate JWT secrets (stored in `.supabase-slim/secrets.json`)

Output shows connection info:

```
============================================================
supabase-slim is ready!
============================================================
  Gateway:          http://127.0.0.1:54321
  DB:               postgresql://postgres:postgres@127.0.0.1:54322/postgres
  Anon key:         eyJ...
  Service role key: eyJ...
============================================================
```

## Verify it works

```sh
# Auth settings (should return 200 with provider config)
curl http://localhost:54321/auth/v1/settings -H "apikey: <anon-key>"

# Signup
curl -X POST http://localhost:54321/auth/v1/signup \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'

# Signin
curl -X POST 'http://localhost:54321/auth/v1/token?grant_type=password' \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'

# PostgREST
curl http://localhost:54321/rest/v1/ -H "apikey: <anon-key>"
```

Or with supabase-js:

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient("http://127.0.0.1:54321", "<anon-key>");
const { data } = await supabase.auth.signUp({
  email: "user@example.com",
  password: "password123",
});
```

## Tests

```sh
bun test
```

Tests spin up an isolated stack on offset ports (55xxx) and cover:
- Service health checks (Postgres, PostgREST, Auth, Gateway)
- Auth signup + signin via supabase-js
- CRUD operations through the REST API
- Row Level Security enforcement

## Config

Defaults in `config.default.toml`, overridable via env vars:

| Env var | Default | Description |
|---------|---------|-------------|
| `SUPABASE_DB_PORT` | 54322 | Postgres port |
| `SUPABASE_DB_PASSWORD` | postgres | Postgres password |
| `SUPABASE_API_PORT` | 54321 | Gateway port |
| `SUPABASE_AUTH_PORT` | 54002 | Auth service port |
| `SUPABASE_AUTH_SITE_URL` | http://localhost:3000 | Redirect URL for auth flows |

## Architecture

```
Client
  │
  ▼
Gateway (:54321)  ── apikey validation
  ├── /rest/v1/*  →  PostgREST (:54001)  →  Postgres (:54322)
  └── /auth/v1/*  →  Auth/GoTrue (:54002) →  Postgres (:54322)
```

## Building the auth binary from source

The checked-in `bin/auth-darwin-arm64` is built from [supabase/auth](https://github.com/supabase/auth). To rebuild:

```sh
# Requires Go 1.25+
git clone --depth 1 https://github.com/supabase/auth.git /tmp/supabase-auth
cd /tmp/supabase-auth && make build
cp auth ../path/to/supabase-slim/bin/auth-darwin-arm64
```
