const OPEN_SKY_STATES_URL = "https://opensky-network.org/api/states/all";

const STATE_VECTOR_FIELDS = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  timePosition: 3,
  lastContact: 4,
  longitude: 5,
  latitude: 6,
  barometricAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
  sensors: 12,
  geoAltitude: 13,
  squawk: 14,
  spi: 15,
  positionSource: 16,
};

const GOVERNMENT_CALLSIGN_PREFIXES = [
  "ARMY",
  "ASY",
  "CFC",
  "CNV",
  "COAST",
  "GAF",
  "JENA",
  "NASA",
  "RCH",
  "SAM",
  "VM",
];

const COMMERCIAL_CALLSIGN_PREFIXES = [
  "AAL",
  "ACA",
  "AFR",
  "ASA",
  "BAW",
  "DAL",
  "DLH",
  "EZY",
  "FFT",
  "JBU",
  "KLM",
  "QFA",
  "RYR",
  "SWA",
  "UAL",
  "UAE",
  "UPS",
  "VIR",
];

const PRIVATE_REGISTRATION_PATTERNS = [
  /^N[0-9A-Z]{1,5}$/i,
  /^C-[A-Z]{4}$/i,
  /^D-[A-Z]{4}$/i,
  /^G-[A-Z]{4}$/i,
];

export async function fetchOpenSkyFlights({ signal } = {}) {
  const response = await fetch(OPEN_SKY_STATES_URL, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenSky request failed with ${response.status}`);
  }

  const payload = await response.json();
  const states = Array.isArray(payload.states) ? payload.states : [];

  return states
    .map(normalizeOpenSkyState)
    .filter((flight) => Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude));
}

export async function fetchLiveFlights(options = {}) {
  const flights = await fetchOpenSkyFlights(options);

  return {
    source: "OpenSky Network",
    fetchedAt: new Date(),
    flights,
  };
}

export function normalizeOpenSkyState(state) {
  const get = (field) => state[STATE_VECTOR_FIELDS[field]];
  const callsign = cleanString(get("callsign"));
  const altitudeMeters = coalesceNumber(get("geoAltitude"), get("barometricAltitude"), 0);

  return {
    id: cleanString(get("icao24")) || `${callsign}-${get("lastContact")}`,
    icao24: cleanString(get("icao24")),
    callsign,
    originCountry: cleanString(get("originCountry")),
    lastContact: get("lastContact"),
    longitude: toNumber(get("longitude")),
    latitude: toNumber(get("latitude")),
    altitudeMeters,
    altitudeFeet: Math.round(altitudeMeters * 3.28084),
    onGround: Boolean(get("onGround")),
    velocityMetersPerSecond: coalesceNumber(get("velocity"), 0),
    headingDegrees: coalesceNumber(get("trueTrack"), 0),
    verticalRate: coalesceNumber(get("verticalRate"), 0),
    squawk: cleanString(get("squawk")),
    source: "OpenSky Network",
    sector: classifySector({ callsign, squawk: cleanString(get("squawk")) }),
  };
}

export function classifySector({ callsign = "", squawk = "" } = {}) {
  const normalizedCallsign = callsign.replace(/\s+/g, "").toUpperCase();

  if (["7500", "7600", "7700"].includes(squawk)) {
    return "government";
  }

  if (GOVERNMENT_CALLSIGN_PREFIXES.some((prefix) => normalizedCallsign.startsWith(prefix))) {
    return "government";
  }

  if (COMMERCIAL_CALLSIGN_PREFIXES.some((prefix) => normalizedCallsign.startsWith(prefix))) {
    return "commercial";
  }

  if (PRIVATE_REGISTRATION_PATTERNS.some((pattern) => pattern.test(normalizedCallsign))) {
    return "private";
  }

  return "unknown";
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function coalesceNumber(...values) {
  for (const value of values) {
    const number = toNumber(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
