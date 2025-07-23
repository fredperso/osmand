// /database.js
const { Pool } = require('pg');

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function ensureTrackerPositionsTable() {
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS tracker_positions (
        id SERIAL PRIMARY KEY,
        tracker_id VARCHAR NOT NULL,
        devicename VARCHAR,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        speed DOUBLE PRECISION,
        bearing DOUBLE PRECISION,
        altitude DOUBLE PRECISION,
        accuracy DOUBLE PRECISION,
        battery DOUBLE PRECISION,
        charge BOOLEAN
    );
    CREATE INDEX IF NOT EXISTS idx_tracker_time ON tracker_positions (tracker_id, timestamp);
    `;
    try {
        await pgPool.query(createTableSQL);
        console.log("tracker_positions table ensured.");
    } catch (err) {
        console.error("Error ensuring tracker_positions table:", err);
        process.exit(1); // Exit if we can't connect to DB
    }
}

module.exports = {
    pgPool,
    ensureTrackerPositionsTable
};
