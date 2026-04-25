import path from "node:path";
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolveAppPackagerPkgConfig(options = {}) {
  const rootDir = options.repoRoot ?? repoRoot;
  const siblingRoot = options.siblingRoot ?? path.resolve(rootDir, "..");
  const hostPort =
    options.hostPort ??
    Number(process.env.SERVICE_LASSO_APP_PACKAGER_PKG_HOST_PORT ?? process.env.SERVICE_LASSO_APP_NODE_HOST_PORT ?? 19030);
  const runtimePort =
    options.runtimePort ??
    Number(process.env.SERVICE_LASSO_API_PORT ?? process.env.SERVICE_LASSO_APP_PACKAGER_PKG_API_PORT ?? 18083);
  const adminDistRoot =
    options.adminDistRoot ??
    process.env.SERVICE_LASSO_APP_PACKAGER_PKG_ADMIN_DIST_ROOT ??
    process.env.SERVICE_LASSO_APP_NODE_ADMIN_DIST_ROOT ??
    (existsSync(path.join(rootDir, ".payload", "admin"))
      ? path.join(rootDir, ".payload", "admin")
      : path.join(siblingRoot, "lasso-@serviceadmin", "dist"));
  const workspaceBaseRoot =
    options.workspaceBaseRoot ??
    process.env.SERVICE_LASSO_APP_PACKAGER_PKG_WORKSPACE_BASE_ROOT ??
    path.join(rootDir, ".workspace");
  const workspaceRoot =
    options.workspaceRoot ??
    process.env.SERVICE_LASSO_WORKSPACE_ROOT ??
    path.join(workspaceBaseRoot, "runtime");
  const servicesRoot =
    options.servicesRoot ??
    process.env.SERVICE_LASSO_SERVICES_ROOT ??
    path.join(workspaceBaseRoot, "services");
  const sourceServicesRoot =
    options.sourceServicesRoot ??
    process.env.SERVICE_LASSO_APP_PACKAGER_PKG_SOURCE_SERVICES_ROOT ??
    process.env.SERVICE_LASSO_APP_NODE_SOURCE_SERVICES_ROOT ??
    path.join(rootDir, "services");

  return {
    repoRoot: rootDir,
    siblingRoot,
    workspaceBaseRoot,
    hostPort,
    runtimePort,
    hostUrl: `http://127.0.0.1:${hostPort}`,
    runtimeUrl: `http://127.0.0.1:${runtimePort}`,
    adminDistRoot,
    adminUrl: `http://127.0.0.1:${hostPort}/admin/`,
    workspaceRoot,
    servicesRoot,
    sourceServicesRoot,
  };
}

export async function validateAppPackagerPkgConfig(config) {
  await access(path.join(config.sourceServicesRoot, "echo-service", "service.json"));
  await access(path.join(config.sourceServicesRoot, "service-admin", "service.json"));
  await access(path.join(config.adminDistRoot, "index.html"));
  return config;
}
