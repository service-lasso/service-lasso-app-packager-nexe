# Minimal POC

This document defines the most minimal useful POC for `service-lasso-app-packager-pkg`.

It must use:
- `service-lasso` as the runtime/API
- `lasso-echoservice` as the first managed service under test
- `lasso-@serviceadmin` as the operator UI

## POC goal

Prove that the canonical Node host can be released behind a working `pkg` launcher while still exposing a usable admin UI and Echo Service as the first managed service.

## Minimal shape

The POC should:
- keep the same app payload model as `service-lasso-app-node`
- add a packaged `pkg` launcher executable
- prepare a local `servicesRoot` that includes Echo Service
- show host-owned startup or status output from the host itself
- provide or bundle a local `lasso-@serviceadmin` build
- open or print one URL for the operator to use
- let the operator manage Echo Service through the admin UI

## Required ingredients

1. Runtime host:
   - one Node payload entrypoint that boots `service-lasso`
   - one `pkg` launcher that starts that payload
   - explicit `servicesRoot`
   - explicit `workspaceRoot`

2. Service under test:
   - released `lasso-echoservice`

3. UI:
   - `lasso-@serviceadmin`
   - configured against the runtime API

## Minimal user flow

1. Run one local command or packaged executable.
2. The launcher starts `service-lasso`.
3. The host shows its own startup/status output.
4. The host makes Service Admin available locally.
5. The operator opens the printed URL.
6. Echo Service appears in the admin UI.
7. The operator installs/starts/stops Echo Service and views logs.

## POC deliverables

- one source start command
- one packaged wrapper build command
- one documented local URL
- documented how Echo Service is included
- documented how Service Admin is served or bundled
- documented host-owned output behavior
- one short smoke checklist

## Current status

This bounded POC is now implemented in-repo:
- `npm start` boots the published `@service-lasso/service-lasso` runtime from source
- `npm run package:pkg` builds the local `pkg` launcher wrapper
- the host serves its own shell at `/`
- the host mounts the sibling built `lasso-@serviceadmin` app at `/admin/`
- the host prepares a tracked-manifest `servicesRoot` so `lasso-echoservice` is the discovered service under test

## Honest scope limit

This POC does not yet need:
- an installer
- code signing
- update channels
- cross-platform distribution polish beyond bounded release verification

It only needs to prove:

**the canonical Node host can be wrapped with `pkg` and still run Service Lasso plus Service Admin against real Echo Service**
