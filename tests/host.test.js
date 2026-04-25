import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { resolveAppPackagerPkgConfig, validateAppPackagerPkgConfig } from "../src/config.js";
import { createHostServer, createHostStatus } from "../src/server.js";

async function createFixtureRoots() {
  const root = await mkdtemp(path.join(tmpdir(), "service-lasso-app-packager-pkg-"));
  const siblingRoot = path.join(root, "siblings");
  const adminDistRoot = path.join(siblingRoot, "lasso-@serviceadmin", "dist");
  const sourceServicesRoot = path.join(root, "service-lasso-app-packager-pkg", "services");

  await mkdir(adminDistRoot, { recursive: true });
  await mkdir(path.join(sourceServicesRoot, "echo-service"), { recursive: true });
  await mkdir(path.join(sourceServicesRoot, "service-admin"), { recursive: true });
  await writeFile(path.join(adminDistRoot, "index.html"), "<!doctype html><title>admin</title>", "utf8");
  await writeFile(path.join(adminDistRoot, "asset.js"), "console.log('admin asset');", "utf8");
  await writeFile(
    path.join(sourceServicesRoot, "echo-service", "service.json"),
    JSON.stringify(
      {
        id: "echo-service",
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
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(path.join(sourceServicesRoot, "service-admin", "service.json"), "{\n  \"id\": \"service-admin\"\n}\n", "utf8");

  return {
    root,
    siblingRoot,
    adminDistRoot,
    sourceServicesRoot,
  };
}

test("app-packager-pkg config resolves deterministic sibling repo paths", async () => {
  const fixture = await createFixtureRoots();

  try {
    const config = resolveAppPackagerPkgConfig({
      repoRoot: path.join(fixture.root, "service-lasso-app-packager-pkg"),
      siblingRoot: fixture.siblingRoot,
      hostPort: 19030,
      runtimePort: 18083,
    });

    assert.equal(config.hostUrl, "http://127.0.0.1:19030");
    assert.equal(config.runtimeUrl, "http://127.0.0.1:18083");
    assert.equal(config.adminDistRoot, fixture.adminDistRoot);
    assert.equal(config.sourceServicesRoot, fixture.sourceServicesRoot);

    await assert.doesNotReject(() => validateAppPackagerPkgConfig(config));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("host server serves shell, host status, and mounted admin assets", async () => {
  const fixture = await createFixtureRoots();

  try {
    const config = await validateAppPackagerPkgConfig(
      resolveAppPackagerPkgConfig({
        repoRoot: path.join(fixture.root, "service-lasso-app-packager-pkg"),
        siblingRoot: fixture.siblingRoot,
        hostPort: 0,
        runtimePort: 18083,
      }),
    );
    const status = createHostStatus(config);
    assert.equal(status.app, "@service-lasso/service-lasso-app-packager-pkg");
    assert.equal(status.sourceServicesRoot, fixture.sourceServicesRoot);
    assert.equal(status.artifactMode, "bootstrap-download");
    assert.equal(status.packagingTarget, "pkg");

    const server = createHostServer(config);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const shellResponse = await fetch(`${baseUrl}/`);
      assert.equal(shellResponse.status, 200);
      const shellHtml = await shellResponse.text();
      assert.match(shellHtml, /pkg-packaged Node host for Service Lasso/);
      assert.match(shellHtml, /Open Service Admin/);

      const statusResponse = await fetch(`${baseUrl}/api/host-status`);
      assert.equal(statusResponse.status, 200);
      const statusBody = await statusResponse.json();
      assert.equal(statusBody.runtimeUrl, config.runtimeUrl);
      assert.equal(statusBody.adminDistRoot, fixture.adminDistRoot);
      assert.equal(statusBody.sourceServicesRoot, fixture.sourceServicesRoot);
      assert.equal(statusBody.artifactMode, "bootstrap-download");
      assert.equal(statusBody.packagingTarget, "pkg");

      const assetResponse = await fetch(`${baseUrl}/admin/asset.js`);
      assert.equal(assetResponse.status, 200);
      assert.match(await assetResponse.text(), /admin asset/);

      const spaResponse = await fetch(`${baseUrl}/admin/missing/route`);
      assert.equal(spaResponse.status, 200);
      assert.match(await spaResponse.text(), /<title>admin<\/title>/);
    } finally {
      server.close();
      await once(server, "close");
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
