export function createLogger(prefix: string) {
  const tag = `[${prefix}]`;
  return {
    info: (...args: unknown[]) => console.log(tag, ...args),
    error: (...args: unknown[]) => console.error(tag, ...args),
  };
}

/** Pipe a child process's stdout/stderr through a prefixed logger. */
export function pipeOutput(
  proc: { stdout: ReadableStream<Uint8Array> | null; stderr: ReadableStream<Uint8Array> | null },
  prefix: string,
  /** Treat stderr as info (e.g. PostgREST logs to stderr by default) */
  stderrAsInfo = false,
) {
  const log = createLogger(prefix);

  async function drain(stream: ReadableStream<Uint8Array>, fn: (...args: unknown[]) => void) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (line) fn(line);
      }
    }
  }

  if (proc.stdout) drain(proc.stdout, log.info);
  if (proc.stderr) drain(proc.stderr, stderrAsInfo ? log.info : log.error);
}
