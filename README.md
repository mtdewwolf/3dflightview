# 3dflightview

A browser-based live 3D flight map prototype that uses free/public flight
position data where available. The initial implementation renders aircraft on a
Cesium globe and polls the OpenSky Network public states API.

## What this can show

- Commercial aircraft with transponder-derived position, altitude, speed, and
  callsign when published by the public feed.
- Private and government aircraft only when they are visible in the selected
  public data source. Many operators block, limit, or anonymize tracking data,
  so full coverage is not guaranteed.
- Best-effort sector labels derived from callsign prefixes and common patterns.
  Public feeds usually do not provide authoritative operator type.

## Run locally

This project has no required build step.

```bash
npm run dev
```

Then open <http://localhost:4173>.

## Data source

The default source is the free OpenSky Network public API:

```text
https://opensky-network.org/api/states/all
```

The API can be rate limited and may not expose every aircraft. If the request
fails, the app keeps the globe usable and displays a clear error in the status
panel.

## Next data integrations to consider

The map is structured so additional free feeds can be added behind the same
normalization layer in `src/flightData.js`.

- ADS-B Exchange alternatives/community mirrors, depending on terms and access.
- ADSB.lol, if its public endpoints and usage policy fit the deployment.
- FAA/NASR, airport, route, or sector boundary static datasets for context.
- Government/public-service aircraft registries where jurisdiction permits.

Always confirm API terms of service before deploying a public live map.
