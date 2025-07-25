// /routes.js
const express = require('express');
const axios = require('axios');
const { pgPool } = require('../database');

function createApiRoutes(io, trackers) {
    const router = express.Router();



    // API: Get all trackers with a position in the last 72h (active and inactive)
    router.get('/trackers', async (req, res) => {
        try {
            const result = await pgPool.query(`
                SELECT DISTINCT ON (tracker_id)
                    tracker_id,
                    devicename,
                    latitude,
                    longitude,
                    timestamp,
                    speed,
                    bearing,
                    altitude,
                    accuracy,
                    battery,
                    charge
                FROM tracker_positions
                WHERE timestamp > NOW() - INTERVAL '72 HOURS'
                ORDER BY tracker_id, timestamp DESC
            `);
            const now = new Date();
            // Mark as inactive if last position is older than 10 minutes
            const trackers = result.rows.map(row => {
                const lastTs = new Date(row.timestamp);
                const inactive = (now - lastTs) > 10 * 60 * 1000;
                return {
                    id: row.tracker_id,
                    devicename: row.devicename,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    timestamp: row.timestamp,
                    speed: row.speed,
                    bearing: row.bearing,
                    altitude: row.altitude,
                    accuracy: row.accuracy,
                    battery: row.battery,
                    charge: row.charge,
                    inactive
                };
            });
            res.json(trackers);
        } catch (err) {
            console.error('PG select error (tracker list):', err);
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    });

    // API pour récupérer les positions d'un tracker sur les dernières 72h
    router.get('/trackers/:id/positions72h', async (req, res) => {
        const trackerId = req.params.id;
        try {
            const result = await pgPool.query(
                `SELECT tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery, charge
                 FROM tracker_positions
                 WHERE tracker_id = $1 AND timestamp > NOW() - INTERVAL '72 HOURS'
                 ORDER BY timestamp ASC`,
                [trackerId]
            );
            res.json(result.rows);
        } catch (err) {
            console.error(`PG select error for tracker ${trackerId} (positions72h):`, err);
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    });

    // Timelapse: Get nearest position at a given timestamp (last 72h)
    router.get('/trackers/:id/position_at', async (req, res) => {
        const trackerId = req.params.id;
        const { timestamp } = req.query;
        if (!timestamp) {
            return res.status(400).json({ error: 'Missing timestamp parameter' });
        }
        // Only consider positions from the last 72 hours
        try {
            const result = await pgPool.query(
                `SELECT tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery, charge,
                        ABS(EXTRACT(EPOCH FROM (timestamp - $2))) AS time_diff
                 FROM tracker_positions
                 WHERE tracker_id = $1
                   AND timestamp > NOW() - INTERVAL '72 HOURS'
                 ORDER BY time_diff ASC
                 LIMIT 1`,
                [trackerId, timestamp]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No position found for tracker in last 72h' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(`Timelapse position_at API error for tracker ${trackerId}:`, err);
            res.status(500).json({ error: 'Database error', details: err.message });
        }
    });

    // API for reverse geocoding


    // API for reverse geocoding
    router.get('/reverse-geocode', async (req, res) => {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'OsmAndTracker/1.0 (node.js app)' }
            });
            if (response.data && response.data.display_name) {
                res.json({ address: response.data.display_name });
            } else {
                res.status(404).json({ error: 'Address not found' });
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error.message);
            res.status(500).json({ error: 'Failed to fetch address' });
        }
    });

    return router;
}

module.exports = createApiRoutes;
