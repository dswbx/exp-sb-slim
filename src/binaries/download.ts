import { createLogger } from "../utils/logger.ts";
import { mkdirSync, existsSync, chmodSync, copyFileSync } from "fs";

const log = createLogger("download");

const BIN_DIR = `${process.cwd()}/bin`;

interface BinaryDef {
  name: string;
  repo: string;
  /** Map (platform-arch) → asset filename pattern */
  assetName: (version: string) => string;
  /** Path to the extracted binary inside the archive */
  binaryPath?: string;
}

function getPlatformArch(): { platform: string; arch: string } {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { platform, arch };
}

const { platform, arch } = getPlatformArch();

const POSTGREST: BinaryDef = {
  name: "postgrest",
  repo: "PostgREST/postgrest",
  assetName: (v) => {
    if (platform === "darwin") return `postgrest-v${v}-macos-aarch64.tar.xz`;
    return arch === "arm64"
      ? `postgrest-v${v}-ubuntu-aarch64.tar.xz`
      : `postgrest-v${v}-linux-static-x86-64.tar.xz`;
  },
};

const AUTH: BinaryDef = {
  name: "auth",
  repo: "supabase/auth",
  assetName: (v) => {
    const a = arch === "arm64" ? "arm64" : "x86";
    return `auth-v${v}-${a}.tar.gz`;
  },
};

async function getLatestVersion(repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) throw new Error(`Failed to get latest release for ${repo}: ${res.status}`);
  const data = (await res.json()) as { tag_name: string };
  return data.tag_name.replace(/^v/, "");
}

async function downloadBinary(def: BinaryDef): Promise<void> {
  const stampFile = `${BIN_DIR}/.${def.name}-version`;

  // Check if already downloaded
  const binPath = `${BIN_DIR}/${def.name}`;
  if (existsSync(binPath) && existsSync(stampFile)) {
    log.info(`${def.name} already present, skipping`);
    return;
  }

  const version = await getLatestVersion(def.repo);
  const asset = def.assetName(version);
  const url = `https://github.com/${def.repo}/releases/download/v${version}/${asset}`;

  log.info(`Downloading ${def.name} v${version} from ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);

  const tmpFile = `${BIN_DIR}/${asset}`;
  await Bun.write(tmpFile, res);

  // Extract
  log.info(`Extracting ${asset}`);
  if (asset.endsWith(".tar.xz")) {
    const proc = Bun.spawnSync(["tar", "xJf", tmpFile, "-C", BIN_DIR]);
    if (proc.exitCode !== 0) throw new Error(`tar extract failed: ${proc.stderr.toString()}`);
  } else if (asset.endsWith(".tar.gz")) {
    const proc = Bun.spawnSync(["tar", "xzf", tmpFile, "-C", BIN_DIR]);
    if (proc.exitCode !== 0) throw new Error(`tar extract failed: ${proc.stderr.toString()}`);
  }

  // If the binary is nested, find and move it
  if (def.binaryPath) {
    const glob = new Bun.Glob(def.binaryPath);
    for (const match of glob.scanSync(BIN_DIR)) {
      const src = `${BIN_DIR}/${match}`;
      const proc = Bun.spawnSync(["mv", src, binPath]);
      if (proc.exitCode !== 0) throw new Error(`Failed to move ${src} to ${binPath}`);
      break;
    }
  }

  chmodSync(binPath, 0o755);

  // Cleanup archive
  Bun.spawnSync(["rm", "-f", tmpFile]);
  // Clean up extracted dirs
  const glob = new Bun.Glob(`${def.name}-v*`);
  for (const match of glob.scanSync(BIN_DIR)) {
    Bun.spawnSync(["rm", "-rf", `${BIN_DIR}/${match}`]);
  }

  // Stamp version
  await Bun.write(stampFile, version);
  log.info(`${def.name} v${version} ready`);
}

async function ensureAuth(): Promise<void> {
  const binPath = `${BIN_DIR}/auth`;
  if (existsSync(binPath)) {
    log.info("auth already present, skipping");
    return;
  }

  if (platform === "darwin") {
    const src = `${BIN_DIR}/auth-darwin-arm64`;
    if (!existsSync(src)) throw new Error(`Checked-in auth binary not found: ${src}`);
    copyFileSync(src, binPath);
    chmodSync(binPath, 0o755);
    log.info("auth copied from checked-in darwin binary");
  } else {
    await downloadBinary(AUTH);
  }
}

export async function downloadAll(): Promise<void> {
  mkdirSync(BIN_DIR, { recursive: true });
  await downloadBinary(POSTGREST);
  await ensureAuth();
}

// Allow running directly: bun run src/binaries/download.ts
if (import.meta.main) {
  await downloadAll();
}
