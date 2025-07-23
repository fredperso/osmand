// /routes.js
const express = require('express');
const axios = require('axios');
const { pgPool } = require('../database');

function createApiRoutes(io, trackers) {
    const router = express.Router();



    // API pour récupérer tous les trackers
    router.get('/trackers', (req, res) => {
        res.json(Array.from(trackers.values()));
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
