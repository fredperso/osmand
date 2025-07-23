// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const fs = require('fs');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Load authentication config
const authConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'auth_config.json')));

// Session middleware
app.use(session({
    secret: 'osmand-tracker-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Protect all static files except login.html and login endpoint
app.use((req, res, next) => {
    const allowed = ['/login', '/login.html', '/socket.io/socket.io.js'];
    if (allowed.includes(req.path) || req.path.startsWith('/socket.io/')) {
        return next();
    }
    if (req.path.startsWith('/osmand')) {
        return next(); // allow tracker API
    }
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.redirect('/login.html');
});
app.use(express.static('public'));


// Store des positions des trackers
const trackers = new Map();

// PostgreSQL integration
const { Pool } = require('pg');
let PG_CONNECTION_STRING = process.env.RENDER_POSTGRES_URL || process.env.DATABASE_URL || undefined;
try {
    const pgConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'pg_config.json')));
    if (pgConfig.pg_url) {
        PG_CONNECTION_STRING = pgConfig.pg_url;
    }
} catch (e) {
    // Fallback to env var if config file not found
}
const pgPool = new Pool({
    connectionString: PG_CONNECTION_STRING,
    ssl: PG_CONNECTION_STRING ? { rejectUnauthorized: false } : false
});

// Ensure tracker_positions table exists
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
        battery DOUBLE PRECISION
    );
    CREATE INDEX IF NOT EXISTS idx_tracker_time ON tracker_positions (tracker_id, timestamp);
    `;
    try {
        await pgPool.query(createTableSQL);
        console.log("tracker_positions table ensured.");
    } catch (err) {
        console.error("Error ensuring tracker_positions table:", err);
    }
}

// Call table ensure on startup
ensureTrackerPositionsTable();

// Configuration du port
const PORT = process.env.PORT || 3000;

// Auth middleware for frontend
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.redirect('/login.html');
}

// Route principale (protected)
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login endpoint
app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const { login, password } = req.body;
    if (login === authConfig.login && password === authConfig.password) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        // Render login page with error message injected
        const fs = require('fs');
        const path = require('path');
        const loginHtmlPath = path.join(__dirname, 'public', 'login.html');
        let html = fs.readFileSync(loginHtmlPath, 'utf8');
        // Insert error message after <form ...>
        html = html.replace('<div id="error" class="error" style="display:none;"></div>', '<div id="error" class="error">Identifiant ou mot de passe incorrect</div>');
        res.status(200).send(html);
    }
});

// Logout endpoint
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// Endpoint pour recevoir les données OSMAND
// Format OSMAND typique: GET /?id=123456&lat=40.7128&lon=-74.0060&timestamp=1234567890&speed=25&bearing=180&altitude=100&accuracy=5
app.get('/osmand', (req, res) => {
    try {
        const {
            id,
            lat,
            lon,
            timestamp,
            speed,
            bearing,
            altitude,
            accuracy,
            batt,
            charge,
            devicename
        } = req.query;

        // Validation des données obligatoires
        if (!id || !lat || !lon) {
            return res.status(400).send('Missing required parameters: id, lat, lon');
        }

        const trackerData = {
            id: id,
            devicename: devicename || `Tracker ${id}`,
            latitude: parseFloat(lat),
            longitude: parseFloat(lon),
            timestamp: timestamp ? parseInt(timestamp) * 1000 : Date.now(), // Convert to milliseconds
            speed: speed ? parseFloat(speed) : null,
            bearing: bearing ? parseFloat(bearing) : null,
            altitude: altitude ? parseFloat(altitude) : null,
            accuracy: accuracy ? parseFloat(accuracy) : null,
            battery: batt ? parseFloat(batt) : null,
            charge: typeof charge !== 'undefined' ? (charge === 'true' || charge === '1') : null,
            lastUpdate: new Date().toISOString()
        };

        // Stockage de la position
        trackers.set(id, trackerData);

        // Insert into PostgreSQL
        (async () => {
            try {
                await pgPool.query(
                    `INSERT INTO tracker_positions (tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery)
                    VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, $8, $9, $10)`,
                    [
                        trackerData.id,
                        trackerData.devicename,
                        trackerData.latitude,
                        trackerData.longitude,
                        trackerData.timestamp,
                        trackerData.speed,
                        trackerData.bearing,
                        trackerData.altitude,
                        trackerData.accuracy,
                        trackerData.battery,
                        trackerData.charge
                    ]
                );
                // Cleanup: delete positions older than 72H for this tracker
                await pgPool.query(
                    `DELETE FROM tracker_positions WHERE tracker_id = $1 AND timestamp < NOW() - INTERVAL '72 HOURS'`,
                    [trackerData.id]
                );
            } catch (dbErr) {
                console.error('PG insert error (GET /osmand):', dbErr);
            }
        })();

        // Émission vers tous les clients connectés
        io.emit('trackerUpdate', trackerData);

        console.log(`Tracker ${id} updated:`, {
            lat: trackerData.latitude,
            lon: trackerData.longitude,
            time: new Date(trackerData.timestamp).toLocaleString()
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing OSMAND data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Ajout du support POST /osmand
app.post('/osmand', (req, res) => {
    try {
        const {
            id,
            lat,
            lon,
            timestamp,
            speed,
            bearing,
            altitude,
            accuracy,
            batt,
            devicename
        } = req.body;

        // Validation des données obligatoires
        if (!id || !lat || !lon) {
            return res.status(400).send('Missing required parameters: id, lat, lon');
        }

        const trackerData = {
            id: id,
            devicename: devicename || `Tracker ${id}`,
            latitude: parseFloat(lat),
            longitude: parseFloat(lon),
            timestamp: timestamp ? parseInt(timestamp) * 1000 : Date.now(), // Convert to milliseconds
            speed: speed ? parseFloat(speed) : null,
            bearing: bearing ? parseFloat(bearing) : null,
            altitude: altitude ? parseFloat(altitude) : null,
            accuracy: accuracy ? parseFloat(accuracy) : null,
            batt: batt ? parseFloat(batt) : null,
            lastUpdate: new Date().toISOString()
        };

        trackers.set(id, trackerData);

        // Insert into PostgreSQL
        (async () => {
            try {
                await pgPool.query(
                    `INSERT INTO tracker_positions (tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery)
                    VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, $8, $9, $10)`,
                    [
                        trackerData.id,
                        trackerData.devicename,
                        trackerData.latitude,
                        trackerData.longitude,
                        trackerData.timestamp,
                        trackerData.speed,
                        trackerData.bearing,
                        trackerData.altitude,
                        trackerData.accuracy,
                        trackerData.batt, // Note: 'batt' used for POST
                        trackerData.charge
                    ]
                );
                // Cleanup: delete positions older than 72H for this tracker
                await pgPool.query(
                    `DELETE FROM tracker_positions WHERE tracker_id = $1 AND timestamp < NOW() - INTERVAL '72 HOURS'`,
                    [trackerData.id]
                );
            } catch (dbErr) {
                console.error('PG insert error (POST /osmand):', dbErr);
            }
        })();

        io.emit('trackerUpdate', trackerData);

        console.log(`Tracker ${id} updated (POST):`, {
            lat: trackerData.latitude,
            lon: trackerData.longitude,
            time: new Date(trackerData.timestamp).toLocaleString()
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing OSMAND data (POST):', error);
        res.status(500).send('Internal Server Error');
    }
});

// API pour récupérer tous les trackers
app.get('/api/trackers', (req, res) => {
    const trackersArray = Array.from(trackers.values());
    res.json(trackersArray);
});

// API pour récupérer un tracker spécifique
app.get('/api/trackers/:id', (req, res) => {
    const tracker = trackers.get(req.params.id);
    if (tracker) {
        res.json(tracker);
    } else {
        res.status(404).json({ error: 'Tracker not found' });
    }
});

// DB health check endpoint
app.get('/db-health', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT NOW()');
        res.json({ status: 'ok', time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// API pour récupérer les positions d'un tracker sur les dernières 24h
app.get('/api/trackers/:id/positions24h', async (req, res) => {
    const trackerId = req.params.id;
    try {
        const result = await pgPool.query(
            `SELECT tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery
             FROM tracker_positions
             WHERE tracker_id = $1 AND timestamp > NOW() - INTERVAL '24 HOURS'
             ORDER BY timestamp ASC`,
            [trackerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('PG select error (positions24h):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// API pour récupérer les positions d'un tracker sur les dernières 72h
app.get('/api/trackers/:id/positions72h', async (req, res) => {
    const trackerId = req.params.id;
    try {
        const result = await pgPool.query(
            `SELECT tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery
             FROM tracker_positions
             WHERE tracker_id = $1 AND timestamp > NOW() - INTERVAL '72 HOURS'
             ORDER BY timestamp ASC`,
            [trackerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('PG select error (positions72h):', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Gestion des connexions WebSocket
io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);

    // Envoyer tous les trackers existants au nouveau client
    socket.emit('allTrackers', Array.from(trackers.values()));

    socket.on('disconnect', () => {
        console.log('Client déconnecté:', socket.id);
    });
});

// Nettoyage périodique des anciens trackers (plus de 1 heure sans mise à jour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id, tracker] of trackers) {
        if (tracker.timestamp < oneHourAgo) {
            trackers.delete(id);
            io.emit('trackerRemoved', id);
            console.log(`Tracker ${id} removed due to inactivity`);
        }
    }
}, 5 * 60 * 1000); // Check every 5 minutes

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`OSMAND endpoint: http://localhost:${PORT}/osmand`);
});