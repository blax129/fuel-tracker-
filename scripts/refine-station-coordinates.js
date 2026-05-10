const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "fuelTracker";
const collectionName = "stations";

const LAGOS_COORDINATE_BOUNDS = {
  minLat: 6.2,
  maxLat: 6.85,
  minLng: 2.7,
  maxLng: 4.45
};

const AREA_CENTER_COORDINATES = {
  agege: { lat: 6.621, lng: 3.325 },
  ajah: { lat: 6.469, lng: 3.585 },
  alimosho: { lat: 6.601, lng: 3.288 },
  berger: { lat: 6.642, lng: 3.374 },
  ebute: { lat: 6.487, lng: 3.381 },
  egbeda: { lat: 6.596, lng: 3.289 },
  festac: { lat: 6.469, lng: 3.284 },
  gbagada: { lat: 6.558, lng: 3.394 },
  ikeja: { lat: 6.602, lng: 3.351 },
  ikorodu: { lat: 6.619, lng: 3.51 },
  ikotun: { lat: 6.544, lng: 3.267 },
  idimu: { lat: 6.583, lng: 3.286 },
  ilupeju: { lat: 6.552, lng: 3.362 },
  isolo: { lat: 6.539, lng: 3.323 },
  ketu: { lat: 6.595, lng: 3.388 },
  lekki: { lat: 6.447, lng: 3.472 },
  maryland: { lat: 6.572, lng: 3.368 },
  mushin: { lat: 6.531, lng: 3.349 },
  ojodu: { lat: 6.641, lng: 3.365 },
  oshodi: { lat: 6.556, lng: 3.343 },
  surulere: { lat: 6.501, lng: 3.357 },
  yaba: { lat: 6.516, lng: 3.379 }
};

const PRIORITY_AREA_ANCHORS = {
  igando: { lat: 6.552, lng: 3.258 },
  egan: { lat: 6.515, lng: 3.236 },
  ikotun: { lat: 6.54, lng: 3.265 },
  idimu: { lat: 6.583, lng: 3.286 },
  egbeda: { lat: 6.595, lng: 3.289 }
};

const LAGOS_CENTER = { lat: 6.5244, lng: 3.3792 };

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: null
  };

  argv.forEach((token, index) => {
    if (token === "--apply") args.apply = true;
    if (token === "--dry-run") args.apply = false;
    if (token === "--limit") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) args.limit = Math.floor(value);
    }
  });

  return args;
}

function normalizeAreaName(value) {
  return (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTextForMatching(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function numericCoordinate(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidStationCoordinate(lat, lng) {
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LAGOS_COORDINATE_BOUNDS.minLat &&
    lat <= LAGOS_COORDINATE_BOUNDS.maxLat &&
    lng >= LAGOS_COORDINATE_BOUNDS.minLng &&
    lng <= LAGOS_COORDINATE_BOUNDS.maxLng;
}

function getAreaCenter(area) {
  const normalizedArea = normalizeAreaName(area);
  if (!normalizedArea) return null;
  if (AREA_CENTER_COORDINATES[normalizedArea]) return AREA_CENTER_COORDINATES[normalizedArea];
  const key = Object.keys(AREA_CENTER_COORDINATES).find(item =>
    normalizedArea.includes(item) || item.includes(normalizedArea)
  );
  return key ? AREA_CENTER_COORDINATES[key] : null;
}

function getPriorityAreaAnchor(station) {
  const haystack = normalizeTextForMatching([
    station?.area,
    station?.address,
    station?.fullAddress,
    station?.name
  ].join(" "));
  for (const [keyword, anchor] of Object.entries(PRIORITY_AREA_ANCHORS)) {
    if (haystack.includes(keyword)) return anchor;
  }
  return null;
}

function getRoundedCoordinateKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function deriveCoordinateSeed(station) {
  const seedSource = String(station?._id || station?.name || station?.address || station?.area || "");
  let hash = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    hash = (hash * 33 + seedSource.charCodeAt(index)) % 1000003;
  }
  return hash;
}

function buildRefinedCoordinate(station) {
  const center = getPriorityAreaAnchor(station) || getAreaCenter(station?.area) || LAGOS_CENTER;
  const seed = deriveCoordinateSeed(station);
  const latOffset = ((seed % 29) - 14) * 0.00055;
  const lngOffset = (((Math.floor(seed / 29) % 29) - 14) * 0.0006);
  return {
    lat: Number((center.lat + latOffset).toFixed(6)),
    lng: Number((center.lng + lngOffset).toFixed(6))
  };
}

function getStationCoordinateCandidates(station) {
  const location = station.location || {};
  const geo = station.geo || station.geometry || {};
  const coordinates = location.coordinates || station.coordinates || geo.coordinates;
  const candidates = [
    [station.latitude, station.longitude],
    [station.lat, station.lng],
    [station.lat, station.lon],
    [station.latitude, station.lng],
    [location.lat, location.lng],
    [location.latitude, location.longitude],
    [location.lat, location.lon],
    [geo.lat, geo.lng],
    [geo.latitude, geo.longitude]
  ];

  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    candidates.push([coordinates[1], coordinates[0]]);
  }

  return candidates;
}

function getPrimaryStationCoordinate(station) {
  for (const [rawLat, rawLng] of getStationCoordinateCandidates(station)) {
    const lat = numericCoordinate(rawLat);
    const lng = numericCoordinate(rawLng);
    if (isValidStationCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const collection = client.db(dbName).collection(collectionName);
    const allStations = await collection.find({}, {
      projection: {
        name: 1,
        brand: 1,
        area: 1,
        address: 1,
        fullAddress: 1,
        latitude: 1,
        longitude: 1,
        location: 1
      }
    }).toArray();
    const stations = args.limit ? allStations.slice(0, args.limit) : allStations;

    const densityMap = new Map();
    stations.forEach(station => {
      const coordinate = getPrimaryStationCoordinate(station);
      if (!coordinate) return;
      const key = getRoundedCoordinateKey(coordinate.lat, coordinate.lng);
      densityMap.set(key, (densityMap.get(key) || 0) + 1);
    });

    const updates = [];
    const report = [];

    stations.forEach(station => {
      const original = getPrimaryStationCoordinate(station);
      const priorityAnchor = getPriorityAreaAnchor(station);
      const hasPriorityArea = Boolean(priorityAnchor);
      const shouldRefineByMissing = !original;
      const shouldRefineByClustering = Boolean(
        original &&
        hasPriorityArea &&
        (densityMap.get(getRoundedCoordinateKey(original.lat, original.lng)) || 0) >= 4
      );
      const shouldRefine = shouldRefineByMissing || shouldRefineByClustering;
      const refined = shouldRefine ? buildRefinedCoordinate(station) : original;

      if (!refined || !isValidStationCoordinate(refined.lat, refined.lng)) {
        report.push({
          stationId: station._id,
          name: station.name,
          area: station.area,
          status: "skipped-invalid",
          reason: "Could not produce valid Lagos coordinate"
        });
        return;
      }

      const previousLat = original?.lat ?? null;
      const previousLng = original?.lng ?? null;
      const changed = !original ||
        Math.abs(refined.lat - previousLat) > 0.00001 ||
        Math.abs(refined.lng - previousLng) > 0.00001;

      report.push({
        stationId: station._id,
        name: station.name,
        area: station.area,
        status: changed ? "updated" : "unchanged",
        reason: shouldRefineByMissing
          ? "missing-or-invalid-coordinate"
          : shouldRefineByClustering
          ? "clustered-generic-coordinate"
          : "valid-existing-coordinate",
        oldLat: previousLat,
        oldLng: previousLng,
        newLat: refined.lat,
        newLng: refined.lng
      });

      if (!changed) return;

      updates.push({
        updateOne: {
          filter: { _id: station._id },
          update: {
            $set: {
              latitude: refined.lat,
              longitude: refined.lng,
              location: { lat: refined.lat, lng: refined.lng },
              geocodeMeta: {
                source: "station-coordinate-refine-script",
                provider: "local-refine",
                confidence: hasPriorityArea ? 0.72 : 0.62,
                status: hasPriorityArea ? "medium-confidence" : "approximate",
                updatedAt: new Date()
              }
            }
          }
        }
      });
    });

    if (args.apply && updates.length) {
      await collection.bulkWrite(updates, { ordered: false });
    }

    const summary = {
      mode: args.apply ? "apply" : "dry-run",
      scanned: stations.length,
      updatesPrepared: updates.length,
      updated: report.filter(item => item.status === "updated").length,
      unchanged: report.filter(item => item.status === "unchanged").length,
      skipped: report.filter(item => item.status === "skipped-invalid").length
    };

    console.log(JSON.stringify({ summary, report }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
