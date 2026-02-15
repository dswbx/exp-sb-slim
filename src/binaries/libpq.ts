import { existsSync } from "fs";

/** Resolve the lib/ directory from the embedded-postgres platform package. */
export function embeddedPgLibDir(): string {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const pkg = `@embedded-postgres/${platform}-${arch}`;
  const libDir = `${process.cwd()}/node_modules/${pkg}/native/lib`;
  if (!existsSync(libDir)) {
    throw new Error(`embedded-postgres lib dir not found: ${libDir}`);
  }
  return libDir;
}
