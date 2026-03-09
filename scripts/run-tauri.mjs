import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function resolvePathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function splitPathEntries(pathValue, separator) {
  return pathValue
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveExecutableName() {
  return process.platform === "win32" ? "cargo.exe" : "cargo";
}

function hasCargoInPath(env) {
  const separator = process.platform === "win32" ? ";" : ":";
  const pathKey = resolvePathKey(env);
  const currentPathValue = env[pathKey] ?? "";
  const executable = resolveExecutableName();
  const entries = splitPathEntries(currentPathValue, separator);
  return entries.some((entry) => existsSync(path.join(entry, executable)));
}

function prependPath(env, newEntry) {
  const separator = process.platform === "win32" ? ";" : ":";
  const pathKey = resolvePathKey(env);
  const currentPathValue = env[pathKey] ?? "";
  const currentEntries = splitPathEntries(currentPathValue, separator);
  const normalized = process.platform === "win32" ? newEntry.toLowerCase() : newEntry;
  const existed = currentEntries.some((entry) => {
    const compareEntry = process.platform === "win32" ? entry.toLowerCase() : entry;
    return compareEntry === normalized;
  });

  if (existed) {
    return;
  }

  env[pathKey] = currentPathValue ? `${newEntry}${separator}${currentPathValue}` : newEntry;
}

function collectCargoBinCandidates() {
  const candidates = [];
  if (process.env.CARGO_HOME) {
    candidates.push(path.join(process.env.CARGO_HOME, "bin"));
  }

  const userHome = os.homedir();
  if (userHome) {
    candidates.push(path.join(userHome, ".cargo", "bin"));
  }

  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin");
    candidates.push("/usr/local/bin");
    candidates.push("/opt/homebrew/opt/rustup/bin");
  }

  if (process.platform === "linux") {
    candidates.push("/usr/local/bin");
    candidates.push("/usr/bin");
  }

  return candidates;
}

function ensureCargoOnPath(env) {
  if (hasCargoInPath(env)) {
    return "<PATH>";
  }

  const executable = resolveExecutableName();
  for (const candidate of collectCargoBinCandidates()) {
    if (existsSync(path.join(candidate, executable))) {
      prependPath(env, candidate);
      return candidate;
    }
  }
  return null;
}

const tauriArgs = process.argv.slice(2);
if (tauriArgs.length === 0) {
  console.error("Usage: node scripts/run-tauri.mjs <tauri-args...>");
  process.exit(1);
}

const env = { ...process.env };
const cargoBin = ensureCargoOnPath(env);
if (!cargoBin) {
  console.error("Cargo not found. Install Rust first: https://www.rust-lang.org/tools/install");
  process.exit(1);
}

const tauriCliPath = path.resolve("node_modules", "@tauri-apps", "cli", "tauri.js");
const child = spawn(process.execPath, [tauriCliPath, ...tauriArgs], {
  stdio: "inherit",
  env,
  shell: false,
});

child.once("error", (error) => {
  console.error(`Failed to start Tauri CLI: ${error.message}`);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Tauri CLI exited by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
