import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const SOURCE_RELEASE_PATHS = [
  ".gitignore",
  ".npmrc",
  ".github",
  "README.md",
  "package.json",
  "package-lock.json",
  "src",
  "services",
  "docs",
  "scripts",
  "tests",
];

const RUNTIME_RELEASE_PATHS = [
  ".npmrc",
  "README.md",
  "package.json",
  "package-lock.json",
  "src",
  "services",
  "docs",
];

const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const PKG_VERSION = "5.8.1";

export async function readRootPackageJson(repoRoot) {
  return JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
}

export async function getReleaseVersion(repoRoot) {
  return process.env.SERVICE_LASSO_RELEASE_VERSION ?? (await readRootPackageJson(repoRoot)).version;
}

export async function getArtifactNameBase(repoRoot, version) {
  const packageJson = await readRootPackageJson(repoRoot);
  const packageSuffix = packageJson.name.split("/").at(-1);
  return `${packageSuffix}-${version}`;
}

function getPackageSuffix(packageJson) {
  return packageJson.name.split("/").at(-1);
}

function getArtifactPlatform() {
  return process.platform;
}

export function getPkgExecutableName(packageSuffix = "service-lasso-app-packager-pkg") {
  return process.platform === "win32" ? `${packageSuffix}.exe` : packageSuffix;
}

export function getPkgOutputPath(outputRoot, packageSuffix = "service-lasso-app-packager-pkg") {
  return path.join(outputRoot, getPkgExecutableName(packageSuffix));
}

function getBundledNodeBinaryName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function getPkgTarget() {
  if (process.platform === "win32") {
    return "node18-win-x64";
  }

  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "node18-macos-arm64" : "node18-macos-x64";
  }

  return "node18-linux-x64";
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listExistingPaths(repoRoot, candidates) {
  const existing = [];

  for (const relativePath of candidates) {
    if (await pathExists(path.join(repoRoot, relativePath))) {
      existing.push(relativePath);
    }
  }

  return existing;
}

function escapeWindowsCmdArg(value) {
  if (/^[A-Za-z0-9_./:=@\\-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

async function runNpmCommand(args, options = {}) {
  if (process.platform !== "win32") {
    return runCommand(NPM_COMMAND, args, options);
  }

  const comspec = process.env.ComSpec ?? "cmd.exe";
  const commandLine = [NPM_COMMAND, ...args].map(escapeWindowsCmdArg).join(" ");
  return runCommand(comspec, ["/d", "/s", "/c", commandLine], options);
}

async function copyReleasePath(repoRoot, artifactRoot, relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(artifactRoot, relativePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
}

async function createReleaseArchive(outputRoot, artifactName) {
  const archivePath = path.join(outputRoot, `${artifactName}.tar.gz`);
  await rm(archivePath, { force: true });
  await runCommand("tar", ["-czf", archivePath, "-C", outputRoot, artifactName]);
  return archivePath;
}

async function getLocalCorePackageArchive(repoRoot, stagedRoot) {
  const candidateRoots = [
    process.env.SERVICE_LASSO_CORE_REPO_ROOT,
    path.join(repoRoot, ".service-lasso-core"),
    path.resolve(repoRoot, "..", "service-lasso"),
  ].filter(Boolean);

  for (const coreRepoRoot of candidateRoots) {
    if (!(await pathExists(path.join(coreRepoRoot, "package.json")))) {
      continue;
    }

    const corePackageJson = JSON.parse(await readFile(path.join(coreRepoRoot, "package.json"), "utf8"));
    const version = process.env.SERVICE_LASSO_RELEASE_VERSION ?? corePackageJson.version;
    const isolatedOutputRoot = await mkdtemp(path.join(os.tmpdir(), "service-lasso-core-package-"));
    const artifactRoot = path.join(isolatedOutputRoot, `service-lasso-package-${version}`);
    const archivePath = path.join(artifactRoot, `service-lasso-service-lasso-${version}.tgz`);

    try {
      await runNpmCommand(["run", "package:stage"], {
        cwd: coreRepoRoot,
        env: {
          ...process.env,
          SERVICE_LASSO_RELEASE_VERSION: version,
          SERVICE_LASSO_PACKAGE_OUTPUT_ROOT: isolatedOutputRoot,
        },
      });

      await stat(archivePath);
      const localArchivePath = path.join(stagedRoot, ".service-lasso-core-package", path.basename(archivePath));
      await mkdir(path.dirname(localArchivePath), { recursive: true });
      await cp(archivePath, localArchivePath, { force: true });
      return `./${path.relative(stagedRoot, localArchivePath).split(path.sep).join("/")}`;
    } finally {
      await rm(isolatedOutputRoot, { recursive: true, force: true });
    }
  }

  return null;
}

async function installStarterDependencies(stagedRoot, repoRoot) {
  const localCorePackageArchive = await getLocalCorePackageArchive(repoRoot, stagedRoot);

  if (localCorePackageArchive) {
    await runNpmCommand(["install", localCorePackageArchive], {
      cwd: stagedRoot,
      env: process.env,
    });
    return;
  }

  await runNpmCommand(["install"], {
    cwd: stagedRoot,
    env: process.env,
  });
}

export async function buildPkgWrapper({ workingRoot, launcherPath, outputPath }) {
  const resolvedWorkingRoot = workingRoot ?? path.dirname(outputPath);
  const resolvedLauncherPath = launcherPath ?? path.join(resolvedWorkingRoot, "src", "pkg-launcher.cjs");
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const launcherArg =
    path.dirname(resolvedLauncherPath) === path.join(resolvedWorkingRoot, "src")
      ? path.join("src", path.basename(resolvedLauncherPath))
      : resolvedLauncherPath;
  const outputArg = path.dirname(resolvedOutputPath) === resolvedWorkingRoot ? path.basename(resolvedOutputPath) : resolvedOutputPath;
  await runNpmCommand(
    [
      "exec",
      "--yes",
      `--package=pkg@${PKG_VERSION}`,
      "--",
      "pkg",
      launcherArg,
      "--target",
      getPkgTarget(),
      "--output",
      outputArg,
    ],
    {
      cwd: resolvedWorkingRoot,
      env: process.env,
    },
  );
}

async function writeReleaseManifest({
  repoRoot,
  artifactRoot,
  artifactName,
  version,
  artifactKind,
  shippedFiles,
  notes,
  startCommand = "npm start",
}) {
  const packageJson = await readRootPackageJson(repoRoot);
  const manifest = {
    artifactName,
    version,
    packageName: packageJson.name,
    artifactKind,
    shippedFiles,
    entrypoint: "src/index.js",
    startCommand,
    notes,
  };

  await writeFile(
    path.join(artifactRoot, "release-artifact.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

async function stageSingleArtifact({
  repoRoot,
  outputRoot,
  artifactName,
  version,
  artifactKind,
  relativePaths,
  notes,
  installDependencies = false,
  adminDistRoot = null,
  bundledArchive = null,
  buildPkgExecutable = false,
}) {
  const artifactRoot = path.join(outputRoot, artifactName);
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const relativePath of relativePaths) {
    await copyReleasePath(repoRoot, artifactRoot, relativePath);
  }

  if (installDependencies) {
    await installStarterDependencies(artifactRoot, repoRoot);
  }

  if (adminDistRoot) {
    const payloadAdminRoot = path.join(artifactRoot, ".payload", "admin");
    await mkdir(path.dirname(payloadAdminRoot), { recursive: true });
    await cp(adminDistRoot, payloadAdminRoot, { recursive: true });
  }

  if (bundledArchive) {
    const { releaseTag, assetName, archivePath } = bundledArchive;
    const targetPath = path.join(
      artifactRoot,
      "services",
      "echo-service",
      ".state",
      "artifacts",
      releaseTag,
      assetName,
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(archivePath, targetPath, { force: true });
  }

  const packageJson = await readRootPackageJson(repoRoot);
  const packageSuffix = getPackageSuffix(packageJson);
  let pkgExecutableRelativePath = null;

  if (buildPkgExecutable) {
    pkgExecutableRelativePath = getPkgExecutableName(packageSuffix);
    const bundledNodePath = path.join(artifactRoot, "node-runtime", getBundledNodeBinaryName());
    await mkdir(path.dirname(bundledNodePath), { recursive: true });
    await cp(process.execPath, bundledNodePath, { force: true });
    await buildPkgWrapper({
      workingRoot: artifactRoot,
      launcherPath: path.join(artifactRoot, "src", "pkg-launcher.cjs"),
      outputPath: path.join(artifactRoot, pkgExecutableRelativePath),
    });
  }

  const manifest = await writeReleaseManifest({
    repoRoot,
    artifactRoot,
    artifactName,
    version,
    artifactKind,
    shippedFiles: [
      ...relativePaths,
      ...(installDependencies ? ["node_modules"] : []),
      ...(adminDistRoot ? [".payload"] : []),
      ...(buildPkgExecutable ? ["node-runtime"] : []),
      ...(bundledArchive ? [`services/echo-service/.state/artifacts/${bundledArchive.releaseTag}/${bundledArchive.assetName}`] : []),
      ...(pkgExecutableRelativePath ? [pkgExecutableRelativePath] : []),
      "release-artifact.json",
    ],
    startCommand: pkgExecutableRelativePath ? `./${pkgExecutableRelativePath}` : "npm start",
    notes,
  });
  const archivePath = await createReleaseArchive(outputRoot, artifactName);

  return {
    artifactName,
    artifactRoot,
    archivePath,
    manifest,
    pkgExecutablePath: pkgExecutableRelativePath ? path.join(artifactRoot, pkgExecutableRelativePath) : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve loopback port")));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(String(port));
      });
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }

      lastError = new Error(`unexpected status ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw lastError ?? new Error(`timed out waiting for ${url}`);
}

async function postJson(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  });

  let body = null;
  try {
    body = await response.json();
  } catch {}

  return {
    status: response.status,
    body,
  };
}

async function createVerificationAdminDist(rootDir) {
  const adminDistRoot = path.join(rootDir, "lasso-@serviceadmin", "dist");
  await mkdir(adminDistRoot, { recursive: true });
  await writeFile(path.join(adminDistRoot, "index.html"), "<!doctype html><title>serviceadmin</title>", "utf8");
  await writeFile(path.join(adminDistRoot, "asset.js"), "console.log('serviceadmin asset');", "utf8");
  return adminDistRoot;
}

async function resolveReleaseAdminDist(repoRoot, outputRoot, sourceAdminDistRoot) {
  const candidates = [
    sourceAdminDistRoot,
    process.env.SERVICE_LASSO_APP_PACKAGER_PKG_ADMIN_DIST_ROOT,
    path.resolve(repoRoot, "..", "lasso-@serviceadmin", "dist"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return createVerificationAdminDist(outputRoot);
}

async function createVerificationReleaseFixture(rootDir, assetNameOverride = null) {
  const fixtureRoot = path.join(rootDir, ".verify-fixture");
  const workRoot = path.join(fixtureRoot, "work");
  const archiveRoot = path.join(fixtureRoot, "archives");
  await mkdir(workRoot, { recursive: true });
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(path.join(workRoot, "README.md"), "fixture\n", "utf8");

  let assetName;
  let archiveType;
  if (process.platform === "win32") {
    assetName = assetNameOverride ?? "echo-service-win32.zip";
    archiveType = "zip";
    const powershell =
      process.env.SystemRoot
        ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        : "powershell.exe";
    await runCommand(powershell, [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${path.join(workRoot, "*").replace(/'/g, "''")}' -DestinationPath '${path.join(archiveRoot, assetName).replace(/'/g, "''")}' -Force`,
    ]);
  } else {
    assetName =
      assetNameOverride ??
      (process.platform === "darwin" ? "echo-service-darwin.tar.gz" : "echo-service-linux.tar.gz");
    archiveType = "tar.gz";
    await runCommand("tar", ["-czf", path.join(archiveRoot, assetName), "-C", workRoot, "."]);
  }

  const archivePath = path.join(archiveRoot, assetName);
  return {
    fixtureRoot,
    releaseTag: "fixture",
    assetName,
    archiveType,
    archivePath,
  };
}

async function acquireBundledServiceArchive(outputRoot, manifest, platform) {
  const releaseTag = manifest.artifact?.source?.tag;
  const platformArtifact = manifest.artifact?.platforms?.[platform] ?? manifest.artifact?.platforms?.default;
  const assetName = platformArtifact?.assetName;
  const assetUrl = platformArtifact?.assetUrl;

  if (!releaseTag || !assetName || !assetUrl) {
    throw new Error(
      `Cannot build bundled artifact for ${manifest.id}: service.json must define artifact.source.tag, assetName, and assetUrl.`,
    );
  }

  const archivePath = path.join(outputRoot, ".bundled-downloads", manifest.id, releaseTag, assetName);
  await mkdir(path.dirname(archivePath), { recursive: true });

  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Failed to acquire bundled archive ${assetUrl}: HTTP ${response.status}`);
  }

  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  return {
    releaseTag,
    assetName,
    archivePath,
  };
}

async function startArchiveServer(fixture) {
  let requestCount = 0;
  const server = createServer(async (request, response) => {
    if (request.url !== `/${fixture.assetName}`) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    requestCount += 1;
    const bytes = await readFile(fixture.archivePath);
    response.statusCode = 200;
    response.setHeader("content-type", "application/octet-stream");
    response.end(bytes);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start archive fixture server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/${fixture.assetName}`,
    getRequestCount() {
      return requestCount;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function createVerificationSourceServicesRoot(stagedRoot, archiveServer, fixture) {
  const sourceServicesRoot = path.join(stagedRoot, ".verify-source-services");
  await rm(sourceServicesRoot, { recursive: true, force: true });
  await cp(path.join(stagedRoot, "services"), sourceServicesRoot, { recursive: true });

  const manifestPath = path.join(sourceServicesRoot, "echo-service", "service.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "fixture";
  manifest.artifact = {
    kind: "archive",
    source: {
      type: "github-release",
      repo: "service-lasso/lasso-echoservice",
      tag: "fixture",
    },
    platforms: {
      [process.platform]: {
        assetName: fixture.assetName,
        assetUrl: archiveServer.url,
        archiveType: fixture.archiveType,
        command: process.platform === "win32" ? "./echo-service.exe" : "./echo-service",
        args: [],
      },
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return sourceServicesRoot;
}

async function smokeHost({ command, args, cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let shutdownExpected = false;
    const closePromise = new Promise((innerResolve) => {
      child.once("close", (code, signal) => {
        innerResolve({ code, signal });
      });
    });

    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      if (settled || shutdownExpected) {
        return;
      }

      finish(() =>
        reject(
          new Error(`${command} ${args.join(" ")} exited early with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`),
        ),
      );
    });

    void (async () => {
      try {
        const hostStatus = await waitForJson(`http://127.0.0.1:${env.SERVICE_LASSO_APP_PACKAGER_PKG_HOST_PORT}/api/host-status`);
        const runtimeHealth = await waitForJson(`http://127.0.0.1:${env.SERVICE_LASSO_API_PORT}/api/health`);

        finish(() =>
          resolve({
            child,
            closePromise,
            stdout,
            stderr,
            hostStatus,
            runtimeHealth,
          }),
        );
      } catch (error) {
        shutdownExpected = true;
        child.kill("SIGTERM");
        finish(() => reject(error));
      }
    })();
  });
}

async function shutdownSmokedHost(smoke, signal = "SIGINT") {
  if (process.platform === "win32" && smoke.child.pid) {
    try {
      await runCommand("taskkill", ["/pid", String(smoke.child.pid), "/t", "/f"]);
    } catch {
      smoke.child.kill(signal);
    }
  } else {
    smoke.child.kill(signal);
  }

  const result = await Promise.race([
    smoke.closePromise,
    sleep(10000).then(() => {
      throw new Error("Timed out waiting for smoke-test host process to exit.");
    }),
  ]);

  if (process.platform === "win32") {
    // Windows can release executable file handles just after process close.
    await sleep(500);
  }

  return result;
}

async function verifySourceArtifact({ repoRoot, artifactRoot, archivePath }) {
  await stat(archivePath);
  await stat(path.join(artifactRoot, "release-artifact.json"));

  const adminDistRoot = await createVerificationAdminDist(path.resolve(artifactRoot, ".."));
  await installStarterDependencies(artifactRoot, repoRoot);
  const hostPort = await reserveLoopbackPort();
  const runtimePort = await reserveLoopbackPort();
  const smoke = await smokeHost({
    command: process.execPath,
    args: [path.join(artifactRoot, "src", "index.js")],
    cwd: artifactRoot,
    env: {
      ...process.env,
      SERVICE_LASSO_APP_PACKAGER_PKG_HOST_PORT: hostPort,
      SERVICE_LASSO_API_PORT: runtimePort,
      SERVICE_LASSO_APP_PACKAGER_PKG_ADMIN_DIST_ROOT: adminDistRoot,
      SERVICE_LASSO_WORKSPACE_ROOT: path.join(artifactRoot, ".workspace", "runtime"),
    },
  });

  try {
    return {
      smoke: smoke.stdout,
      hostStatus: smoke.hostStatus,
      runtimeHealth: smoke.runtimeHealth,
    };
  } finally {
    await shutdownSmokedHost(smoke, "SIGINT");
  }
}

async function verifyRuntimeArtifact({ artifactRoot, archivePath }) {
  await stat(archivePath);
  await stat(path.join(artifactRoot, "release-artifact.json"));
  await stat(path.join(artifactRoot, "node_modules"));
  await stat(path.join(artifactRoot, ".payload", "admin", "index.html"));
  const artifactPackage = JSON.parse(await readFile(path.join(artifactRoot, "package.json"), "utf8"));
  const pkgExecutablePath = getPkgOutputPath(artifactRoot, getPackageSuffix(artifactPackage));
  await stat(pkgExecutablePath);

  const fixture = await createVerificationReleaseFixture(artifactRoot);
  const archiveServer = await startArchiveServer(fixture);
  const sourceServicesRoot = await createVerificationSourceServicesRoot(artifactRoot, archiveServer, fixture);
  const hostPort = await reserveLoopbackPort();
  const runtimePort = await reserveLoopbackPort();
  const smoke = await smokeHost({
    command: pkgExecutablePath,
    args: [],
    cwd: artifactRoot,
    env: {
      ...process.env,
      SERVICE_LASSO_APP_PACKAGER_PKG_HOST_PORT: hostPort,
      SERVICE_LASSO_API_PORT: runtimePort,
      SERVICE_LASSO_APP_PACKAGER_PKG_SOURCE_SERVICES_ROOT: sourceServicesRoot,
      SERVICE_LASSO_WORKSPACE_ROOT: path.join(artifactRoot, ".workspace", "runtime"),
    },
  });

  try {
    const runtimeUrl = `http://127.0.0.1:${runtimePort}`;
    const install = await postJson(`${runtimeUrl}/api/services/echo-service/install`);

    if (install.status !== 200) {
      throw new Error(`Install action failed: ${JSON.stringify(install, null, 2)}`);
    }

    if (archiveServer.getRequestCount() < 1) {
      throw new Error("Bootstrap-download runtime artifact did not fetch the service archive during install.");
    }

    const serviceDetail = await waitForJson(`${runtimeUrl}/api/services/echo-service`);
    return {
      hostStatus: smoke.hostStatus,
      runtimeHealth: smoke.runtimeHealth,
      archiveDownloads: archiveServer.getRequestCount(),
      installStatus: install.status,
      lifecycleState: serviceDetail.lifecycleState ?? null,
      wrapper: path.basename(pkgExecutablePath),
    };
  } finally {
    await shutdownSmokedHost(smoke, "SIGINT");
    await archiveServer.close();
    await rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

async function verifyBundledArtifact({ artifactRoot, archivePath }) {
  await stat(archivePath);
  await stat(path.join(artifactRoot, "release-artifact.json"));
  await stat(path.join(artifactRoot, "node_modules"));
  await stat(path.join(artifactRoot, ".payload", "admin", "index.html"));
  const artifactPackage = JSON.parse(await readFile(path.join(artifactRoot, "package.json"), "utf8"));
  const pkgExecutablePath = getPkgOutputPath(artifactRoot, getPackageSuffix(artifactPackage));
  await stat(pkgExecutablePath);

  const fixture = await createVerificationReleaseFixture(artifactRoot);
  const archiveServer = await startArchiveServer(fixture);
  const bundledArchivePath = path.join(
    artifactRoot,
    "services",
    "echo-service",
    ".state",
    "artifacts",
    "fixture",
    fixture.assetName,
  );
  await mkdir(path.dirname(bundledArchivePath), { recursive: true });
  await cp(fixture.archivePath, bundledArchivePath, { force: true });
  const sourceServicesRoot = await createVerificationSourceServicesRoot(artifactRoot, archiveServer, fixture);

  const hostPort = await reserveLoopbackPort();
  const runtimePort = await reserveLoopbackPort();
  const smoke = await smokeHost({
    command: pkgExecutablePath,
    args: [],
    cwd: artifactRoot,
    env: {
      ...process.env,
      SERVICE_LASSO_APP_PACKAGER_PKG_HOST_PORT: hostPort,
      SERVICE_LASSO_API_PORT: runtimePort,
      SERVICE_LASSO_APP_PACKAGER_PKG_SOURCE_SERVICES_ROOT: sourceServicesRoot,
      SERVICE_LASSO_WORKSPACE_ROOT: path.join(artifactRoot, ".workspace", "runtime"),
    },
  });

  try {
    const runtimeUrl = `http://127.0.0.1:${runtimePort}`;
    const install = await postJson(`${runtimeUrl}/api/services/echo-service/install`);

    if (install.status !== 200) {
      throw new Error(`Install action failed: ${JSON.stringify(install, null, 2)}`);
    }

    if (archiveServer.getRequestCount() !== 0) {
      throw new Error("Bundled runtime artifact should not fetch the service archive during install.");
    }

    const serviceDetail = await waitForJson(`${runtimeUrl}/api/services/echo-service`);
    return {
      hostStatus: smoke.hostStatus,
      runtimeHealth: smoke.runtimeHealth,
      archiveDownloads: archiveServer.getRequestCount(),
      installStatus: install.status,
      lifecycleState: serviceDetail.lifecycleState ?? null,
      wrapper: path.basename(pkgExecutablePath),
    };
  } finally {
    await shutdownSmokedHost(smoke, "SIGINT");
    await archiveServer.close();
    await rm(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

export async function stageReleaseArtifacts({ repoRoot, outputRoot = path.join(repoRoot, "artifacts"), version, sourceAdminDistRoot } = {}) {
  const resolvedVersion = version ?? (await getReleaseVersion(repoRoot));
  const baseName = await getArtifactNameBase(repoRoot, resolvedVersion);
  const platform = getArtifactPlatform();
  const sourceFiles = await listExistingPaths(repoRoot, SOURCE_RELEASE_PATHS);
  const runtimeFiles = await listExistingPaths(repoRoot, RUNTIME_RELEASE_PATHS);
  const resolvedAdminDistRoot = await resolveReleaseAdminDist(repoRoot, outputRoot, sourceAdminDistRoot);

  const source = await stageSingleArtifact({
    repoRoot,
    outputRoot,
    artifactName: `${baseName}-source`,
    version: resolvedVersion,
    artifactKind: "starter-template-source",
    relativePaths: sourceFiles,
    notes: [
      "This artifact is the source template for the app-packager-pkg starter.",
      "It keeps the tracked services/ inventory but does not include installed dependencies or bundled runtime payloads.",
    ],
  });

  const runtime = await stageSingleArtifact({
    repoRoot,
    outputRoot,
    artifactName: `${baseName}-runtime-${platform}`,
    version: resolvedVersion,
    artifactKind: "runnable-bootstrap-download",
    relativePaths: runtimeFiles,
    notes: [
      "This artifact is ready to run with installed dependencies, bundled Service Admin assets, and a pkg launcher executable.",
      "It keeps the canonical services/ inventory and installs the Echo Service archive from manifest-owned metadata before use.",
    ],
    installDependencies: true,
    adminDistRoot: resolvedAdminDistRoot,
    buildPkgExecutable: true,
  });

  const echoManifest = JSON.parse(await readFile(path.join(repoRoot, "services", "echo-service", "service.json"), "utf8"));
  const bundledArchive = await acquireBundledServiceArchive(outputRoot, echoManifest, process.platform);
  const bundled = await stageSingleArtifact({
    repoRoot,
    outputRoot,
    artifactName: `${baseName}-bundled-${platform}`,
    version: resolvedVersion,
    artifactKind: "runnable-bundled",
    relativePaths: runtimeFiles,
    notes: [
      "This artifact is ready to run with installed dependencies, bundled Service Admin assets, a pkg launcher executable, and an acquired Echo Service archive in services/.",
      "It keeps the canonical services/ inventory and proves no first-run service download is required.",
    ],
    installDependencies: true,
    adminDistRoot: resolvedAdminDistRoot,
    bundledArchive,
    buildPkgExecutable: true,
  });

  return {
    version: resolvedVersion,
    baseName,
    artifacts: {
      source,
      runtime,
      bundled,
    },
  };
}

export async function verifyStagedArtifacts({ repoRoot, staged } = {}) {
  const release = staged ?? (await stageReleaseArtifacts({ repoRoot }));
  const sourceVerified = await verifySourceArtifact({
    repoRoot,
    artifactRoot: release.artifacts.source.artifactRoot,
    archivePath: release.artifacts.source.archivePath,
  });
  const runtimeVerified = await verifyRuntimeArtifact({
    artifactRoot: release.artifacts.runtime.artifactRoot,
    archivePath: release.artifacts.runtime.archivePath,
  });
  const bundledVerified = await verifyBundledArtifact({
    artifactRoot: release.artifacts.bundled.artifactRoot,
    archivePath: release.artifacts.bundled.archivePath,
  });

  return {
    baseName: release.baseName,
    artifacts: {
      source: {
        ...release.artifacts.source,
        verification: sourceVerified,
      },
      runtime: {
        ...release.artifacts.runtime,
        verification: runtimeVerified,
      },
      bundled: {
        ...release.artifacts.bundled,
        verification: bundledVerified,
      },
    },
  };
}

export async function createTemporaryOutputRoot(prefix = "service-lasso-app-packager-pkg-release-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}
