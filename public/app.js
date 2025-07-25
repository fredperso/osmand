class TrackerApp {
    constructor() {
        this.trackers = {};
        this.map = null;
        this.markers = {};
        this.sidebarOpen = false;
        this.init();
    }
    async init() {
        this.initMap();
        this.initSocket();
        this.initUI();
        // Fetch all recent trackers (active + inactive) on load
        try {
            const resp = await fetch('/api/trackers');
            if (resp.ok) {
                const trackers = await resp.json();
                trackers.forEach(tracker => {
                    this.trackers[tracker.id] = tracker;
                });
                this.updateTrackerList();
            }
        } catch (err) {
            console.error('Erreur lors du chargement des trackers:', err);
        }
    }
    initMap() {
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });

        const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        });

        this.map = L.map('map', {
            center: [48.8566, 2.3522],
            zoom: 12,
            layers: [osmLayer] // Default layer
        });

        const baseLayers = {
            "Standard": osmLayer,
            "Satellite": satelliteLayer,
            "Topographique": topoLayer
        };

        L.control.layers(baseLayers, null, { position: 'bottomleft' }).addTo(this.map);
    }
    initSocket() {
        this.socket = io();
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
        });
        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });
        this.socket.on('trackerUpdate', (tracker) => {

            this.updateTracker(tracker);
        });
        this.socket.on('trackerRemove', (trackerId) => {
            this.removeTracker(trackerId);
        });
    }
    initUI() {
        // Timelapse slider logic
        const nowDiv = document.getElementById('timelapse-now');
        function updateNowDiv() {
            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            nowDiv.textContent = `Date/Heure actuelle : ${dateStr} ${timeStr}`;
        }
        updateNowDiv();
        setInterval(updateNowDiv, 1000);
        const slider = document.getElementById('timelapse-slider');
        const timeLabel = document.getElementById('timelapse-time');
        const infoDiv = document.getElementById('timelapse-info');
        this.timelapseMarker = null;
        this.timelapseActive = false;
        this.timelapseTrackerId = null;
        this.timelapseLastFetch = null;

        // Helper to get ISO timestamp for slider value (minutes ago)
        function sliderValueToTimestamp(val) {
            const now = Date.now();
            const msAgo = parseInt(val, 10) * 60 * 1000;
            return new Date(now - msAgo).toISOString();
        }

        // Helper to format slider label
        function sliderValueToLabel(val) {
            if (parseInt(val, 10) === 0) return 'Now';
            const dt = new Date(Date.now() - parseInt(val, 10) * 60 * 1000);
            return dt.toLocaleString();
        }

        // Pick a tracker for timelapse (default: first in list)
        this.getTimelapseTrackerId = () => {
            const trackerArray = Object.values(this.trackers);
            if (trackerArray.length === 0) return null;
            // If user previously selected, keep it
            if (this.timelapseTrackerId && this.trackers[this.timelapseTrackerId]) return this.timelapseTrackerId;
            return trackerArray[0].id;
        };

        // Main timelapse slider handler
        slider.addEventListener('input', async (e) => {
            const val = slider.value;
            timeLabel.textContent = sliderValueToLabel(val);
            infoDiv.textContent = '';
            const trackerId = this.getTimelapseTrackerId();
            if (!trackerId) {
                infoDiv.textContent = 'Aucun tracker actif.';
                return;
            }
            this.timelapseActive = true;
            await this.showTimelapse(trackerId, sliderValueToTimestamp(val));
            // Ensure sidebar stays visible during timelapse
            document.getElementById('sidebar').classList.add('open');
            this.sidebarOpen = true;
        });
        // Reset timelapse if user interacts with live map
        document.getElementById('map').addEventListener('click', () => {
            if (this.timelapseMarker) {
                this.map.removeLayer(this.timelapseMarker);
                this.timelapseMarker = null;
            }
            this.timelapseActive = false;
        });
        // When a new tracker is added, update slider tracker
        this.updateTimelapseTracker = () => {
            if (!this.timelapseActive) {
                this.timelapseTrackerId = this.getTimelapseTrackerId();
            }
        };
    
        const toggleSidebar = () => {
            this.sidebarOpen = !this.sidebarOpen;
            document.getElementById('sidebar').classList.toggle('open', this.sidebarOpen);
        };
        document.getElementById('sidebar-toggle').onclick = toggleSidebar;
        document.getElementById('sidebar-close-btn').onclick = toggleSidebar;
    }
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-status');
        const text = document.getElementById('connection-text');
        if (connected) {
            indicator.classList.add('connected');
            text.textContent = 'Connecté';
        } else {
            indicator.classList.remove('connected');
            text.textContent = 'Déconnecté';
        }
    }
    updateTracker(tracker) {

        this.updateTimelapseTracker && this.updateTimelapseTracker();
        this.trackers[tracker.id] = tracker;
        this.updateTrackerList();
        // Add or update marker
        if (this.markers[tracker.id]) {
            this.markers[tracker.id].setLatLng([tracker.latitude, tracker.longitude]);
            this.markers[tracker.id].setPopupContent(this.createPopupContent(tracker));
        } else {
            const marker = L.marker([tracker.latitude, tracker.longitude]).addTo(this.map);
            marker.bindPopup(this.createPopupContent(tracker));
            this.markers[tracker.id] = marker;

            marker.on('popupopen', () => {
                this.fetchAndDisplayAddress(tracker.latitude, tracker.longitude, `address-${tracker.id}-current`);
            });
        }
    }
    createPopupContent(tracker, isHistory = false) {
        const lat = parseFloat(tracker.latitude).toFixed(6);
        const lon = parseFloat(tracker.longitude).toFixed(6);
        const speed = tracker.speed || 0;
        const battery = tracker.battery || 0;
        const lastUpdate = this.formatLocalDate(tracker.lastUpdate || tracker.timestamp);
        // Use tracker_id for history items
        const id = isHistory ? tracker.tracker_id : tracker.id;
        const timestamp = new Date(tracker.timestamp).getTime();
        const addressId = `address-${id}-${isHistory ? timestamp : 'current'}`;

        return `<div class="popup-content">
            <div class="popup-header">${tracker.devicename || id}</div>
            <div class="popup-info">
                <div><strong>Coords:</strong> ${lat}, ${lon}</div>
                <div id="${addressId}" class="address-line">🕒 Chargement de l'adresse...</div>
                <div><strong>Vitesse:</strong> ${speed} km/h</div>
                <div><strong>Batterie:</strong> ${battery}%</div>
                <div><strong>Dernière maj:</strong> ${lastUpdate}</div>
                <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" class="gmaps-link">Ouvrir dans Google Maps</a>
            </div>
        </div>`;
    }
    async fetchAndDisplayAddress(lat, lon, elementId) {
        try {
            const response = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
            const element = document.getElementById(elementId);
            if (!element) return;

            if (response.ok) {
                const data = await response.json();
                element.textContent = `📍 ${data.address}`;
            } else {
                element.textContent = 'Adresse non disponible';
            }
        } catch (error) {
            console.error('Failed to fetch address:', error);
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = "Erreur de chargement de l'adresse";
            }
        }
    }

    formatLocalDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString();
    }
    removeTracker(trackerId) {
        delete this.trackers[trackerId];
        if (this.markers[trackerId]) {
            this.map.removeLayer(this.markers[trackerId]);
            delete this.markers[trackerId];
        }
        this.updateTrackerList();
    }
    updateTrackerList() {
        const list = document.getElementById('tracker-list');
        list.innerHTML = '';
        const trackerArray = Object.values(this.trackers);
        document.getElementById('tracker-count').textContent = `${trackerArray.length} tracker${trackerArray.length !== 1 ? 's' : ''}`;
        trackerArray.forEach(tracker => {
            const item = document.createElement('div');
            item.className = 'tracker-item' + (tracker.inactive ? ' tracker-inactive' : '');
            const lat = parseFloat(tracker.latitude).toFixed(4);
            const lon = parseFloat(tracker.longitude).toFixed(4);

            item.innerHTML = `
                <div class="tracker-name">${tracker.devicename || tracker.id}</div>
                <div class="tracker-info">
                    <div class="tracker-info-line">
                        <span class="icon">🎯</span>
                        <span>${lat}, ${lon}</span>
                    </div>
                    <div class="tracker-info-line"${tracker.inactive ? ' style="opacity:0.4; pointer-events:none; user-select:none;"' : ''}>
                        <span class="icon">⚡️</span>
                        <span>${tracker.speed || 0} km/h</span>
                    </div>
                    <div class="tracker-info-line"${tracker.inactive ? ' style="opacity:0.4; pointer-events:none; user-select:none;"' : ''}>
                        <span class="icon">🔋</span>
                        <span>${tracker.battery || 0}%</span>
                    </div>
                    <div class="tracker-info-line"${tracker.inactive ? ' style="opacity:0.4; pointer-events:none; user-select:none;"' : ''}>
                        <span class="tracker-time">${this.formatLocalDate(tracker.lastUpdate || tracker.timestamp)}</span>
                    </div>
                </div>`;

            const historyBtn = document.createElement('button');
            historyBtn.textContent = 'Voir historique 72H';
            historyBtn.className = 'history-btn';
            historyBtn.onclick = (e) => {
                e.stopPropagation();
                this.showTrackerHistory(tracker.id);
            };
            item.appendChild(historyBtn);

            item.onclick = () => {
                if (this.markers[tracker.id]) {
                    this.map.setView([tracker.latitude, tracker.longitude], 16);
                    this.markers[tracker.id].openPopup();
                }
            };
            list.appendChild(item);
        });
    }

    async showTrackerHistory(trackerId) {
        console.log(`[History] Requesting 72h history for tracker: ${trackerId}`);
        // Remove previous history layer group if any
        if (this.historyLayerGroup) {
            this.map.removeLayer(this.historyLayerGroup);
            this.historyLayerGroup = null;
        }
        try {
            const resp = await fetch(`/api/trackers/${trackerId}/positions72h`);
            if (!resp.ok) {
                const errorText = await resp.text();
                throw new Error(`Le serveur a répondu avec le statut ${resp.status}: ${errorText}`);
            }
            const positions = await resp.json();
            if (!Array.isArray(positions) || positions.length === 0) {
                alert('Aucune donnée historique trouvée pour ce tracker.');
                return;
            }

            this.historyLayerGroup = L.featureGroup().addTo(this.map);

            const latlngs = positions.map(p => [p.latitude, p.longitude]);
            const polyline = L.polyline(latlngs, { color: '#0074D9', weight: 3, opacity: 0.7 });
            this.historyLayerGroup.addLayer(polyline);

            positions.forEach(position => {
                const circle = L.circleMarker([position.latitude, position.longitude], {
                    radius: 6,
                    fillColor: '#0074D9',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                
                // The historical position object needs to be compatible with createPopupContent
                const popupContent = this.createPopupContent(position, true);
                circle.bindPopup(popupContent);
                this.historyLayerGroup.addLayer(circle);

                circle.on('popupopen', () => {
                    const addressId = `address-${position.tracker_id}-${new Date(position.timestamp).getTime()}`;
                    this.fetchAndDisplayAddress(position.latitude, position.longitude, addressId);
                });
            });

            this.map.fitBounds(this.historyLayerGroup.getBounds());
        } catch (err) {
            console.error('[History] Caught error while loading history:', err);
            alert(`Erreur lors du chargement de l'historique. Détails: ${err.message}`);
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new TrackerApp();
});
