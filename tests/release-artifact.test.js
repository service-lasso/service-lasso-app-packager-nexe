import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, stat } from "node:fs/promises";
import {
  createTemporaryOutputRoot,
  stageReleaseArtifacts,
  verifyStagedArtifacts,
} from "../scripts/release-artifact-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("starter release artifacts can be staged and verified", async () => {
  const outputRoot = await createTemporaryOutputRoot();

  try {
    const staged = await stageReleaseArtifacts({
      repoRoot,
      version: "2026.4.23-abcdef1",
      outputRoot,
    });

    assert.equal(staged.baseName, "service-lasso-app-packager-pkg-2026.4.23-abcdef1");
    assert.equal(staged.artifacts.source.manifest.artifactKind, "starter-template-source");
    assert.equal(staged.artifacts.runtime.manifest.artifactKind, "runnable-bootstrap-download");
    assert.equal(staged.artifacts.bundled.manifest.artifactKind, "runnable-bundled");
    assert.match(staged.artifacts.runtime.artifactName, /-runtime-(win32|linux|darwin)$/);
    assert.match(staged.artifacts.bundled.artifactName, /-bundled-(win32|linux|darwin)$/);
    assert.ok(staged.artifacts.runtime.pkgExecutablePath);
    assert.ok(staged.artifacts.bundled.pkgExecutablePath);
    await stat(
      path.join(
        staged.artifacts.bundled.artifactRoot,
        "services",
        "echo-service",
        ".state",
        "artifacts",
        "2026.4.20-a417abd",
        process.platform === "win32"
          ? "echo-service-win32.zip"
          : process.platform === "darwin"
            ? "echo-service-darwin.tar.gz"
            : "echo-service-linux.tar.gz",
      ),
    );

    const verified = await verifyStagedArtifacts({
      repoRoot,
      staged,
    });

    assert.equal(verified.baseName, staged.baseName);
    assert.ok(verified.artifacts.runtime.verification.archiveDownloads >= 1);
    assert.equal(verified.artifacts.bundled.verification.archiveDownloads, 0);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
