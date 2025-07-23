// tracker_simulator.js
// Simulates a moving tracker (ID 12345) in Paris at 10km/h

const axios = require('axios');

const TRACKER_ID = '12345';
const URL = 'https://osmand.onrender.com/osmand';
const CENTER_LAT = 48.8566; // Paris center latitude
const CENTER_LON = 2.3522;  // Paris center longitude
const RADIUS_METERS = 1000; // 1km radius for the circular path
const SPEED_KMH = 10;       // 10 km/h
const INTERVAL_MS = 1000;   // 1 second updates

// Earth radius in meters
const EARTH_RADIUS = 6371000;

// Removed: now per-device state in DEVICES array


function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function computePosition(centerLat, centerLon, radius, angleRad) {
    // Move in a circle around the center
    const lat = centerLat + (radius / EARTH_RADIUS) * (180 / Math.PI) * Math.cos(angleRad);
    const lon = centerLon + (radius / EARTH_RADIUS) * (180 / Math.PI) * Math.sin(angleRad) / Math.cos(toRadians(centerLat));
    return { lat, lon };
}

async function sendPosition(device, lat, lon, speed, bearing) {
    try {
        const params = {
            id: device.id,
            lat,
            lon,
            timestamp: Math.floor(Date.now() / 1000),
            speed,
            bearing,
            altitude: 35,
            accuracy: 5,
            batt: device.battery,
            devicename: device.devicename
        };
        const response = await axios.post(URL, params);
        console.log(`[${new Date().toLocaleTimeString()}] [${device.devicename}] Sent (POST): lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}, bearing=${bearing}, speed=${speed}km/h, batt=${device.battery.toFixed(2)} | Server:`, response.data);
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code out of 2xx
            console.error(`[${device.devicename}] Error response:`, error.response.status, error.response.data);
        } else if (error.request) {
            // The request was made but no response received
            console.error(`[${device.devicename}] No response received:`, error.request);
        } else {
            // Something happened in setting up the request
            console.error(`[${device.devicename}] Error:`, error.message);
        }
        // Print the full error for debugging
        console.error(error);
    }
}

function simulateMovement() {
    // Each tick, move both devices
    const speed_mps = SPEED_KMH * 1000 / 3600;
    const circle_circumference = 2 * Math.PI * RADIUS_METERS;
    const angle_per_tick = (speed_mps / circle_circumference) * 2 * Math.PI;

    setInterval(() => {
        DEVICES.forEach(device => {
            device.angle += angle_per_tick;
            if (device.angle > 2 * Math.PI) device.angle -= 2 * Math.PI;
            const { lat, lon } = computePosition(CENTER_LAT, CENTER_LON, RADIUS_METERS, device.angle);
            // Bearing is tangent to the circle
            const bearing = (toDegrees(device.angle) + 90) % 360;
            sendPosition(device, lat, lon, SPEED_KMH, bearing);
            device.battery = Math.max(0, device.battery - 0.01); // Simulate slow battery drain
        });
    }, INTERVAL_MS);
}

// Define two simulated devices
const DEVICES = [
    {
        id: '12345',
        devicename: 'Simulated Paris Device 1',
        angle: 0, // Start at 0 radians
        battery: 95
    },
    {
        id: '67890',
        devicename: 'Simulated Paris Device 2',
        angle: Math.PI, // Start opposite side of circle
        battery: 90
    }
];

console.log('Simulating two moving trackers in Paris at 10km/h...');
simulateMovement();
