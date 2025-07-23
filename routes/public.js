// /routes/public.js
const express = require('express');
const { pgPool } = require('../database');

function createPublicRoutes(io, trackers) {
    const router = express.Router();

    const handleTrackerData = async (req, res) => {
        // For POST requests, data comes from req.body (parsed by express.urlencoded).
        // For GET requests, data comes from req.query.
        const data = (req.method === 'POST') ? req.body : req.query;
        try {
            const { id, lat, lon, timestamp, speed, bearing, altitude, accuracy, batt, charge, devicename } = data;
            if (!id || !lat || !lon) {
                console.warn(`[Tracker] Received invalid data (${req.method}):`, data);
                return res.status(400).send('Missing required parameters: id, lat, lon');
            }

            const trackerData = {
                id: id,
                devicename: devicename || `Tracker ${id}`,
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                timestamp: timestamp ? parseInt(timestamp) * 1000 : Date.now(),
                speed: speed ? parseFloat(speed) : null,
                bearing: bearing ? parseFloat(bearing) : null,
                altitude: altitude ? parseFloat(altitude) : null,
                accuracy: accuracy ? parseFloat(accuracy) : null,
                battery: batt ? parseFloat(batt) : null,
                charge: typeof charge !== 'undefined' ? (String(charge) === 'true' || String(charge) === '1') : null,
                lastUpdate: new Date().toISOString()
            };

            trackers.set(id, trackerData);

            // Asynchronously insert into DB without waiting
            pgPool.query(
                `INSERT INTO tracker_positions (tracker_id, devicename, latitude, longitude, timestamp, speed, bearing, altitude, accuracy, battery, charge)
                 VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, $8, $9, $10, $11)`,
                [trackerData.id, trackerData.devicename, trackerData.latitude, trackerData.longitude, trackerData.timestamp, trackerData.speed, trackerData.bearing, trackerData.altitude, trackerData.accuracy, trackerData.battery, trackerData.charge]
            ).catch(dbErr => {
                console.error('PG insert error:', dbErr);
            });

            io.emit('trackerUpdate', trackerData);
            res.status(200).send('OK');
        } catch (error) {
            console.error(`Error processing OSMAND data (${req.method}):`, error);
            res.status(500).send('Internal Server Error');
        }
    };

    router.get('/osmand', handleTrackerData);
    router.post('/osmand', handleTrackerData);

    return router;
}

module.exports = createPublicRoutes;
