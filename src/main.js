import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { fetchLiveFlights } from "./flightData.js";
import "./styles.css";

const REFRESH_INTERVAL_MS = 30000;
const INITIAL_VIEW = Cesium.Cartesian3.fromDegrees(-30, 35, 15000000);
const SECTOR_META = {
  commercial: {
    label: "Commercial",
    color: Cesium.Color.CYAN,
    cssClass: "commercial",
  },
  private: {
    label: "Private",
    color: Cesium.Color.YELLOW,
    cssClass: "private",
  },
  government: {
    label: "Government",
    color: Cesium.Color.ORANGE,
    cssClass: "government",
  },
  unknown: {
    label: "Unknown",
    color: Cesium.Color.WHITE,
    cssClass: "unknown",
  },
};
const EMPTY_SECTOR_COUNTS = {
  commercial: 0,
  private: 0,
  government: 0,
  unknown: 0,
};

Cesium.Ion.defaultAccessToken = "";

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  baseLayerPicker: true,
  geocoder: false,
  homeButton: true,
  infoBox: true,
  sceneModePicker: true,
  selectionIndicator: true,
  timeline: false,
  navigationHelpButton: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});

viewer.camera.setView({ destination: INITIAL_VIEW });
viewer.scene.globe.enableLighting = true;

const statusText = document.querySelector("#statusText");
const updatedAt = document.querySelector("#updatedAt");
const totalFlights = document.querySelector("#totalFlights");
const visibleFlights = document.querySelector("#visibleFlights");
const sourceName = document.querySelector("#sourceName");
const refreshButton = document.querySelector("#refreshButton");
const searchInput = document.querySelector("#searchInput");
const focusButton = document.querySelector("#focusButton");
const resetViewButton = document.querySelector("#resetViewButton");
const altitudeMetric = document.querySelector("#altitudeMetric");
const speedMetric = document.querySelector("#speedMetric");
const sectorBreakdown = document.querySelector("#sectorBreakdown");
const searchHint = document.querySelector("#searchHint");
const altitudeFilter = document.querySelector("#altitudeFilter");
const speedFilter = document.querySelector("#speedFilter");
const countryFilter = document.querySelector("#countryFilter");
const statusFilter = document.querySelector("#statusFilter");
const resetFiltersButton = document.querySelector("#resetFiltersButton");
const filters = new Map(
  [...document.querySelectorAll("[data-sector-filter]")].map((input) => [
    input.dataset.sectorFilter,
    input,
  ]),
);

const flightEntities = new Map();
let currentFlights = [];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.dataset.state = isError ? "error" : "ok";
}

function flyHome() {
  viewer.camera.flyTo({
    destination: INITIAL_VIEW,
    duration: 1.2,
  });
}

function formatAltitude(meters) {
  if (meters === null) {
    return "Unknown";
  }

  return `${Math.round(meters).toLocaleString()} m / ${Math.round(
    meters * 3.28084,
  ).toLocaleString()} ft`;
}

function formatSpeed(metersPerSecond) {
  if (metersPerSecond === null) {
    return "Unknown";
  }

  return `${Math.round(metersPerSecond * 1.94384).toLocaleString()} kt`;
}

function escapeHtml(value) {
  return String(value || "Unknown").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function formatCompactNumber(value) {
  return Math.round(value).toLocaleString();
}

function matchesSearch(flight) {
  const query = searchInput.value.trim().toUpperCase();

  if (!query) {
    return true;
  }

  return [flight.callsign, flight.icao24, flight.originCountry, flight.sector]
    .filter(Boolean)
    .some((value) => value.toUpperCase().includes(query));
}

function getAltitudeFeet(flight) {
  return Number.isFinite(flight.altitudeMeters) ? flight.altitudeMeters * 3.28084 : 0;
}

function getSpeedKnots(flight) {
  return Number.isFinite(flight.velocityMetersPerSecond)
    ? flight.velocityMetersPerSecond * 1.94384
    : 0;
}

function matchesAltitudeFilter(flight) {
  const altitudeFeet = getAltitudeFeet(flight);

  switch (altitudeFilter.value) {
    case "surface":
      return flight.onGround || altitudeFeet < 1000;
    case "low":
      return altitudeFeet >= 1000 && altitudeFeet < 10000;
    case "mid":
      return altitudeFeet >= 10000 && altitudeFeet < 30000;
    case "high":
      return altitudeFeet >= 30000;
    default:
      return true;
  }
}

function matchesStatusFilter(flight) {
  if (statusFilter.value === "airborne") {
    return !flight.onGround;
  }

  if (statusFilter.value === "ground") {
    return flight.onGround;
  }

  return true;
}

function matchesAdvancedFilters(flight) {
  const countryQuery = countryFilter.value.trim().toUpperCase();
  const minimumSpeedKnots = Number(speedFilter.value) || 0;

  return (
    matchesAltitudeFilter(flight) &&
    matchesStatusFilter(flight) &&
    getSpeedKnots(flight) >= minimumSpeedKnots &&
    (!countryQuery || flight.originCountry.toUpperCase().includes(countryQuery))
  );
}

function resetFilters() {
  searchInput.value = "";
  altitudeFilter.value = "all";
  speedFilter.value = "0";
  countryFilter.value = "";
  statusFilter.value = "all";

  for (const input of filters.values()) {
    input.checked = true;
  }

  applyFilters();
}

function flightDescription(flight) {
  const sector = SECTOR_META[flight.sector] ?? SECTOR_META.unknown;

  return `
    <table class="cesium-infoBox-defaultTable">
      <tbody>
        <tr><th>Callsign</th><td>${escapeHtml(flight.callsign)}</td></tr>
        <tr><th>ICAO24</th><td>${escapeHtml(flight.icao24)}</td></tr>
        <tr><th>Sector</th><td>${sector.label}</td></tr>
        <tr><th>Country</th><td>${escapeHtml(flight.originCountry)}</td></tr>
        <tr><th>Altitude</th><td>${formatAltitude(flight.altitudeMeters)}</td></tr>
        <tr><th>Speed</th><td>${formatSpeed(flight.velocityMetersPerSecond)}</td></tr>
        <tr><th>Heading</th><td>${flight.headingDegrees ?? "Unknown"} deg</td></tr>
        <tr><th>Source</th><td>${escapeHtml(flight.source)}</td></tr>
      </tbody>
    </table>
  `;
}

function aircraftModel(flight) {
  const sector = SECTOR_META[flight.sector] ?? SECTOR_META.unknown;
  const heading = Cesium.Math.toRadians(flight.headingDegrees ?? 0);
  const pitch = Cesium.Math.toRadians(0);
  const roll = Cesium.Math.toRadians(0);
  const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
  const position = Cesium.Cartesian3.fromDegrees(
    flight.longitude,
    flight.latitude,
    flight.altitudeMeters ?? 0,
  );

  return {
    name: `${flight.callsign} (${sector.label})`,
    position,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(position, hpr),
    description: flightDescription(flight),
    billboard: {
      image: createAircraftIcon(sector.color),
      scale: 0.7,
      alignedAxis: Cesium.Cartesian3.UNIT_Z,
      rotation: -heading,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
    },
    path: {
      show: false,
    },
  };
}

function createAircraftIcon(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.translate(32, 32);
  ctx.fillStyle = color.toCssColorString();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(9, 3);
  ctx.lineTo(27, 12);
  ctx.lineTo(27, 20);
  ctx.lineTo(4, 14);
  ctx.lineTo(4, 27);
  ctx.lineTo(-4, 27);
  ctx.lineTo(-4, 14);
  ctx.lineTo(-27, 20);
  ctx.lineTo(-27, 12);
  ctx.lineTo(-9, 3);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  return canvas.toDataURL();
}

function applyFilters() {
  let visibleCount = 0;
  const query = searchInput.value.trim();

  for (const flight of currentFlights) {
    const entity = flightEntities.get(flight.id);
    if (!entity) {
      continue;
    }

    const isVisible =
      (filters.get(flight.sector)?.checked ?? true) &&
      matchesSearch(flight) &&
      matchesAdvancedFilters(flight);
    entity.show = isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  }

  visibleFlights.textContent = visibleCount.toLocaleString();
  searchHint.textContent = query
    ? `${visibleCount.toLocaleString()} visible matches for "${query}"`
    : `${visibleCount.toLocaleString()} aircraft match the active filters.`;
}

function updateFlightInsights(flights) {
  const sectorCounts = { ...EMPTY_SECTOR_COUNTS };
  let altitudeTotal = 0;
  let altitudeCount = 0;
  let speedTotal = 0;
  let speedCount = 0;

  for (const flight of flights) {
    sectorCounts[flight.sector] = (sectorCounts[flight.sector] ?? 0) + 1;

    if (Number.isFinite(flight.altitudeMeters) && !flight.onGround) {
      altitudeTotal += flight.altitudeMeters;
      altitudeCount += 1;
    }

    if (Number.isFinite(flight.velocityMetersPerSecond) && flight.velocityMetersPerSecond > 0) {
      speedTotal += flight.velocityMetersPerSecond;
      speedCount += 1;
    }
  }

  altitudeMetric.textContent = altitudeCount
    ? `${formatCompactNumber((altitudeTotal / altitudeCount) * 3.28084)} ft`
    : "N/A";
  speedMetric.textContent = speedCount
    ? `${formatCompactNumber((speedTotal / speedCount) * 1.94384)} kt`
    : "N/A";

  sectorBreakdown.innerHTML = Object.entries(SECTOR_META)
    .map(([sector, meta]) => {
      const count = sectorCounts[sector] ?? 0;
      const share = flights.length ? Math.round((count / flights.length) * 100) : 0;

      return `
        <li>
          <div class="sector-row">
            <span><span class="dot ${meta.cssClass}"></span>${meta.label}</span>
            <strong>${count.toLocaleString()}</strong>
          </div>
          <div class="bar" aria-hidden="true">
            <span class="${meta.cssClass}" style="width: ${share}%"></span>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderFlights(flights) {
  const nextIds = new Set(flights.map((flight) => flight.id));

  for (const [id, entity] of flightEntities) {
    if (!nextIds.has(id)) {
      viewer.entities.remove(entity);
      flightEntities.delete(id);
    }
  }

  for (const flight of flights) {
    const existing = flightEntities.get(flight.id);
    const model = aircraftModel(flight);

    if (existing) {
      Object.assign(existing, model);
    } else {
      flightEntities.set(flight.id, viewer.entities.add(model));
    }
  }

  currentFlights = flights;
  totalFlights.textContent = flights.length.toLocaleString();
  updateFlightInsights(flights);
  applyFilters();
}

function focusSearchResult() {
  const match = currentFlights.find((flight) => {
    const entity = flightEntities.get(flight.id);
    return entity?.show && matchesSearch(flight);
  });

  if (!match) {
    setStatus("No visible aircraft matches that search", true);
    return;
  }

  const entity = flightEntities.get(match.id);
  viewer.selectedEntity = entity;
  viewer.flyTo(entity, {
    duration: 1.1,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 180000),
  });
  setStatus(`Focused ${match.callsign || match.icao24}`);
}

async function refreshFlights() {
  setStatus("Loading live aircraft...");
  refreshButton.disabled = true;

  try {
    const { flights, fetchedAt, source } = await fetchLiveFlights();
    renderFlights(flights);
    sourceName.textContent = source;
    updatedAt.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(fetchedAt);
    setStatus("Live feed connected");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

for (const input of filters.values()) {
  input.addEventListener("change", applyFilters);
}

[altitudeFilter, speedFilter, countryFilter, statusFilter].forEach((input) => {
  input.addEventListener("input", applyFilters);
  input.addEventListener("change", applyFilters);
});

searchInput.addEventListener("input", applyFilters);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    focusSearchResult();
  }
});
focusButton.addEventListener("click", focusSearchResult);
resetViewButton.addEventListener("click", flyHome);
resetFiltersButton.addEventListener("click", resetFilters);
refreshButton.addEventListener("click", refreshFlights);
refreshFlights();
setInterval(refreshFlights, REFRESH_INTERVAL_MS);
