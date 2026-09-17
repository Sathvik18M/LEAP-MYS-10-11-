/**
 * map.js — Leaflet map management
 * LEAP C-Room Dashboard
 *
 * Handles bus markers, route polylines, stop markers,
 * smooth position updates, and popup info cards.
 */

const mapModule = (() => {
  'use strict';

  /* ─── State ─── */
  let map = null;
  let busMarkers = {};     // busId → L.marker
  let routeLayers = {};    // routeId → L.polyline
  let stopLayers = {};     // routeId → L.layerGroup
  let selectedBusId = null;
  let showRoutes = true;
  let showStops = true;
  let _routes = {};

  /* ─── Status → colour mapping ─── */
  const STATUS_COLOR = {
    RUNNING:   '#00e676',
    PAUSED:    '#ffb300',
    RESUMED:   '#448aff',
    CANCELLED: '#ff5252',
    DELAYED:   '#ff6d00',
    IDLE:      '#546e7a',
  };

  /* ─── Init ─── */
  function init(routes) {
    _routes = routes;

    map = L.map('map', {
      center:           [12.2958, 76.6394],
      zoom:             13,
      zoomControl:      false,
      attributionControl: true,
    });

    // CartoDB Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Draw static route infrastructure
    Object.values(routes).forEach(route => _drawRoute(route));
  }

  /* ─── Draw Route & Stops ─── */
  function _drawRoute(route) {
    if (!route.stops || route.stops.length < 2) return;
    const latlngs = route.stops.map(s => [s.lat, s.lng]);

    // Route polyline
    routeLayers[route.id] = L.polyline(latlngs, {
      color:     '#00d4ff',
      weight:    2.5,
      opacity:   0.35,
      dashArray: '7, 5',
    }).addTo(map);

    // Stop markers
    const stopGroup = L.layerGroup();
    route.stops.forEach((stop, i) => {
      const isTerminal = i === 0 || i === route.stops.length - 1;
      const marker = L.circleMarker([stop.lat, stop.lng], {
        radius:      isTerminal ? 6 : 4,
        fillColor:   isTerminal ? '#00d4ff' : '#7a9ab8',
        color:       '#090e1a',
        weight:      2,
        fillOpacity: 0.9,
      });

      marker.bindPopup(`
        <div class="popup-bus-id" style="font-size:13px">${escHtml(stop.name)}</div>
        <div class="popup-stat">
          <span class="ps-lbl">Stop ID</span>
          <span class="ps-val">${escHtml(stop.id)}</span>
        </div>
        <div class="popup-stat">
          <span class="ps-lbl">Route</span>
          <span class="ps-val">${escHtml(route.name)}</span>
        </div>
      `);

      stopGroup.addLayer(marker);
    });

    stopGroup.addTo(map);
    stopLayers[route.id] = stopGroup;
  }

  /* ─── Bus Marker Icon ─── */
  function _busIcon(busId, status) {
    const color = STATUS_COLOR[status] || STATUS_COLOR.IDLE;
    return L.divIcon({
      className: '',
      iconSize:   [36, 50],
      iconAnchor: [18, 44],
      popupAnchor:[0, -44],
      html: `
        <div style="
          position:relative;
          width:36px;height:36px;
          background:#0c1524;
          border:2.5px solid ${color};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 0 10px ${color}55, 0 3px 10px rgba(0,0,0,.7);
          transition:border-color .3s;
        ">
          <div style="
            position:absolute;inset:0;
            display:flex;align-items:center;justify-content:center;
            transform:rotate(45deg);
            font-size:15px;line-height:1;
          ">🚌</div>
        </div>
        <div style="
          position:absolute;
          bottom:0;left:50%;
          transform:translateX(-50%);
          background:${color}22;
          border:1px solid ${color}55;
          padding:0px 5px;
          border-radius:4px;
          font-size:9px;font-weight:700;
          color:${color};
          white-space:nowrap;
          font-family:'JetBrains Mono',monospace;
          line-height:1.6;
        ">${escHtml(busId)}</div>
      `,
    });
  }

  /* ─── Update Bus ─── */
  function updateBus(busData, routes) {
    const { id, lat, lng, status, speed, routeId, currentStop, nextStop, driverId, delayMinutes } = busData;
    if (lat === undefined || lng === undefined) return;

    const routeName = routes[routeId]?.name || routeId;
    const eta = etaModule.calcEta(busData, routes);
    const popupHtml = _buildPopup(busData, routeName, eta);

    if (busMarkers[id]) {
      busMarkers[id].setLatLng([lat, lng]);
      busMarkers[id].setIcon(_busIcon(id, status));
      if (busMarkers[id].isPopupOpen()) {
        busMarkers[id].setPopupContent(popupHtml);
      } else {
        busMarkers[id].getPopup()?.setContent(popupHtml);
      }
    } else {
      const marker = L.marker([lat, lng], {
        icon: _busIcon(id, status),
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        if (window.app) app.selectBus(id);
      });

      busMarkers[id] = marker;
    }
  }

  function _buildPopup(bus, routeName, eta) {
    const color = STATUS_COLOR[bus.status] || STATUS_COLOR.IDLE;
    return `
      <div class="popup-bus-id">${escHtml(bus.id)}</div>
      <div class="popup-stat">
        <span class="ps-lbl">Status</span>
        <span class="ps-val" style="color:${color};font-weight:700">${bus.status}</span>
      </div>
      <div class="popup-stat">
        <span class="ps-lbl">Route</span>
        <span class="ps-val">${escHtml(routeName)}</span>
      </div>
      <div class="popup-stat">
        <span class="ps-lbl">Speed</span>
        <span class="ps-val">${bus.speed || 0} km/h</span>
      </div>
      <div class="popup-stat">
        <span class="ps-lbl">ETA Next Stop</span>
        <span class="ps-val">${etaModule.formatEta(eta)}</span>
      </div>
      ${bus.delayMinutes > 0 ? `<div class="popup-stat"><span class="ps-lbl">Delay</span><span class="ps-val" style="color:var(--c-delayed)">+${bus.delayMinutes} min</span></div>` : ''}
      ${bus.problemCode ? `<div class="popup-stat"><span class="ps-lbl">Problem</span><span class="ps-val" style="color:var(--c-paused)">Code ${bus.problemCode}</span></div>` : ''}
    `;
  }

  /* ─── Remove Bus ─── */
  function removeBus(busId) {
    if (busMarkers[busId]) {
      map.removeLayer(busMarkers[busId]);
      delete busMarkers[busId];
    }
  }

  /* ─── Pan to Bus ─── */
  function panToBus(busId) {
    const bid = busId || selectedBusId;
    if (bid && busMarkers[bid]) {
      map.setView(busMarkers[bid].getLatLng(), Math.max(map.getZoom(), 15), { animate: true, duration: 0.7 });
      busMarkers[bid].openPopup();
    }
  }

  /* ─── Fit All ─── */
  function fitAll() {
    const latlngs = Object.values(busMarkers).map(m => m.getLatLng());
    if (latlngs.length === 0) return;
    if (latlngs.length === 1) { map.setView(latlngs[0], 14, { animate: true }); return; }
    map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], animate: true });
  }

  /* ─── Toggle Layers ─── */
  function toggleRoutes() {
    showRoutes = !showRoutes;
    Object.values(routeLayers).forEach(l => {
      showRoutes ? l.addTo(map) : map.removeLayer(l);
    });
  }

  function toggleStops() {
    showStops = !showStops;
    Object.values(stopLayers).forEach(g => {
      showStops ? g.addTo(map) : map.removeLayer(g);
    });
  }

  /* ─── Highlight active route ─── */
  function highlightRoute(routeId) {
    Object.entries(routeLayers).forEach(([rid, layer]) => {
      if (rid === routeId) {
        layer.setStyle({ color: '#00d4ff', opacity: 0.85, weight: 3.5, dashArray: null });
        layer.bringToFront();
      } else {
        layer.setStyle({ color: '#00d4ff', opacity: 0.2, weight: 2, dashArray: '7,5' });
      }
    });
  }

  function resetRouteHighlight() {
    Object.values(routeLayers).forEach(l =>
      l.setStyle({ color: '#00d4ff', opacity: 0.35, weight: 2.5, dashArray: '7,5' })
    );
  }

  function setSelectedBus(busId) { selectedBusId = busId; }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    init, updateBus, removeBus, panToBus, fitAll,
    toggleRoutes, toggleStops,
    highlightRoute, resetRouteHighlight,
    setSelectedBus,
  };
})();
