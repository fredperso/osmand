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

async function ensureSessionTable() {
    try {
        await pgPool.query(`CREATE TABLE IF NOT EXISTS "session" (
            "sid" varchar NOT NULL COLLATE "default",
            "sess" json NOT NULL,
            "expire" timestamp(6) NOT NULL
        ) WITH (OIDS=FALSE);`);
        try {
            await pgPool.query(`ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");`);
        } catch (err) {
            // Ignore error if primary key already exists (code 42P16)
            if (!(err.code === '42P16' || /already exists/.test(err.message))) throw err;
        }
        try {
            await pgPool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);
        } catch (err) {
            if (!/already exists/.test(err.message)) throw err;
        }
        console.log("session table ensured.");
    } catch (err) {
        console.error("Error ensuring session table:", err);
        process.exit(1);
    }
}

module.exports = {
    pgPool,
    ensureTrackerPositionsTable,
    ensureSessionTable
};
