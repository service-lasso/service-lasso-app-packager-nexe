# service-lasso-app-packager-pkg

Template repo for a `pkg`-wrapped Node Service Lasso app host.

Package identity:
- `@service-lasso/service-lasso-app-packager-pkg`

Purpose:
- show how to take the canonical `service-lasso-app-node` host shape and release it behind a `pkg` launcher
- act as a quick-start template for downstream teams that want an executable wrapper around the Node host
- stay close to real runtime behavior while keeping packaging concerns outside the core repo

Expected runtime model:
- `servicesRoot`
- `workspaceRoot`

Current implementation:
- plain Node host payload under `src/index.js`
- `pkg` launcher wrapper under `src/pkg-launcher.cjs`
- published `@service-lasso/service-lasso` runtime package consumption
- host-owned shell at `/`
- mounted sibling `lasso-@serviceadmin` build at `/admin/`
- tracked repo-owned `services/` definitions for Echo Service and Service Admin
- manifest-owned Echo Service archive metadata under `services/echo-service/service.json`
- prepared local `servicesRoot` copied from the tracked service inventory before runtime startup

Current local start command:
- `npm start`

Current local build and verify commands:
- `npm test`
- `npm run package:pkg`
- `npm run release:artifact`
- `npm run release:verify`

Current local URLs:
- host shell: `http://127.0.0.1:19030`
- admin UI: `http://127.0.0.1:19030/admin/`
- runtime API: `http://127.0.0.1:18083`

## How To Use This Starter

You have three consumer options:
- use GitHub `Use this template` to start a new repo from this packaging variant
- clone the repo and run `npm start` to work on the raw Node payload directly
- download a release artifact from GitHub Releases

The release outputs are:
- `source`
  - template/source starter for customization
- `runtime`
  - runnable bootstrap-download bundle with a `pkg` launcher wrapper
- `bundled`
  - runnable no-download bundle with a `pkg` launcher wrapper and acquired service archives under `services/`

Release versions from `main` follow the protected-branch pattern:
- `yyyy.m.d-<shortsha>`

Current shipped artifact contents are documented in:
- `docs/release-artifact.md`

## Minimal POC

The first concrete target for this repo is documented in:
- `docs/minimal-poc.md`
