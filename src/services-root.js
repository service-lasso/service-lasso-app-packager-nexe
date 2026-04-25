import path from "node:path";
import { cp } from "node:fs/promises";

export async function prepareStarterServicesRoot(config) {
  await cp(config.sourceServicesRoot, config.servicesRoot, { recursive: true, force: true });

  return {
    servicesRoot: config.servicesRoot,
    echoServiceRoot: path.join(config.servicesRoot, "echo-service"),
    serviceAdminRoot: path.join(config.servicesRoot, "service-admin"),
    echoServiceManifestPath: path.join(config.servicesRoot, "echo-service", "service.json"),
  };
}
