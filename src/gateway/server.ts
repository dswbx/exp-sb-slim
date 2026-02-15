import { createLogger } from "../utils/logger.ts";
import type { Config } from "../config.ts";
const log = createLogger("gateway");

export interface Gateway {
  server: ReturnType<typeof Bun.serve>;
  url: string;
  stop: () => void;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, content-profile, accept-profile, range, prefer, x-supabase-api-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range, range, x-supabase-api-version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function startGateway(
  config: Config,
  postgrestUrl: string,
  validKeys: Set<string>,
  authUrl?: string,
): Gateway {
  const server = Bun.serve({
    port: config.api.port,
    hostname: "127.0.0.1",

    async fetch(req) {
      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(req.url);

      // Validate apikey
      const apikey = req.headers.get("apikey");
      if (!apikey || !validKeys.has(apikey)) {
        return withCors(
          new Response(JSON.stringify({ error: "Invalid API key" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // Build upstream URL
      let upstream: string | null = null;
      let path = url.pathname;

      if (path.startsWith("/rest/v1")) {
        path = path.slice("/rest/v1".length) || "/";
        upstream = postgrestUrl;
      } else if (authUrl && path.startsWith("/auth/v1")) {
        path = path.slice("/auth/v1".length) || "/";
        upstream = authUrl;
      }

      if (!upstream) {
        return withCors(
          new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // Proxy the request
      const target = `${upstream}${path}${url.search}`;
      const headers = new Headers(req.headers);
      headers.delete("host");

      try {
        const upstreamRes = await fetch(target, {
          method: req.method,
          headers,
          body: req.body,
        });

        return withCors(
          new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers: upstreamRes.headers,
          }),
        );
      } catch (err) {
        log.error(`Proxy error: ${err}`);
        return withCors(
          new Response(JSON.stringify({ error: "Upstream unavailable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    },
  });

  const gatewayUrl = `http://127.0.0.1:${config.api.port}`;
  log.info(`Listening on ${gatewayUrl}`);

  return {
    server,
    url: gatewayUrl,
    stop: () => server.stop(true),
  };
}
