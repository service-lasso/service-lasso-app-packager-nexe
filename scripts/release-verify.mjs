import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageReleaseArtifacts, verifyStagedArtifacts } from "./release-artifact-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staged = await stageReleaseArtifacts({ repoRoot });
const verified = await verifyStagedArtifacts({
  repoRoot,
  staged,
});

console.log("[service-lasso-app-packager-pkg] verified release artifacts");
console.log(`- source artifact: ${verified.artifacts.source.artifactName}`);
console.log(`- source archive: ${verified.artifacts.source.archivePath}`);
console.log(`- runtime artifact: ${verified.artifacts.runtime.artifactName}`);
console.log(`- runtime archive: ${verified.artifacts.runtime.archivePath}`);
console.log(`- runtime wrapper: ${verified.artifacts.runtime.verification.wrapper}`);
console.log(`- bundled artifact: ${verified.artifacts.bundled.artifactName}`);
console.log(`- bundled archive: ${verified.artifacts.bundled.archivePath}`);
console.log(`- bundled wrapper: ${verified.artifacts.bundled.verification.wrapper}`);
