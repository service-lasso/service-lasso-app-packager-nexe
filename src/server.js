import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function writeJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function createShellHtml(config) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Service Lasso App Packager pkg</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f2efe8;
        --panel: #fffdf8;
        --ink: #122023;
        --muted: #5f6a6d;
        --accent: #0f766e;
        --line: #d8d2c5;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 40%),
          linear-gradient(180deg, #fbfaf7 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 48px 24px 64px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 18px 50px rgba(18,32,35,0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 2.2rem;
        line-height: 1.1;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .actions,
      .cards {
        display: grid;
        gap: 16px;
        margin-top: 24px;
      }
      .actions {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .cards {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      a {
        color: inherit;
        text-decoration: none;
      }
      .action,
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px;
      }
      .action strong,
      .card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 1rem;
      }
      .badge {
        display: inline-block;
        margin-bottom: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(15,118,110,0.1);
        color: var(--accent);
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      code {
        display: inline-block;
        margin-top: 8px;
        padding: 4px 8px;
        border-radius: 8px;
        background: #ece7da;
        font-family: "IBM Plex Mono", "Consolas", monospace;
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="badge">pkg Wrapper Host</span>
        <h1>pkg-packaged Node host for Service Lasso</h1>
        <p>
          This host keeps the same canonical Node payload model, but releases it behind a
          pkg launcher so downstream teams can evaluate a packaged executable wrapper.
        </p>
        <div class="actions">
          <a class="action" href="/admin/">
            <strong>Open Service Admin</strong>
            <span>Use the bounded admin UI against the local runtime.</span>
          </a>
          <a class="action" href="/api/host-status">
            <strong>Host status JSON</strong>
            <span>Inspect the app host wiring and runtime roots.</span>
          </a>
          <a class="action" href="${config.runtimeUrl}/api/services">
            <strong>Runtime services API</strong>
            <span>See discovered services directly from the runtime.</span>
          </a>
        </div>
      </section>
      <section class="cards">
        <div class="card">
          <strong>Runtime</strong>
          <div>API base: <code>${config.runtimeUrl}</code></div>
          <div>servicesRoot: <code>${config.servicesRoot}</code></div>
          <div>workspaceRoot: <code>${config.workspaceRoot}</code></div>
        </div>
        <div class="card">
          <strong>Packaging target</strong>
          <div>Wrapper: <code>pkg</code></div>
          <div>Payload root: <code>${config.repoRoot}</code></div>
        </div>
        <div class="card">
          <strong>Service under test</strong>
          <div>Echo Service root: <code>${config.echoServiceRoot}</code></div>
          <div>Expected service id: <code>echo-service</code></div>
        </div>
        <div class="card">
          <strong>Admin UI</strong>
          <div>Served from sibling build: <code>${config.adminDistRoot}</code></div>
          <div>Mounted at: <code>${config.adminUrl}</code></div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

async function serveStaticFile(response, filePath) {
  response.statusCode = 200;
  response.setHeader("content-type", getMimeType(filePath));
  createReadStream(filePath).pipe(response);
}

async function resolveStaticFile(config, pathname) {
  const trimmed = pathname.replace(/^\/admin\/?/, "");
  const candidate = trimmed.length === 0 ? "index.html" : trimmed;
  const filePath = path.join(config.adminDistRoot, candidate);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return filePath;
    }
  } catch {}

  return path.join(config.adminDistRoot, "index.html");
}

export function createHostStatus(config) {
  return {
    app: "@service-lasso/service-lasso-app-packager-pkg",
    hostUrl: config.hostUrl,
    runtimeUrl: config.runtimeUrl,
    adminUrl: config.adminUrl,
    servicesRoot: config.servicesRoot,
    sourceServicesRoot: config.sourceServicesRoot,
    workspaceRoot: config.workspaceRoot,
    adminDistRoot: config.adminDistRoot,
    packagingTarget: "pkg",
    artifactMode: "bootstrap-download",
    notes: [
      "Host-owned shell is served at /.",
      "Service Admin is mounted from the sibling built dist or bundled payload under /admin/.",
      "The packaged executable wrapper launches the same tracked app payload through a bundled Node runtime.",
      "Tracked services/ definitions are copied into the prepared servicesRoot before runtime startup.",
      "Echo Service install/start now relies on manifest-owned archive metadata instead of a generated local wrapper.",
    ],
  };
}

export function createHostServer(config) {
  const shellHtml = createShellHtml(config);
  const statusBody = createHostStatus(config);

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/") {
      response.statusCode = 200;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(shellHtml);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/host-status") {
      writeJson(response, 200, statusBody);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/admin")) {
      const filePath = await resolveStaticFile(config, url.pathname);
      await serveStaticFile(response, filePath);
      return;
    }

    response.statusCode = 404;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("not found");
  });
}
