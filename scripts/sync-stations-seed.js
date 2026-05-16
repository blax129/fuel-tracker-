const fs = require("fs");
const path = require("path");
const { BSON, MongoClient } = require("mongodb");

const { EJSON } = BSON;

const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017";
const DEFAULT_DB_NAME = "fuelTracker";
const DEFAULT_SEED_PATH = path.resolve(__dirname, "../seeds/stations.seed.json");
const COLLECTION_NAME = "stations";

function parseArgs(argv) {
  const args = {
    mode: argv[0],
    file: DEFAULT_SEED_PATH,
    uri: null,
    dbName: null
  };

  argv.forEach((token, index) => {
    if (token === "--file" && argv[index + 1]) args.file = path.resolve(argv[index + 1]);
    if (token === "--uri" && argv[index + 1]) args.uri = argv[index + 1];
    if (token === "--db" && argv[index + 1]) args.dbName = argv[index + 1];
  });

  return args;
}

function showHelp() {
  console.log(`
Usage:
  node scripts/sync-stations-seed.js export
  node scripts/sync-stations-seed.js import --uri "<production MongoDB URI>"

Optional:
  --db fuelTracker
  --file seeds/stations.seed.json

Environment variables:
  LOCAL_MONGODB_URI   Used by export. Defaults to mongodb://127.0.0.1:27017
  LOCAL_MONGODB_DB    Used by export. Defaults to fuelTracker
  PROD_MONGODB_URI    Used by import if --uri is not provided
  PROD_MONGODB_DB     Used by import. Defaults to MONGODB_DB or fuelTracker
`);
}

function maskUri(uri) {
  return uri.replace(/:\/\/([^:@]+):([^@]+)@/, "://<user>:<password>@");
}

function getLocalConfig(args) {
  return {
    uri: args.uri || process.env.LOCAL_MONGODB_URI || DEFAULT_LOCAL_URI,
    dbName: args.dbName || process.env.LOCAL_MONGODB_DB || DEFAULT_DB_NAME
  };
}

function getProductionConfig(args) {
  const uri = args.uri || process.env.PROD_MONGODB_URI;
  if (!uri) {
    throw new Error("Production URI is required. Pass --uri or set PROD_MONGODB_URI.");
  }

  return {
    uri,
    dbName: args.dbName || process.env.PROD_MONGODB_DB || process.env.MONGODB_DB || DEFAULT_DB_NAME
  };
}

async function withMongo(uri, dbName, callback) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  try {
    return await callback(client.db(dbName));
  } finally {
    await client.close();
  }
}

async function exportStations(args) {
  const { uri, dbName } = getLocalConfig(args);
  console.log(`Reading local stations from ${maskUri(uri)} / ${dbName}...`);

  const stations = await withMongo(uri, dbName, async db => {
    return db.collection(COLLECTION_NAME).find({}).sort({ name: 1 }).toArray();
  });

  if (!stations.length) {
    throw new Error("No local stations found. Nothing was written.");
  }

  fs.mkdirSync(path.dirname(args.file), { recursive: true });
  fs.writeFileSync(args.file, `${EJSON.stringify(stations, null, 2, { relaxed: false })}\n`);

  console.log(`Wrote ${stations.length} stations to ${path.relative(process.cwd(), args.file)}.`);
}

async function importStations(args) {
  if (!fs.existsSync(args.file)) {
    throw new Error(`Seed file not found: ${args.file}`);
  }

  const { uri, dbName } = getProductionConfig(args);
  const stations = EJSON.parse(fs.readFileSync(args.file, "utf8"), { relaxed: false });

  if (!Array.isArray(stations) || !stations.length) {
    throw new Error("Seed file does not contain any stations.");
  }

  console.log(`Importing ${stations.length} stations into ${maskUri(uri)} / ${dbName}...`);

  const result = await withMongo(uri, dbName, async db => {
    const collection = db.collection(COLLECTION_NAME);
    const operations = stations.map(station => ({
      replaceOne: {
        filter: { _id: station._id },
        replacement: station,
        upsert: true
      }
    }));

    return collection.bulkWrite(operations, { ordered: true });
  });

  console.log(`Done. Inserted ${result.upsertedCount}, updated ${result.modifiedCount}, matched ${result.matchedCount}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!["export", "import"].includes(args.mode)) {
    showHelp();
    process.exitCode = 1;
    return;
  }

  if (args.mode === "export") await exportStations(args);
  if (args.mode === "import") await importStations(args);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
