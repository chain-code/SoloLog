import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const tauriConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");

async function main() {
  const tauriConfig = await readJsonFile(tauriConfigPath);
  const productName = toNonEmptyString(tauriConfig.productName, "productName");
  const version = toNonEmptyString(tauriConfig.version, "version");

  await runCommand("npm", ["run", "build"], projectRoot);
  await runCommand(
    process.execPath,
    [path.join(projectRoot, "scripts", "run-tauri.mjs"), "build", "--bundles", "app", "--target", "aarch64-apple-darwin"],
    projectRoot,
  );

  const releaseBundleRoot = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "aarch64-apple-darwin",
    "release",
    "bundle",
  );
  const appPath = path.join(releaseBundleRoot, "macos", `${productName}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`Missing app bundle: ${appPath}`);
  }

  const dmgDir = path.join(releaseBundleRoot, "dmg");
  await fs.mkdir(dmgDir, { recursive: true });
  const dmgPath = path.join(dmgDir, `${productName}_${version}_aarch64.dmg`);

  await runCommand(
    "hdiutil",
    ["create", "-volname", productName, "-srcfolder", appPath, "-ov", "-format", "UDZO", dmgPath],
    projectRoot,
  );

  console.log(`[pack:mac] DMG generated: ${dmgPath}`);
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function toNonEmptyString(value, key) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error(`Invalid ${key} in ${tauriConfigPath}`);
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
      env: process.env,
    });

    child.once("error", (error) => reject(error));
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[pack:mac] ${message}`);
  process.exit(1);
});
