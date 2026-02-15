/** Poll `url` every 500ms until a 200 response or timeout (ms). */
export async function waitForReady(
  url: string,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
}
