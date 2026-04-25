import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareStarterServicesRoot } from "../src/services-root.js";

test("starter servicesRoot is prepared from tracked service manifests without a generated wrapper", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "service-lasso-app-packager-pkg-services-"));
  const sourceServicesRoot = path.join(root, "services-template");
  const servicesRoot = path.join(root, ".workspace", "services");

  try {
    await mkdir(path.join(sourceServicesRoot, "echo-service"), { recursive: true });
    await mkdir(path.join(sourceServicesRoot, "service-admin"), { recursive: true });
    await writeFile(
      path.join(sourceServicesRoot, "echo-service", "service.json"),
      `${JSON.stringify(
        {
          id: "echo-service",
          name: "Echo Service",
          description: "Harness",
          version: "0.0.0",
          enabled: true,
          artifact: {
            kind: "archive",
            source: {
              type: "github-release",
              repo: "service-lasso/lasso-echoservice",
              tag: "fixture",
            },
            platforms: {
              [process.platform]: {
                assetName: "echo-service.zip",
                assetUrl: "http://127.0.0.1:9999/echo-service.zip",
                archiveType: process.platform === "win32" ? "zip" : "tar.gz",
                command: process.platform === "win32" ? "./echo-service.exe" : "./echo-service",
                args: [],
              },
            },
          },
          healthcheck: {
            type: "process",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(
      path.join(sourceServicesRoot, "service-admin", "service.json"),
      "{\n  \"id\": \"service-admin\",\n  \"enabled\": false\n}\n",
      "utf8",
    );

    const prepared = await prepareStarterServicesRoot({
      sourceServicesRoot,
      servicesRoot,
    });

    assert.equal(prepared.echoServiceRoot, path.join(servicesRoot, "echo-service"));
    assert.equal(prepared.serviceAdminRoot, path.join(servicesRoot, "service-admin"));
    const manifest = JSON.parse(await readFile(path.join(servicesRoot, "echo-service", "service.json"), "utf8"));
    assert.equal(manifest.id, "echo-service");
    assert.equal(manifest.artifact.source.repo, "service-lasso/lasso-echoservice");
    assert.equal(prepared.echoServiceManifestPath, path.join(servicesRoot, "echo-service", "service.json"));
    const adminManifest = JSON.parse(await readFile(path.join(servicesRoot, "service-admin", "service.json"), "utf8"));
    assert.equal(adminManifest.id, "service-admin");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
