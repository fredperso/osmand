require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

// Import local modules
const { pgPool, ensureTrackerPositionsTable, ensureSessionTable } = require('./database');
const createPublicRoutes = require('./routes/public');
const createApiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// In-memory storage for current tracker positions
const trackers = new Map();

// Trust the Render proxy so secure cookies work behind TLS termination
app.set('trust proxy', 1);

// Session middleware setup
app.use(session({
    store: new pgSession({
        pool: pgPool, // use existing pg Pool
        tableName: 'session' // default table name
    }),
    secret: process.env.SESSION_SECRET || 'osmand-tracker-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Public Routes ---
// These routes are accessible without authentication.

// Serve files from the 'public' directory, but not index.html by default
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Public endpoint for tracker data
const publicRouter = createPublicRoutes(io, trackers);
app.use('/', publicRouter); // Handles /osmand

// Public route for the login page itself
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route to handle the login form submission
app.post('/login', async (req, res) => {
    const { login, password } = req.body;
    try {
        const result = await pgPool.query('SELECT * FROM users WHERE username = $1', [login]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                req.session.authenticated = true;
                return res.redirect('/');
            }
        }
        res.redirect('/login.html?error=1');
    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/login.html?error=1');
    }
});

// Route to handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// --- Authentication Wall ---
// Any route defined after this point requires an active session.
app.use((req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.redirect('/login.html');
});

// --- Protected Routes ---
// All routes below this point are protected.

// Main application page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Protected API routes
const apiRouter = createApiRoutes(io, trackers);
app.use('/api', apiRouter);

// --- WebSocket Handling ---
io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);

    // Send current tracker positions to the newly connected client
    Array.from(trackers.values()).forEach(tracker => {
        socket.emit('trackerUpdate', tracker);
    });

    socket.on('disconnect', () => {
        console.log('Client déconnecté:', socket.id);
    });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;

async function startServer() {
    await ensureTrackerPositionsTable();
    await ensureSessionTable();
    server.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
    });
}

startServer();

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
    console.log(`\n${signal} received: closing HTTP server, WebSocket, and database pool...`);
    server.close(() => {
        console.log('HTTP server closed.');
        // Close active WebSocket connections
        io.close(() => console.log('WebSocket server closed.'));
        // Close PostgreSQL pool
        pgPool.end(() => {
            console.log('PostgreSQL pool terminated.');
            process.exit(0);
        });
    });
    // Force exit if shutdown takes too long (e.g. 10s)
    setTimeout(() => {
        console.error('Forcing shutdown after timeout.');
        process.exit(1);
    }, 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => gracefulShutdown(signal));
});