import test from "node:test";
import assert from "node:assert/strict";
import { classifySector, normalizeOpenSkyState } from "../src/flightData.js";

test("classifies common commercial airline callsigns", () => {
  assert.equal(classifySector({ callsign: "AAL123" }), "commercial");
  assert.equal(classifySector({ callsign: "UPS456" }), "commercial");
});

test("classifies common government and public-service callsigns", () => {
  assert.equal(classifySector({ callsign: "NASA7" }), "government");
  assert.equal(classifySector({ callsign: "RCH101" }), "government");
});

test("classifies registration-style callsigns as private", () => {
  assert.equal(classifySector({ callsign: "N123AB" }), "private");
  assert.equal(classifySector({ callsign: "G-ABCD" }), "private");
});

test("normalizes an OpenSky state vector", () => {
  const flight = normalizeOpenSkyState([
    "abc123",
    " AAL42 ",
    "United States",
    1714200000,
    1714200010,
    -73.7781,
    40.6413,
    10000,
    false,
    220,
    85,
    1.5,
    null,
    10200,
    "1200",
    false,
    0,
  ]);

  assert.equal(flight.id, "abc123");
  assert.equal(flight.callsign, "AAL42");
  assert.equal(flight.sector, "commercial");
  assert.equal(flight.altitudeMeters, 10200);
  assert.equal(flight.headingDegrees, 85);
  assert.equal(flight.source, "OpenSky Network");
});
