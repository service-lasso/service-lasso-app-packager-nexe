#!/usr/bin/env node

const path = require("node:path");
const { existsSync } = require("node:fs");
const { access } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

async function main() {
  const executableRoot = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, "..");
  const runtimeRoot = process.env.SERVICE_LASSO_APP_PACKAGER_PKG_PAYLOAD_ROOT ?? executableRoot;
  const entrypoint = path.join(runtimeRoot, "src", "index.js");

  await access(entrypoint);

  if (!process.pkg) {
    process.chdir(runtimeRoot);
    await import(pathToFileURL(entrypoint).href);
    return;
  }

  const bundledNodeBinary =
    process.env.SERVICE_LASSO_APP_PACKAGER_PKG_NODE_BIN ??
    path.join(executableRoot, "node-runtime", process.platform === "win32" ? "node.exe" : "node");

  await access(bundledNodeBinary);

  const child = spawn(bundledNodeBinary, [entrypoint, ...process.argv.slice(2)], {
    cwd: runtimeRoot,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`bundled node exited with code ${code}`));
        return;
      }

      resolve();
    });
  });
}

main().catch((error) => {
  console.error("[app-packager-pkg] pkg launcher failed");
  console.error(error?.stack ?? error);
  process.exit(1);
});
