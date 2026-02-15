/** Find an available port starting from `preferred`, trying up to 100 consecutive ports. */
export async function findAvailablePort(preferred: number): Promise<number> {
  for (let offset = 0; offset < 100; offset++) {
    const port = preferred + offset;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No available port found in range ${preferred}-${preferred + 99}`);
}

async function isPortFree(port: number): Promise<boolean> {
  // Check both 0.0.0.0 and 127.0.0.1 — services like PostgREST bind 0.0.0.0
  for (const hostname of ["0.0.0.0", "127.0.0.1"] as const) {
    try {
      const server = Bun.listen({
        hostname,
        port,
        socket: { data() {} },
      });
      server.stop(true);
    } catch {
      return false;
    }
  }
  return true;
}
