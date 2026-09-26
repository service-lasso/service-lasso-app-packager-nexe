# nexe host and wrapper contract

This file records component-specific hosting and packaging boundaries. The shared operator journey is maintained in the Core guides linked from README.

## Source host

`src/index.js` consumes the published `@service-lasso/service-lasso` runtime. The host owns its shell at `/` and mounts a sibling built Service Admin at `/admin/`. It supplies explicit `servicesRoot` and `workspaceRoot`, preparing its local inventory from tracked `services/` definitions before startup. `npm start` runs the raw Node payload for source development.

Source defaults are host shell `http://127.0.0.1:19050`, Admin `http://127.0.0.1:19050/admin/` and runtime API `http://127.0.0.1:18085`. Availability depends on instance configuration and the prerequisites in the shared guide.

## Wrapper and payload binding

`src/nexe-launcher.cjs` identifies whether it is running as Node or as a packaged wrapper. In the source path it imports the payload entrypoint. In the packaged path it starts the separate `node-runtime/node.exe` or `node-runtime/node` with the payload's `src/index.js`, inheriting stdio and forwarding termination signals. Payload/runtime overrides belong to the existing launcher contract, not an alternate shared reader journey.

`npm run package:nexe` stages the runnable wrapper layout under `dist/nexe`; the build script prints its wrapper path. A wrapper executable, a separate Node runtime and payload assets form the layout. Preserve them together. This is not evidence of a single-file Service Lasso executable, installer, signing or update channel.

## Managed inventory and artifact classes

The tracked baseline contains `echo-service`, `@serviceadmin`, `@node`, `@localcert`, `@nginx` and `@traefik`; optional `@python` and `@java` examples are disabled. Echo and Traefik download/archive identities belong to their manifests. Traefik declares `@localcert` and `@nginx` as dependencies. Core service identifiers retain their `@` prefix; the sample `echo-service` remains unprefixed.

Source artifacts support customization; runtime artifacts include the nexe launcher and bootstrap service downloads; bundled artifacts include the launcher and acquired service archives for no-download startup. Exact layout, build and verification authority remain in the existing [release artifact contract](release-artifact.md), scripts and workflows. Staged-artifact tests do not establish installer or broad distribution acceptance.

## Documentation migration receipt

For service-lasso/service-lasso#1418 / SPEC-002 AC-4AJ.3 and companion issue #4, README and generic `docs/minimal-poc.md` were audited at develop `4d72ae7c2d8b7a7d0f58735a8218ea54abe4d63e`. README now links to the shared Core guide merged in PR #1424; the replaced generic guide is removed. Host, wrapper, payload and release contracts remain local. No fresh runtime acceptance, publication or release is claimed.
