# 3D Globe and Offline Navigation Roadmap

## Current State

We now have a working 3D GPX preview in the app:

- route creation flow can switch between `2D` and `3D`
- route detail page can switch between `2D` and `3D`
- `/lab/globe` is the internal verification route
- `RouteGlobe3D` supports:
  - `Google 3D` when `VITE_GOOGLE_MAPS_API_KEY` is configured
  - `Open Globe` fallback when Google 3D is unavailable

This gives us a safe base for VPS deployment without depending on one external provider.

## Product Direction

Target experience:

1. user opens a route and sees the GPX immediately on a 3D globe
2. user can save the route area to device memory before going offline
3. app can still show current position with no network
4. app can still render local terrain or 3D scene for the saved area
5. if GPS context is weak, user can show the camera view and get on-device visual guidance toward the route

## Recommended Architecture

### Layer 1: Online route visualization

Goal: reliable 3D route preview inside the existing RouteMarket app.

Recommended stack:

- current React app keeps `RouteGlobe3D`
- default runtime path: `Open Globe`
- optional premium/provider path: `Google 3D`
- Atlas continues preparing route geometry and metadata

Data contract:

- route id
- track points
- route bounds
- distance
- optional POIs
- optional elevation profile

### Layer 2: Offline area pack

Goal: download just the route corridor and nearby terrain for offline usage.

Recommended shape:

- create a new `offline packs` concept
- each pack stores:
  - route id
  - bounds
  - simplified GPX
  - nearby POIs
  - terrain/imagery tile manifest
  - pack version
- pack generation should happen server-side
- device only downloads a prepared pack

Recommended storage split:

- VPS/backend:
  - pack manifest
  - pack versioning
  - signed download URLs
- device/browser/app shell:
  - IndexedDB
  - Cache Storage
  - optional Capacitor filesystem later if we go mobile-first

### Layer 3: Offline location on route

Goal: show "where I am" with no signal.

Recommended inputs:

- GPS
- compass / heading
- cached route bounds
- cached local POIs

Needed modules:

- route corridor matcher
- nearest-segment calculator
- off-route detection
- next-direction hint generator

This should be built as a pure local module so it works:

- in browser PWA mode where possible
- later in wrapped mobile app mode

### Layer 4: Offline 3D local area viewer

Goal: inspect the saved place in a local 3D view even without internet.

Recommended long-term direction:

- keep the current globe for global preview
- add a second mode for route-local 3D scene
- route-local scene should use cached terrain/mesh/tile assets, not live provider calls

Best future split:

- `Globe mode`: discover route, see region, understand orientation
- `Local 3D mode`: inspect pass, junction, ridge, valley, switchback

### Layer 5: On-device visual localization

Goal: user points the camera, app estimates current place and direction to continue.

This should be treated as a separate subsystem, not mixed directly into the first map work.

Recommended pipeline:

1. capture frame from device camera
2. derive lightweight local visual descriptors on device
3. compare against cached landmarks / terrain signatures / route context
4. fuse with GPS + compass + recent movement
5. show confidence and arrow toward next segment

Important constraint:

- do not make this depend on cloud AI for the primary hiking/offroad use case
- cloud can assist pack preparation, but live guidance should remain local-first

## Build Order

### Phase A

- keep shipping current 3D globe in route pages
- deploy to VPS
- validate real GPX samples from Atlas imports

### Phase B

- compute and save route bounds for every imported draft
- save simplified track for fast preview
- add POIs on top of the 3D globe

### Phase C

- introduce `offline pack` schema in database
- generate downloadable route-area manifests
- add "save offline" UI in RouteMarket

### Phase D

- implement local route matcher
- show live offline position over the saved route
- add off-route warnings and next-direction hint

### Phase E

- create dedicated local 3D area viewer
- test pack size, battery use, and device limits

### Phase F

- prototype visual localization with a very small on-device model and route landmarks
- test confidence thresholds before exposing it broadly

## What We Should Build Next

Best next step after this commit:

1. deploy the current 3D globe to VPS
2. feed it one or two real Atlas-produced GPX routes
3. add route POI markers to the globe
4. add route bounds + simplified track to the RouteMarket payload/import flow

That sequence keeps momentum and moves us toward offline without overcommitting too early.
