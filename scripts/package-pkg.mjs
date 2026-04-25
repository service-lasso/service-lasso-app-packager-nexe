import path from "node:path";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stageReleaseArtifacts } from "./release-artifact-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = path.join(repoRoot, "dist", ".pkg-stage");
const outputRoot = path.join(repoRoot, "dist", "pkg");

await rm(stagingRoot, { recursive: true, force: true });
await rm(outputRoot, { recursive: true, force: true });
const staged = await stageReleaseArtifacts({
  repoRoot,
  outputRoot: stagingRoot,
  version: process.env.SERVICE_LASSO_RELEASE_VERSION ?? "local-pkg",
});

await mkdir(outputRoot, { recursive: true });
await cp(staged.artifacts.runtime.artifactRoot, outputRoot, { recursive: true, force: true });
await rm(stagingRoot, { recursive: true, force: true });

console.log(`[service-lasso-app-packager-pkg] built runnable pkg layout at ${outputRoot}`);
console.log(`- wrapper: ${path.join(outputRoot, path.basename(staged.artifacts.runtime.pkgExecutablePath))}`);
