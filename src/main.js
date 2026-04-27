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
  },
  private: {
    label: "Private",
    color: Cesium.Color.YELLOW,
  },
  government: {
    label: "Government",
    color: Cesium.Color.ORANGE,
  },
  unknown: {
    label: "Unknown",
    color: Cesium.Color.WHITE,
  },
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

  for (const flight of currentFlights) {
    const entity = flightEntities.get(flight.id);
    if (!entity) {
      continue;
    }

    const isVisible = filters.get(flight.sector)?.checked ?? true;
    entity.show = isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  }

  visibleFlights.textContent = visibleCount.toLocaleString();
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
  applyFilters();
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

refreshButton.addEventListener("click", refreshFlights);
refreshFlights();
setInterval(refreshFlights, REFRESH_INTERVAL_MS);
