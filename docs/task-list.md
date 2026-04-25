# App Packager pkg task list

This document tracks the first real implementation slice for `service-lasso-app-packager-pkg`.

## Goal

Turn the starter into the smallest real packaging-variant repo that:
- uses published `@service-lasso/service-lasso`
- shows host-owned output
- exposes `lasso-@serviceadmin`
- discovers real `lasso-echoservice`
- adds a bounded `pkg` launcher wrapper around the canonical Node host payload

## Bounded tasks

1. Start from the proven `service-lasso-app-node` host shape
   status: done

2. Give the repo its own identity, ports, docs, and service metadata
   status: done

3. Add a real `pkg` launcher wrapper
   status: done

4. Add direct tests for config resolution, host routes, and artifact verification
   status: done

5. Add release artifacts that prove source, bootstrap-download, and bundled modes through the `pkg` wrapper
   status: done

6. Align release versioning with the protected-branch `yyyy.m.d-<shortsha>` pattern
   status: done

## Honest current scope

This slice does not yet build:
- installers
- code-signed executables
- multiple packaging-target variants in one repo

It only proves:

**the canonical Node host can be wrapped with `pkg`, released with honest source/bootstrap/bundled outputs, and still surface Service Admin against real Echo Service**

## Current evidence

- `npm test`
- `npm run package:pkg`
- `npm run release:verify`
- local smoke through the packaged wrapper against the tracked `services/` inventory
