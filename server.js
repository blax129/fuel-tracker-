const express = require("express");
const path = require("path");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongodbPackage = require("mongodb/package.json");

const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(__dirname));

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "fuelTracker";
const isAtlasConnection = uri.startsWith("mongodb+srv://") || uri.includes(".mongodb.net");
const mongoClientOptions = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  appName: "fuel-tracker",
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true
  }
};

if (isAtlasConnection) {
  mongoClientOptions.tls = true;
}

const client = new MongoClient(uri, mongoClientOptions);

const SECRET = "super_secret_key_123";
let db;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const GOOGLE_DEFAULT_REGION = process.env.GOOGLE_MAPS_REGION || "ng";
const GOOGLE_DEFAULT_LANGUAGE = process.env.GOOGLE_MAPS_LANGUAGE || "en";
const LAGOS_BIAS = "circle:35000@6.5244,3.3792";
const GOOGLE_RATE_LIMIT = {
  maxRequests: Number(process.env.GOOGLE_PROXY_RATE_MAX || 10),
  perMs: Number(process.env.GOOGLE_PROXY_RATE_WINDOW_MS || 1000)
};
const googleRequestTimestamps = [];
const googleAutocompleteCache = new Map();

const FUEL_PRODUCTS = [
  { key: "pms", label: "Petrol", code: "PMS" },
  { key: "ago", label: "Diesel", code: "AGO" },
  { key: "dpk", label: "Kerosene", code: "DPK" },
  { key: "lpg", label: "Cooking Gas", code: "LPG" }
];

const VALID_AVAILABILITY_STATUSES = new Set(["Available", "Low Stock", "Out of Stock"]);
const VALID_EV_AVAILABILITY_STATUSES = new Set(["Available", "Limited", "Unavailable", "Out of Service"]);
const VALID_QUEUE_LEVELS = new Set(["short", "medium", "long"]);
const VALID_REPORT_SOURCE_TYPES = new Set(["owner", "user", "system"]);
const OWNER_ACCOUNT_STATUSES = new Set(["pending", "approved", "rejected", "suspended"]);

function legacyAvailabilityToStatus(value) {
  if (value === true) return "Available";
  if (value === false) return "Out of Stock";
  return "Out of Stock";
}

function normalizeProductEntry(entry = {}, fallback = {}) {
  const priceValue = entry.price ?? fallback.price ?? null;
  const price = priceValue === "" || priceValue === null || priceValue === undefined
    ? null
    : Number(priceValue);
  const status = entry.status || fallback.status || legacyAvailabilityToStatus(fallback.fuelAvailable);
  const lastUpdated = entry.lastUpdated || fallback.lastUpdated || fallback.createdAt || null;

  return {
    price: Number.isFinite(price) ? price : null,
    status: VALID_AVAILABILITY_STATUSES.has(status) ? status : "Out of Stock",
    lastUpdated
  };
}

function normalizeProducts(products = {}, fallback = {}) {
  return FUEL_PRODUCTS.reduce((acc, product) => {
    acc[product.key] = normalizeProductEntry(products?.[product.key], fallback[product.key] || fallback);
    return acc;
  }, {});
}

function normalizeEvCharging(evCharging = {}, fallback = {}) {
  const source = evCharging || {};
  const priceValue = source.pricePerKwh ?? source.pricePerKWh ?? source.price ?? fallback.pricePerKwh ?? null;
  const pricePerKwh = priceValue === "" || priceValue === null || priceValue === undefined
    ? null
    : Number(priceValue);
  const portsValue = source.availablePorts ?? source.ports ?? fallback.availablePorts ?? null;
  const availablePorts = portsValue === "" || portsValue === null || portsValue === undefined
    ? null
    : Number(portsValue);
  const availability = source.availability || fallback.availability || "Unavailable";
  const enabled = Boolean(source.enabled ?? fallback.enabled ?? availability !== "Unavailable");

  return {
    enabled,
    availability: VALID_EV_AVAILABILITY_STATUSES.has(availability) ? availability : "Unavailable",
    chargerType: source.chargerType || fallback.chargerType || "Fast Charger",
    pricePerKwh: Number.isFinite(pricePerKwh) ? pricePerKwh : null,
    availablePorts: Number.isFinite(availablePorts) ? Math.max(0, Math.floor(availablePorts)) : null,
    lastUpdated: source.lastUpdated || fallback.lastUpdated || fallback.createdAt || null
  };
}

function normalizeStationProducts(station) {
  const latestReport = station.latestReport || {};
  const fallback = {
    price: latestReport.price ?? station.price,
    fuelAvailable: latestReport.fuelAvailable ?? station.fuelAvailable,
    lastUpdated: latestReport.createdAt ?? station.lastUpdated
  };
  const productFallbacks = FUEL_PRODUCTS.reduce((acc, product) => {
    acc[product.key] = product.key === "pms"
      ? fallback
      : { lastUpdated: station.lastUpdated ?? latestReport.createdAt ?? null };
    return acc;
  }, {});

  return {
    ...station,
    products: normalizeProducts(latestReport.products || station.products, productFallbacks),
    evCharging: normalizeEvCharging(latestReport.evCharging || station.evCharging, {
      ...(station.evCharging || {}),
      lastUpdated: latestReport.evCharging?.lastUpdated || latestReport.createdAt || station.evCharging?.lastUpdated || station.lastUpdated
    }),
    latestReport: latestReport
      ? {
          ...latestReport,
          products: normalizeProducts(latestReport.products, productFallbacks),
          evCharging: normalizeEvCharging(latestReport.evCharging, {
            ...(station.evCharging || {}),
            lastUpdated: latestReport.createdAt
          })
        }
      : latestReport
  };
}

function getPmsFromProducts(products = {}) {
  return normalizeProductEntry(products.pms);
}

function getAgoFromProducts(products = {}) {
  return normalizeProductEntry(products.ago);
}

function booleanOrNull(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function objectIdOrNull(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function normalizeOwnerStatus(value, fallback = "pending") {
  const normalized = String(value || "").trim().toLowerCase();
  const statusMap = {
    "pending verification": "pending",
    approved: "approved",
    pending: "pending",
    rejected: "rejected",
    suspended: "suspended"
  };
  const status = statusMap[normalized] || fallback;
  return OWNER_ACCOUNT_STATUSES.has(status) ? status : fallback;
}

function getOwnerStatus(user = {}) {
  if (user.role === "station" && !user.status && !user.accountStatus) {
    return "approved";
  }

  return normalizeOwnerStatus(user.status || user.accountStatus);
}

async function getCurrentUserFromToken(req) {
  const userId = objectIdOrNull(req.user?.userId);
  if (!userId) return null;
  return db.collection("users").findOne({ _id: userId });
}

async function requireApprovedOwnerAccount(req, res) {
  const currentUser = await getCurrentUserFromToken(req);

  if (!currentUser || !["station", "station_owner"].includes(currentUser.role)) {
    res.status(403).json({ message: "Station owner account required" });
    return null;
  }

  const status = getOwnerStatus(currentUser);
  if (status !== "approved") {
    res.status(403).json({ message: "Station account is not approved" });
    return null;
  }

  return currentUser;
}

async function requireAdminAccount(req, res) {
  const currentUser = await getCurrentUserFromToken(req);
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ message: "Admin account required" });
    return null;
  }

  return currentUser;
}

function withProductShortcuts(products = {}, body = {}) {
  const mergedProducts = { ...(products || {}) };
  const petrolPrice = body.petrolPrice ?? body.price;
  const dieselPrice = body.dieselPrice;

  if (petrolPrice !== undefined || body.fuelAvailable !== undefined) {
    mergedProducts.pms = {
      ...(mergedProducts.pms || {}),
      price: petrolPrice ?? mergedProducts.pms?.price,
      status: mergedProducts.pms?.status || (
        body.fuelAvailable === undefined
          ? undefined
          : (booleanOrNull(body.fuelAvailable) ? "Available" : "Out of Stock")
      )
    };
  }

  if (dieselPrice !== undefined) {
    mergedProducts.ago = {
      ...(mergedProducts.ago || {}),
      price: dieselPrice
    };
  }

  return mergedProducts;
}

async function saveFuelReport({ stationId, body, user, sourceType }) {
  if (!VALID_REPORT_SOURCE_TYPES.has(sourceType)) {
    const error = new Error("Invalid report source type");
    error.status = 400;
    throw error;
  }

  const stationObjectId = objectIdOrNull(stationId);
  if (!stationObjectId) {
    const error = new Error("Valid stationId is required");
    error.status = 400;
    throw error;
  }

  const station = await db.collection("stations").findOne({ _id: stationObjectId });
  if (!station) {
    const error = new Error("Station not found");
    error.status = 404;
    throw error;
  }

  const previousLatestReport = await db.collection("reports").findOne(
    { stationId: stationObjectId },
    { sort: { createdAt: -1, _id: -1 } }
  );

  const now = new Date();
  const reportProducts = withProductShortcuts(body.products, body);
  const normalizedProducts = normalizeProducts(reportProducts, {
    pms: {
      price: body.petrolPrice ?? body.price,
      fuelAvailable: body.fuelAvailable,
      lastUpdated: now
    },
    ago: {
      price: body.dieselPrice,
      lastUpdated: now
    }
  });
  const pmsProduct = getPmsFromProducts(normalizedProducts);
  const agoProduct = getAgoFromProducts(normalizedProducts);
  const normalizedEvCharging = normalizeEvCharging(body.evCharging, {
    lastUpdated: now
  });
  const queueLevel = VALID_QUEUE_LEVELS.has(body.queueLevel) ? body.queueLevel : null;
  const submittedById = objectIdOrNull(user?.userId || user?._id);

  const newReport = {
    stationId: stationObjectId,
    sourceType,
    source: sourceType,
    submittedBy: {
      userId: submittedById,
      role: user?.role || sourceType
    },
    userId: submittedById,
    products: normalizedProducts,
    evCharging: normalizedEvCharging,
    petrolPrice: pmsProduct.price,
    dieselPrice: agoProduct.price,
    price: pmsProduct.price,
    fuelAvailable: pmsProduct.status === "Available" || pmsProduct.status === "Low Stock",
    isOpen: booleanOrNull(body.isOpen),
    queueLevel,
    createdAt: now
  };

  await db.collection("reports").insertOne(newReport);

  const previousProducts = normalizeProducts(previousLatestReport?.products, {
    pms: {
      price: previousLatestReport?.petrolPrice ?? previousLatestReport?.price,
      fuelAvailable: previousLatestReport?.fuelAvailable,
      lastUpdated: previousLatestReport?.createdAt
    }
  });
  const shouldCreateFuelAlert =
    previousLatestReport &&
    previousProducts.pms.status === "Out of Stock" &&
    normalizedProducts.pms.status !== "Out of Stock";

  if (shouldCreateFuelAlert) {
    await db.collection("alerts").insertOne({
      stationId: stationObjectId,
      message: "Fuel available now",
      createdAt: now
    });
  }

  return newReport;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyGoogleRateLimit() {
  const now = Date.now();
  while (googleRequestTimestamps.length && now - googleRequestTimestamps[0] > GOOGLE_RATE_LIMIT.perMs) {
    googleRequestTimestamps.shift();
  }

  if (googleRequestTimestamps.length < GOOGLE_RATE_LIMIT.maxRequests) {
    googleRequestTimestamps.push(now);
    return;
  }

  const waitFor = GOOGLE_RATE_LIMIT.perMs - (now - googleRequestTimestamps[0]) + 15;
  if (waitFor > 0) await wait(waitFor);
  return applyGoogleRateLimit();
}

function isGoogleConfigured() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

function normalizeGoogleGeocodeResult(item = {}) {
  const location = item.geometry?.location || {};
  const locationType = item.geometry?.location_type || "";
  const types = Array.isArray(item.types) ? item.types : [];
  const partialMatch = Boolean(item.partial_match);
  const hasStreetAddress = types.some(type => ["street_address", "premise", "subpremise", "route"].includes(type));
  const locationTypeScores = {
    ROOFTOP: 0.92,
    RANGE_INTERPOLATED: 0.78,
    GEOMETRIC_CENTER: 0.67,
    APPROXIMATE: 0.52
  };
  const base = locationTypeScores[locationType] || 0.45;
  const confidence = clampConfidence(
    base +
    (hasStreetAddress ? 0.06 : 0) -
    (partialMatch ? 0.08 : 0)
  );

  return {
    fullAddress: item.formatted_address || "",
    latitude: Number(location.lat),
    longitude: Number(location.lng),
    placeId: item.place_id || null,
    confidence,
    geocodeStatus: confidence >= 0.8 ? "high-confidence" : confidence >= 0.6 ? "medium-confidence" : "low-confidence",
    source: "google_geocoding",
    locationType,
    types
  };
}

async function googleApiGet(baseUrl, queryParams = {}, { retries = 2 } = {}) {
  if (!isGoogleConfigured()) {
    const error = new Error("Google Maps API key is not configured on the server.");
    error.code = "GOOGLE_KEY_MISSING";
    throw error;
  }

  let attempt = 0;
  while (attempt <= retries) {
    attempt += 1;
    await applyGoogleRateLimit();

    const url = new URL(baseUrl);
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) {
      if (response.status >= 500 && attempt <= retries) {
        await wait(150 * attempt);
        continue;
      }
      throw new Error(`Google API request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (payload.status === "OVER_QUERY_LIMIT" && attempt <= retries) {
      await wait(220 * attempt);
      continue;
    }

    if (payload.status && payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
      throw new Error(payload.error_message || `Google API returned ${payload.status}`);
    }

    return payload;
  }

  throw new Error("Google API retries exhausted");
}

async function geocodeAddressWithFallback(query) {
  if (!query || !query.trim()) return null;
  try {
    const payload = await googleApiGet(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        address: query,
        region: GOOGLE_DEFAULT_REGION,
        language: GOOGLE_DEFAULT_LANGUAGE,
        components: "country:NG"
      }
    );
    if (!Array.isArray(payload.results) || !payload.results.length) return null;
    return normalizeGoogleGeocodeResult(payload.results[0]);
  } catch (error) {
    return null;
  }
}

async function connectDB() {
  try {
    console.log("MongoDB connection attempt starting...");
    console.log(`Connecting to MongoDB database "${dbName}"...`);
    console.log(`MongoDB driver version: ${mongodbPackage.version}`);
    console.log(`MongoDB connection type: ${isAtlasConnection ? "Atlas/TLS" : "local/standard"}`);
    console.log(`MongoDB Server API version: ${ServerApiVersion.v1}`);
    console.log(`MongoDB TLS enabled: ${Boolean(mongoClientOptions.tls)}`);

    console.log("Opening MongoDB client connection...");
    await client.connect();
    console.log("MongoDB client connected. Selecting database...");
    db = client.db(dbName);
    console.log("Pinging MongoDB database...");
    await db.command({ ping: 1 });
    await db.collection("reports").createIndex({ stationId: 1, createdAt: -1 });
    console.log(`Connected to MongoDB database "${dbName}"`);
  } catch (err) {
    db = null;
    console.error("MongoDB connection error:", {
      name: err.name,
      code: err.code,
      codeName: err.codeName,
      message: err.message
    });
    console.error(err);
    console.error(err.stack);
    throw err;
  }
}

function requireDb(req, res, next) {
  if (!db) {
    console.error("MongoDB is not connected; rejecting request:", req.method, req.originalUrl);
    return res.status(503).json({ message: "Database is not connected. Please try again shortly." });
  }

  next();
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || [
    "/stations",
    "/reports",
    "/alerts",
    "/register",
    "/login",
    "/partner/signup",
    "/partner/login",
    "/partner/me",
    "/partner/station-profile",
    "/partner/logout"
  ].includes(req.path)) {
    return requireDb(req, res, next);
  }

  next();
});


// 🔐 AUTH MIDDLEWARE (WITH DEBUG STEP 2)
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  console.log("👉 FULL HEADER:", authHeader); // STEP 2 DEBUG

  if (!authHeader) {
    console.log("❌ No header received");
    return res.status(401).json({ message: "No token provided" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    console.log("❌ Wrong format:", authHeader);
    return res.status(401).json({ message: "Invalid token format" });
  }

  const token = authHeader.split(" ")[1];

  console.log("👉 EXTRACTED TOKEN:", token); // STEP 2 DEBUG

  try {
    const decoded = jwt.verify(token, SECRET);

    console.log("✅ DECODED:", decoded); // STEP 2 DEBUG

    req.user = decoded;
    req.authToken = token;
    next();

  } catch (err) {
    console.log("❌ VERIFY ERROR:", err.message); // STEP 2 DEBUG
    return res.status(401).json({ message: "Invalid token" });
  }
}

function parseCookies(req) {
  return (req.headers.cookie || "").split(";").reduce((acc, pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function partnerDashboardGuard(req, res, next) {
  const token = parseCookies(req).partnerToken;
  if (!token) {
    return res.redirect("/partner/login");
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    if (!["station_owner", "station"].includes(decoded.role)) {
      return res.redirect("/partner/login");
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie("partnerToken");
    return res.redirect("/partner/login");
  }
}


// ✅ GET STATIONS
app.get("/stations", async (req, res) => {
  try {
    console.log("PUBLIC STATIONS DEBUG: request received", {
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(req.headers.authorization)
    });

    const data = await db.collection("stations").aggregate([
      {
        $lookup: {
          from: "reports",
          let: { stationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$stationId", "$$stationId"] }
              }
            },
            { $sort: { createdAt: -1, _id: -1 } },
            { $limit: 2 }
          ],
          as: "reportHistory"
        }
      },
      {
        $addFields: {
          latestReport: { $arrayElemAt: ["$reportHistory", 0] },
          previousReport: { $arrayElemAt: ["$reportHistory", 1] }
        }
      },
      {
        $addFields: {
          fullAddress: { $ifNull: ["$fullAddress", "$address"] },
          latitude: { $ifNull: ["$latitude", { $ifNull: ["$location.lat", "$location.latitude"] }] },
          longitude: { $ifNull: ["$longitude", { $ifNull: ["$location.lng", "$location.longitude"] }] },
          fuelAvailable: { $ifNull: ["$latestReport.fuelAvailable", "$fuelAvailable"] },
          price: { $ifNull: ["$latestReport.price", "$price"] },
          lastUpdated: { $ifNull: ["$latestReport.createdAt", "$lastUpdated"] }
        }
      },
      {
        $project: {
          reportHistory: 0
        }
      }
    ]).toArray();

    const stations = data.map(normalizeStationProducts);
    console.log("PUBLIC STATIONS DEBUG: returning station count", stations.length);
    res.set("Cache-Control", "no-store");
    res.json(stations);
  } catch (err) {
    console.error("PUBLIC STATIONS DEBUG: station fetch failed", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ POST REPORT (PROTECTED 🔒)
app.post("/reports", authMiddleware, async (req, res) => {
  try {
    const isOwnerAccount = ["station", "station_owner"].includes(req.user.role);
    let effectiveStationId = req.body.stationId;
    let currentUser = null;

    if (isOwnerAccount) {
      currentUser = await requireApprovedOwnerAccount(req, res);
      if (!currentUser) return;
      effectiveStationId = currentUser.stationId;
    }

    if (isOwnerAccount && !effectiveStationId) {
      return res.status(400).json({ message: "stationId is required for station accounts" });
    }

    const report = await saveFuelReport({
      stationId: effectiveStationId,
      body: req.body,
      user: currentUser || req.user,
      sourceType: isOwnerAccount ? "owner" : "user"
    });

    res.json({ message: "Report saved successfully", reportId: report._id });

  } catch (err) {
    console.error("❌ REPORT ERROR:", err);
    res.status(err.status || 500).json({ message: err.status ? err.message : "Server error" });
  }
});

// ✅ OFFICIAL OWNER UPDATE (PROTECTED 🔒)
app.post("/api/owner/reports", authMiddleware, async (req, res) => {
  try {
    const currentUser = await requireApprovedOwnerAccount(req, res);
    if (!currentUser) return;

    if (!currentUser.stationId) {
      return res.status(400).json({ message: "No station is linked to this owner account" });
    }

    const report = await saveFuelReport({
      stationId: currentUser.stationId,
      body: req.body,
      user: currentUser,
      sourceType: "owner"
    });

    res.json({ message: "Official station update saved", reportId: report._id });
  } catch (err) {
    console.error("❌ OWNER REPORT ERROR:", err);
    res.status(err.status || 500).json({ message: err.status ? err.message : "Server error" });
  }
});

function publicOwnerForAdmin(user = {}) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: getOwnerStatus(user),
    accountStatus: getOwnerStatus(user),
    stationName: user.stationDraft?.name || null,
    stationAddress: user.stationDraft?.address || user.address || null,
    fuelBrand: user.stationDraft?.brand || null,
    stationId: user.stationId || null,
    createdAt: user.createdAt || null
  };
}

async function updateOwnerStatus(req, res, status) {
  const admin = await requireAdminAccount(req, res);
  if (!admin) return null;

  const ownerId = objectIdOrNull(req.params.id);
  if (!ownerId) {
    res.status(400).json({ message: "Valid owner id is required" });
    return null;
  }

  const result = await db.collection("users").findOneAndUpdate(
    {
      _id: ownerId,
      role: { $in: ["station_owner", "station"] }
    },
    {
      $set: {
        status,
        accountStatus: status,
        reviewedAt: new Date(),
        reviewedBy: admin._id
      }
    },
    { returnDocument: "after", projection: { password: 0 } }
  );

  if (!result) {
    res.status(404).json({ message: "Owner account not found" });
    return null;
  }

  return result;
}

// ✅ ADMIN OWNER APPROVAL ROUTES (PROTECTED 🔒)
app.get("/api/admin/pending-owners", authMiddleware, async (req, res) => {
  try {
    const admin = await requireAdminAccount(req, res);
    if (!admin) return;

    const owners = await db.collection("users").find({
      role: { $in: ["station_owner", "station"] },
      $or: [
        { status: "pending" },
        { accountStatus: "pending" },
        { accountStatus: "Pending Verification" }
      ]
    }, {
      projection: { password: 0 },
      sort: { createdAt: -1 }
    }).toArray();

    res.json(owners.map(publicOwnerForAdmin));
  } catch (err) {
    console.error("ADMIN PENDING OWNERS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/admin/approve-owner/:id", authMiddleware, async (req, res) => {
  try {
    const owner = await updateOwnerStatus(req, res, "approved");
    if (!owner) return;
    res.json({ message: "Owner approved", owner: publicOwnerForAdmin(owner) });
  } catch (err) {
    console.error("ADMIN APPROVE OWNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/admin/reject-owner/:id", authMiddleware, async (req, res) => {
  try {
    const owner = await updateOwnerStatus(req, res, "rejected");
    if (!owner) return;
    res.json({ message: "Owner rejected", owner: publicOwnerForAdmin(owner) });
  } catch (err) {
    console.error("ADMIN REJECT OWNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/admin/suspend-owner/:id", authMiddleware, async (req, res) => {
  try {
    const owner = await updateOwnerStatus(req, res, "suspended");
    if (!owner) return;
    res.json({ message: "Owner suspended", owner: publicOwnerForAdmin(owner) });
  } catch (err) {
    console.error("ADMIN SUSPEND OWNER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ GET ALERTS
app.get("/alerts", async (req, res) => {
  try {
    const alerts = await db.collection("alerts").aggregate([
      {
        $lookup: {
          from: "stations",
          localField: "stationId",
          foreignField: "_id",
          as: "station"
        }
      },
      {
        $unwind: {
          path: "$station",
          preserveNullAndEmptyArrays: true
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          stationId: 1,
          message: 1,
          createdAt: 1,
          stationName: "$station.name",
          area: "$station.area"
        }
      }
    ]).toArray();

    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ REGISTER
app.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, role, stationId, area, address, location } = req.body;
    const assignedRole = role || "user";
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const normalizedPhone = phone ? phone.trim() : null;

    if (!["station", "station_owner"].includes(assignedRole)) {
      return res.status(410).json({
        message: "Public accounts are no longer required. Station owners should use /partner/signup."
      });
    }

    if ((!normalizedEmail && !normalizedPhone) || !password) {
      return res.status(400).json({ message: "Email or phone, and password are required" });
    }

    if (assignedRole === "station" && !stationId) {
      return res.status(400).json({ message: "stationId is required for station accounts" });
    }

    const duplicateChecks = [];
    if (normalizedEmail) duplicateChecks.push({ email: normalizedEmail });
    if (normalizedPhone) duplicateChecks.push({ phone: normalizedPhone });

    const existingUser = await db.collection("users").findOne({ $or: duplicateChecks });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name: name || normalizedEmail?.split("@")[0] || normalizedPhone || "Fuel Tracker User",
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      role: assignedRole,
      stationId: stationId ? new ObjectId(stationId) : null,
      area: area || null,
      address: address || null,
      location: location || null,
      createdAt: new Date()
    };

    await db.collection("users").insertOne(newUser);

    res.json({ message: "User registered successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginId = (identifier || email || phone || "").trim();

    if (!loginId || !password) {
      return res.status(400).json({ message: "Email or phone, and password are required" });
    }

    const user = await db.collection("users").findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { phone: loginId }
      ]
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid email, phone, or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email, phone, or password" });
    }

    if (!["station", "station_owner", "admin"].includes(user.role)) {
      return res.status(403).json({
        message: "Public login has been retired. Station owners should use /partner/login."
      });
    }

    const token = jwt.sign(
  {
    userId: user._id,
    role: user.role,
    stationId: user.stationId,
    status: user.role === "admin" ? "approved" : getOwnerStatus(user)
  },
  SECRET,
  { expiresIn: "7d" }
);

res.json({
  message: "Login successful",
  token, // 🔥 THIS LINE IS THE KEY
  user: {
    name: user.name,
    email: user.email,
    role: user.role,
    stationId: user.stationId,
    status: user.role === "admin" ? "approved" : getOwnerStatus(user)
  }
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ PARTNER SIGNUP
app.post("/partner/signup", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      stationName,
      stationAddress,
      fuelBrand,
      password,
      confirmPassword,
      claimExistingStation,
      stationId
    } = req.body;

    const normalizedEmail = email ? email.trim().toLowerCase() : "";
    const normalizedPhone = phone ? phone.trim() : "";

    if (!fullName || !normalizedEmail || !normalizedPhone || !stationName || !stationAddress || !fuelBrand || !password) {
      return res.status(400).json({ message: "All signup fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await db.collection("users").findOne({
      $or: [
        { email: normalizedEmail },
        { phone: normalizedPhone }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ message: "A user with this email or phone already exists" });
    }

    let claimedStationId = null;
    if (claimExistingStation && stationId) {
      claimedStationId = new ObjectId(stationId);
      const station = await db.collection("stations").findOne({ _id: claimedStationId });
      if (!station) {
        return res.status(404).json({ message: "Selected station was not found" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      name: fullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      role: "station_owner",
      status: "pending",
      accountStatus: "pending",
      stationId: claimedStationId,
      stationDraft: {
        name: stationName,
        address: stationAddress,
        brand: fuelBrand,
        claimExistingStation: Boolean(claimExistingStation)
      },
      partnerProfile: {
        operatingHours: "",
        photos: []
      },
      createdAt: new Date()
    };

    await db.collection("users").insertOne(newUser);

    res.json({
      message: "Your station account is awaiting approval.",
      status: "pending",
      accountStatus: "pending"
    });
  } catch (err) {
    console.error("PARTNER SIGNUP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ PARTNER LOGIN
app.post("/partner/login", async (req, res) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginId = (identifier || email || phone || "").trim();

    if (!loginId || !password) {
      return res.status(400).json({ message: "Email, phone, and password are required" });
    }

    const user = await db.collection("users").findOne({
      $or: [
        { email: loginId.toLowerCase() },
        { phone: loginId }
      ],
      role: { $in: ["station_owner", "station"] }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid station owner login" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid station owner login" });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        stationId: user.stationId,
        status: getOwnerStatus(user),
        accountStatus: getOwnerStatus(user)
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("partnerToken", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        stationId: user.stationId,
        status: getOwnerStatus(user),
        accountStatus: getOwnerStatus(user),
        stationDraft: user.stationDraft || null,
        partnerProfile: user.partnerProfile || {}
      }
    });
  } catch (err) {
    console.error("PARTNER LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/partner/logout", (req, res) => {
  res.clearCookie("partnerToken");
  res.json({ message: "Logged out" });
});

app.get("/partner/me", authMiddleware, async (req, res) => {
  try {
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );

    if (!user || !["station_owner", "station"].includes(user.role)) {
      return res.status(403).json({ message: "Partner account required" });
    }

    if (req.authToken) {
      res.cookie("partnerToken", req.authToken, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    let station = null;
    if (user.stationId) {
      station = await db.collection("stations").findOne({ _id: new ObjectId(user.stationId) });
      station = station ? normalizeStationProducts(station) : null;
    }

    res.json({
      user: {
        ...user,
        status: getOwnerStatus(user),
        accountStatus: getOwnerStatus(user),
        station
      }
    });
  } catch (err) {
    console.error("PARTNER ME ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/partner/station-profile", authMiddleware, async (req, res) => {
  try {
    const { operatingHours, photos } = req.body;

    if (!["station_owner", "station"].includes(req.user.role)) {
      return res.status(403).json({ message: "Partner account required" });
    }

    const partnerProfile = {
      operatingHours: operatingHours || "",
      photos: Array.isArray(photos) ? photos.slice(0, 4) : [],
      updatedAt: new Date()
    };

    await db.collection("users").updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { partnerProfile } }
    );

    const currentUser = await getCurrentUserFromToken(req);
    if (req.user.stationId && getOwnerStatus(currentUser || req.user) === "approved") {
      await db.collection("stations").updateOne(
        { _id: new ObjectId(req.user.stationId) },
        { $set: { operatingHours: partnerProfile.operatingHours, photos: partnerProfile.photos } }
      );
    }

    res.json({ message: "Station profile saved", partnerProfile });
  } catch (err) {
    console.error("PARTNER PROFILE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/partner/login", (req, res) => {
  res.sendFile(path.join(__dirname, "partner", "login.html"));
});

app.get("/partner/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "partner", "signup.html"));
});

app.get("/partner/pending", (req, res) => {
  res.sendFile(path.join(__dirname, "partner", "pending.html"));
});

app.get("/partner/dashboard", partnerDashboardGuard, (req, res) => {
  res.sendFile(path.join(__dirname, "partner", "dashboard.html"));
});

app.get("/api/location/geocode", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.status(400).json({ message: "q is required" });

    const geocode = await geocodeAddressWithFallback(query);
    if (!geocode) {
      return res.json({
        status: "no-result",
        result: null,
        fallback: {
          fullAddress: query,
          latitude: null,
          longitude: null,
          confidence: 0
        }
      });
    }

    res.json({ status: "ok", result: geocode });
  } catch (error) {
    console.error("GEOCODE API ERROR:", error);
    res.status(502).json({ message: "Unable to complete geocoding request" });
  }
});

app.get("/api/location/autocomplete", async (req, res) => {
  try {
    const input = String(req.query.q || "").trim();
    if (!input || input.length < 2) {
      return res.json({ status: "ok", predictions: [] });
    }

    const cacheKey = input.toLowerCase();
    const cached = googleAutocompleteCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 45 * 1000) {
      return res.json({ status: "ok", predictions: cached.predictions, cached: true });
    }

    const payload = await googleApiGet(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json",
      {
        input,
        components: "country:ng",
        locationbias: LAGOS_BIAS,
        language: GOOGLE_DEFAULT_LANGUAGE
      }
    );

    const predictions = (payload.predictions || []).slice(0, 6).map(item => ({
      placeId: item.place_id,
      description: item.description,
      mainText: item.structured_formatting?.main_text || item.description,
      secondaryText: item.structured_formatting?.secondary_text || ""
    }));

    googleAutocompleteCache.set(cacheKey, { cachedAt: Date.now(), predictions });
    res.json({ status: "ok", predictions });
  } catch (error) {
    console.error("AUTOCOMPLETE API ERROR:", error);
    res.status(502).json({ message: "Unable to complete autocomplete request", predictions: [] });
  }
});

app.get("/api/location/place-details", async (req, res) => {
  try {
    const placeId = String(req.query.placeId || "").trim();
    if (!placeId) return res.status(400).json({ message: "placeId is required" });

    const payload = await googleApiGet(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        place_id: placeId,
        fields: "place_id,name,formatted_address,geometry",
        language: GOOGLE_DEFAULT_LANGUAGE
      }
    );
    const result = payload.result || {};
    const location = result.geometry?.location || {};
    const geocode = {
      fullAddress: result.formatted_address || "",
      latitude: Number(location.lat),
      longitude: Number(location.lng),
      placeId: result.place_id || placeId,
      confidence: 0.9,
      geocodeStatus: "high-confidence",
      source: "google_places_details"
    };
    res.json({ status: "ok", result: geocode });
  } catch (error) {
    console.error("PLACE DETAILS API ERROR:", error);
    res.status(502).json({ message: "Unable to fetch place details" });
  }
});

app.get("/api/location/ip", async (req, res) => {
  const providers = [
    "https://ipapi.co/json/",
    "https://ipinfo.io/json"
  ];

  for (const url of providers) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const payload = await response.json();

      let latitude = null;
      let longitude = null;
      let fullAddress = "";

      if (url.includes("ipapi.co")) {
        latitude = Number(payload.latitude);
        longitude = Number(payload.longitude);
        fullAddress = [payload.city, payload.region, payload.country_name].filter(Boolean).join(", ");
      } else {
        const [latText, lngText] = String(payload.loc || "").split(",");
        latitude = Number(latText);
        longitude = Number(lngText);
        fullAddress = [payload.city, payload.region, payload.country].filter(Boolean).join(", ");
      }

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return res.json({
          status: "ok",
          result: {
            fullAddress: fullAddress || "Approximate location",
            latitude,
            longitude,
            confidence: 0.42,
            geocodeStatus: "approximate",
            source: "ip-location"
          }
        });
      }
    } catch (error) {
      console.warn("IP location provider failed:", url, error.message);
    }
  }

  res.status(502).json({ message: "Unable to determine approximate location" });
});


// ✅ START SERVER
async function startServer() {
  try {
    console.log("Server startup beginning...");
    await connectDB();
    const port = process.env.PORT || 3000;
    console.log("Database connection ready. Starting Express listener...");
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("DB connection failed. Server was not started:", err);
    console.error(err);
    console.error(err.stack);
    process.exit(1);
  }
}

process.on("uncaughtException", error => {
  console.error("Uncaught exception:");
  console.error(error);
  console.error(error.stack);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  console.error("Unhandled promise rejection:");
  console.error(reason);
  if (reason && reason.stack) {
    console.error(reason.stack);
  }
  process.exit(1);
});

process.on("SIGINT", async () => {
  await client.close().catch(err => console.error("MongoDB close failed:", err));
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await client.close().catch(err => console.error("MongoDB close failed:", err));
  process.exit(0);
});

startServer();
