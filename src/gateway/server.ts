import { createLogger } from "../utils/logger.ts";
import type { Config } from "../config.ts";
const log = createLogger("gateway");

export interface Gateway {
  server: ReturnType<typeof Bun.serve>;
  url: string;
  stop: () => void;
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
      const url = new URL(req.url);

      // Validate apikey
      const apikey = req.headers.get("apikey");
      if (!apikey || !validKeys.has(apikey)) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
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
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
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

        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers: upstreamRes.headers,
        });
      } catch (err) {
        log.error(`Proxy error: ${err}`);
        return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
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
