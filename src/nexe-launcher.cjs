#!/usr/bin/env node

const path = require("path");
const { access } = require("fs").promises;
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

function isNodeRuntimeExecutable() {
  const executableName = path.basename(process.execPath).toLowerCase();
  return executableName === "node" || executableName === "node.exe";
}

async function main() {
  const executableRoot = isNodeRuntimeExecutable() ? path.resolve(__dirname, "..") : path.dirname(process.execPath);
  const runtimeRoot = process.env.SERVICE_LASSO_APP_PACKAGER_NEXE_PAYLOAD_ROOT ?? executableRoot;
  const entrypoint = path.join(runtimeRoot, "src", "index.js");

  await access(entrypoint);

  if (isNodeRuntimeExecutable()) {
    process.chdir(runtimeRoot);
    await import(pathToFileURL(entrypoint).href);
    return;
  }

  const bundledNodeBinary =
    process.env.SERVICE_LASSO_APP_PACKAGER_NEXE_NODE_BIN ??
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
  console.error("[app-packager-nexe] nexe launcher failed");
  console.error(error?.stack ?? error);
  process.exit(1);
});
