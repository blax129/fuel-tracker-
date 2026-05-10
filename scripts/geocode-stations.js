const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "fuelTracker";
const collectionName = "stations";

const PROVIDERS = {
  google: {
    name: "google_maps_geocoding",
    baseUrl: "https://maps.googleapis.com/maps/api/geocode/json"
  },
  nominatim: {
    name: "openstreetmap_nominatim",
    baseUrl: "https://nominatim.openstreetmap.org/search"
  }
};

const LAGOS_VIEWBOX = "2.70,6.85,4.45,6.20";
const DEFAULT_DELAY_MS = 1100;

function parseArgs(argv) {
  const args = {
    apply: false,
    threshold: 0.72,
    limit: null,
    provider: "nominatim",
    delayMs: DEFAULT_DELAY_MS,
    failedReport: null
  };

  argv.forEach((token, index) => {
    if (token === "--apply") args.apply = true;
    if (token === "--dry-run") args.apply = false;
    if (token === "--threshold") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value)) args.threshold = value;
    }
    if (token === "--limit") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) args.limit = Math.floor(value);
    }
    if (token === "--provider" && argv[index + 1]) {
      args.provider = argv[index + 1];
    }
    if (token === "--delay-ms") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 1000) args.delayMs = Math.floor(value);
    }
    if (token === "--failed-report" && argv[index + 1]) {
      args.failedReport = argv[index + 1];
    }
  });

  return args;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function overlapRatio(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  const common = [...aSet].filter(token => bSet.has(token)).length;
  return common / aSet.size;
}

function clampScore(score) {
  return Math.max(0, Math.min(1, score));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseFailedStationIdsFromReport(reportPath) {
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.resolve(process.cwd(), reportPath);
  const raw = fs.readFileSync(absolutePath, "utf-8");
  const payload = JSON.parse(raw);
  const rows = Array.isArray(payload?.report) ? payload.report : [];
  const failedStatuses = new Set(["error", "no-result", "manual-review"]);
  const stationIds = rows
    .filter(item => item && (item.reviewRequired || failedStatuses.has(item.status)))
    .map(item => String(item.stationId || "").trim())
    .filter(Boolean);
  return {
    stationIds: [...new Set(stationIds)],
    reportPath: absolutePath
  };
}

function compactAddress(parts) {
  return parts.filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

function stationSearchQueries(station) {
  const baseParts = [station.name, station.area, station.brand, "Lagos", "Nigeria"];
  const addressParts = [station.address || station.fullAddress, station.area, "Lagos", "Nigeria"];
  const brandParts = [station.brand, station.name, station.area, "filling station", "Lagos", "Nigeria"];

  return [...new Set([
    compactAddress(baseParts),
    compactAddress(brandParts),
    compactAddress(addressParts)
  ].filter(Boolean))];
}

function nominatimUserAgent() {
  return process.env.NOMINATIM_USER_AGENT
    || `FuelStationProject/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "local-address-cleanup"})`;
}

function normalizeNominatimResult(result) {
  const address = result.address || {};
  const lat = Number(result.lat);
  const lng = Number(result.lon);

  return {
    provider: "nominatim",
    formattedAddress: result.display_name || "",
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    placeId: result.place_id ? String(result.place_id) : null,
    osmType: result.osm_type || null,
    osmId: result.osm_id ? String(result.osm_id) : null,
    category: result.category || result.class || null,
    type: result.type || null,
    importance: Number(result.importance) || 0,
    boundingBox: result.boundingbox || null,
    namedetails: result.namedetails || {},
    address,
    nearbyLocationDetails: {
      houseNumber: address.house_number || "",
      road: address.road || address.pedestrian || address.footway || "",
      neighbourhood: address.neighbourhood || address.quarter || "",
      suburb: address.suburb || "",
      city: address.city || address.town || address.village || address.municipality || "",
      county: address.county || "",
      state: address.state || "",
      postcode: address.postcode || "",
      country: address.country || "",
      countryCode: address.country_code || "",
      landmark: address.amenity || address.shop || address.tourism || ""
    },
    raw: result
  };
}

function normalizeGoogleResult(result) {
  const location = result.geometry?.location || {};
  const addressComponents = Array.isArray(result.address_components) ? result.address_components : [];
  const byType = type => {
    const component = addressComponents.find(item => Array.isArray(item.types) && item.types.includes(type));
    return component?.long_name || "";
  };

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const locationType = result.geometry?.location_type || "";
  const locationTypeScores = {
    ROOFTOP: 0.93,
    RANGE_INTERPOLATED: 0.8,
    GEOMETRIC_CENTER: 0.67,
    APPROXIMATE: 0.52
  };
  const confidence = clampScore(locationTypeScores[locationType] || 0.45);

  return {
    provider: "google",
    formattedAddress: result.formatted_address || "",
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    placeId: result.place_id || null,
    osmType: null,
    osmId: null,
    category: "google_place",
    type: locationType ? locationType.toLowerCase() : null,
    importance: confidence,
    boundingBox: result.geometry?.viewport || null,
    namedetails: {
      mainText: byType("premise") || byType("establishment") || byType("route") || ""
    },
    address: {
      house_number: byType("street_number"),
      road: byType("route"),
      neighbourhood: byType("sublocality") || byType("sublocality_level_1"),
      suburb: byType("locality"),
      city: byType("administrative_area_level_2") || byType("locality"),
      county: byType("administrative_area_level_2"),
      state: byType("administrative_area_level_1"),
      postcode: byType("postal_code"),
      country: byType("country"),
      country_code: "ng"
    },
    nearbyLocationDetails: {
      houseNumber: byType("street_number"),
      road: byType("route"),
      neighbourhood: byType("sublocality") || byType("sublocality_level_1"),
      suburb: byType("locality"),
      city: byType("administrative_area_level_2") || byType("locality"),
      county: byType("administrative_area_level_2"),
      state: byType("administrative_area_level_1"),
      postcode: byType("postal_code"),
      country: byType("country"),
      countryCode: "ng",
      landmark: byType("point_of_interest") || byType("establishment")
    },
    raw: result
  };
}

function createNominatimProvider({ delayMs }) {
  let lastRequestAt = 0;

  return {
    name: PROVIDERS.nominatim.name,
    async geocode(query) {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < delayMs) {
        await sleep(delayMs - elapsed);
      }

      const url = new URL(PROVIDERS.nominatim.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("countrycodes", "ng");
      url.searchParams.set("limit", "6");
      url.searchParams.set("viewbox", LAGOS_VIEWBOX);
      url.searchParams.set("bounded", "1");

      const contactEmail = process.env.NOMINATIM_CONTACT_EMAIL;
      if (contactEmail) url.searchParams.set("email", contactEmail);

      lastRequestAt = Date.now();
      let response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            "Accept": "application/json",
            "Accept-Language": "en",
            "User-Agent": nominatimUserAgent()
          }
        });
      } catch (error) {
        throw new Error(`Nominatim request failed before response: ${error.cause?.message || error.message}`);
      }

      if (response.status === 429) {
        throw new Error("Nominatim rate limit reached; retry later or increase --delay-ms");
      }
      if (response.status === 403) {
        throw new Error("Nominatim denied the request; set NOMINATIM_USER_AGENT or NOMINATIM_CONTACT_EMAIL");
      }
      if (!response.ok) {
        throw new Error(`Nominatim request failed with ${response.status}`);
      }

      const payload = await response.json();
      return Array.isArray(payload) ? payload.map(normalizeNominatimResult) : [];
    }
  };
}

function createGoogleProvider({ delayMs }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is required for --provider google");
  }

  let lastRequestAt = 0;
  return {
    name: PROVIDERS.google.name,
    async geocode(query) {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < delayMs) {
        await sleep(delayMs - elapsed);
      }

      const url = new URL(PROVIDERS.google.baseUrl);
      url.searchParams.set("address", query);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("region", "ng");
      url.searchParams.set("components", "country:NG");
      url.searchParams.set("language", "en");

      lastRequestAt = Date.now();
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Google geocode request failed with ${response.status}`);
      }
      const payload = await response.json();
      if (payload.status === "OVER_QUERY_LIMIT") {
        throw new Error("Google API rate limit reached; retry later or increase --delay-ms");
      }
      if (payload.status === "REQUEST_DENIED" || payload.status === "INVALID_REQUEST") {
        throw new Error(payload.error_message || `Google geocode request denied: ${payload.status}`);
      }
      if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
        throw new Error(`Google geocode request failed: ${payload.status}`);
      }

      return Array.isArray(payload.results) ? payload.results.map(normalizeGoogleResult) : [];
    }
  };
}

function createGeocoderProvider(args) {
  if (args.provider === "google") return createGoogleProvider(args);
  if (args.provider === "nominatim") return createNominatimProvider(args);

  throw new Error(`Unsupported geocoding provider: ${args.provider}`);
}

function scoreGeocode(station, candidate, query) {
  const formattedAddress = candidate.formattedAddress || "";
  const nearby = candidate.nearbyLocationDetails || {};
  const searchableResult = [
    formattedAddress,
    nearby.road,
    nearby.neighbourhood,
    nearby.suburb,
    nearby.city,
    nearby.county,
    nearby.state,
    nearby.landmark,
    candidate.type,
    candidate.category,
    Object.values(candidate.namedetails || {}).join(" ")
  ].join(" ");

  const resultTokens = tokenSet(searchableResult);
  const queryTokens = tokenSet(query);
  const stationNameTokens = tokenSet(station.name);
  const brandTokens = tokenSet(station.brand);
  const areaTokens = tokenSet(station.area);
  const addressTokens = tokenSet(station.address || station.fullAddress);

  const queryMatch = overlapRatio(queryTokens, resultTokens);
  const nameMatch = overlapRatio(stationNameTokens, resultTokens);
  const brandMatch = overlapRatio(brandTokens, resultTokens);
  const areaMatch = overlapRatio(areaTokens, resultTokens);
  const addressMatch = overlapRatio(addressTokens, resultTokens);

  const normalizedResult = normalizeText(searchableResult);
  const normalizedCountry = normalizeText(nearby.countryCode || nearby.country);
  const category = normalizeText(candidate.category);
  const type = normalizeText(candidate.type);

  const fuelTypeBonus = category === "amenity" && type === "fuel" ? 0.18 : 0;
  const stationWordBonus = ["fuel", "filling", "petrol", "gas", "service"].some(token => resultTokens.has(token)) ? 0.06 : 0;
  const lagosBonus = normalizedResult.includes("lagos") || normalizeText(nearby.state).includes("lagos") ? 0.08 : 0;
  const nigeriaBonus = normalizedCountry === "ng" || normalizedResult.includes("nigeria") ? 0.05 : 0;
  const importanceBonus = Math.min(candidate.importance || 0, 0.5) * 0.08;
  const missingCoordinatePenalty = candidate.latitude === null || candidate.longitude === null ? 0.25 : 0;

  const rawScore =
    0.28 * queryMatch +
    0.2 * nameMatch +
    0.14 * brandMatch +
    0.16 * areaMatch +
    0.09 * addressMatch +
    fuelTypeBonus +
    stationWordBonus +
    lagosBonus +
    nigeriaBonus +
    importanceBonus -
    missingCoordinatePenalty;

  return clampScore(rawScore);
}

async function findBestResult(provider, station) {
  const queries = stationSearchQueries(station);
  let best = null;
  const attempts = [];

  for (const query of queries) {
    const results = await provider.geocode(query);
    const scoredResults = results.map(result => ({
      result,
      score: scoreGeocode(station, result, query)
    }));

    attempts.push({
      query,
      resultCount: results.length,
      bestScore: scoredResults.length ? Number(Math.max(...scoredResults.map(item => item.score)).toFixed(3)) : 0
    });

    for (const scored of scoredResults) {
      if (!best || scored.score > best.score) {
        best = { ...scored, query, candidateCount: results.length };
      }
    }
  }

  return { best, attempts };
}

function reportEntryForNoResult(station, attempts) {
  return {
    stationId: station._id,
    name: station.name,
    brand: station.brand || "",
    area: station.area || "",
    confidence: 0,
    status: "no-result",
    reviewRequired: true,
    attempts,
    oldAddress: station.fullAddress || station.address || "",
    newAddress: "",
    oldLat: station.location?.lat ?? station.latitude ?? null,
    oldLng: station.location?.lng ?? station.longitude ?? null,
    newLat: null,
    newLng: null,
    nearbyLocationDetails: null
  };
}

function buildReportEntry(station, best, threshold, providerName) {
  const { result, score, query, candidateCount } = best;
  const oldLat = Number(station.location?.lat ?? station.latitude);
  const oldLng = Number(station.location?.lng ?? station.longitude);
  const highConfidence = score >= threshold;

  return {
    stationId: station._id,
    name: station.name,
    brand: station.brand || "",
    area: station.area || "",
    confidence: Number(score.toFixed(3)),
    status: highConfidence ? "high-confidence" : "manual-review",
    reviewRequired: !highConfidence,
    provider: providerName,
    query,
    candidateCount,
    oldAddress: station.fullAddress || station.address || "",
    newAddress: result.formattedAddress,
    oldLat: Number.isFinite(oldLat) ? oldLat : null,
    oldLng: Number.isFinite(oldLng) ? oldLng : null,
    newLat: result.latitude,
    newLng: result.longitude,
    osmType: result.osmType,
    osmId: result.osmId,
    category: result.category,
    type: result.type,
    nearbyLocationDetails: result.nearbyLocationDetails
  };
}

function buildHighConfidenceUpdate(station, entry, best) {
  const { result } = best;

  return {
    updateOne: {
      filter: { _id: station._id },
      update: {
        $set: {
          fullAddress: entry.newAddress,
          address: entry.newAddress,
          latitude: entry.newLat,
          longitude: entry.newLng,
          location: { lat: entry.newLat, lng: entry.newLng },
          nearbyLocationDetails: entry.nearbyLocationDetails,
          geocodeMeta: {
            source: entry.provider,
            provider: best.result.provider || entry.provider,
            confidence: entry.confidence,
            status: entry.status,
            query: entry.query,
            candidateCount: entry.candidateCount,
            osmType: result.osmType,
            osmId: result.osmId,
            placeId: result.placeId,
            category: result.category,
            type: result.type,
            updatedAt: new Date()
          },
          geocodeReview: null
        }
      }
    }
  };
}

function buildManualReviewUpdate(station, entry, best) {
  return {
    updateOne: {
      filter: { _id: station._id },
      update: {
        $set: {
          geocodeReview: {
            status: "pending",
            reason: entry.status,
            confidence: entry.confidence,
            provider: best?.result?.provider || entry.provider || "unknown",
            query: entry.query || null,
            candidate: best ? {
              fullAddress: entry.newAddress,
              latitude: entry.newLat,
              longitude: entry.newLng,
              nearbyLocationDetails: entry.nearbyLocationDetails,
              osmType: entry.osmType,
              osmId: entry.osmId,
              category: entry.category,
              type: entry.type
            } : null,
            reviewedAt: null,
            createdAt: new Date()
          }
        }
      }
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = createGeocoderProvider(args);
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const collection = client.db(dbName).collection(collectionName);
    const stations = await collection.find({}, {
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
    let subset = args.limit ? stations.slice(0, args.limit) : stations;
    let failedSelectionMeta = null;
    if (args.failedReport) {
      const { stationIds, reportPath } = parseFailedStationIdsFromReport(args.failedReport);
      const idSet = new Set(stationIds);
      subset = subset.filter(station => idSet.has(String(station._id)));
      failedSelectionMeta = {
        sourceReport: reportPath,
        requestedFailedStationIds: stationIds.length,
        matchedStations: subset.length
      };
    }

    const report = [];
    const updates = [];
    let failures = 0;

    for (const station of subset) {
      try {
        const { best, attempts } = await findBestResult(provider, station);
        if (!best) {
          const entry = reportEntryForNoResult(station, attempts);
          report.push(entry);
          if (args.apply) updates.push(buildManualReviewUpdate(station, entry, null));
          continue;
        }

        const entry = buildReportEntry(station, best, args.threshold, provider.name);
        entry.attempts = attempts;
        report.push(entry);

        if (args.apply) {
          const hasCoordinates = Number.isFinite(entry.newLat) && Number.isFinite(entry.newLng);
          updates.push(entry.status === "high-confidence" && hasCoordinates
            ? buildHighConfidenceUpdate(station, entry, best)
            : buildManualReviewUpdate(station, entry, best));
        }
      } catch (error) {
        failures += 1;
        report.push({
          stationId: station._id,
          name: station.name,
          brand: station.brand || "",
          area: station.area || "",
          confidence: 0,
          status: "error",
          reviewRequired: true,
          error: error.message
        });
      }
    }

    if (args.apply && updates.length) {
      await collection.bulkWrite(updates, { ordered: false });
    }

    const summary = {
      mode: args.apply ? "apply" : "dry-run",
      provider: provider.name,
      threshold: args.threshold,
      scanned: subset.length,
      highConfidence: report.filter(item => item.status === "high-confidence").length,
      manualReview: report.filter(item => item.reviewRequired).length,
      noResult: report.filter(item => item.status === "no-result").length,
      errors: failures,
      updatesApplied: args.apply ? updates.length : 0,
      failedSelection: failedSelectionMeta
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
