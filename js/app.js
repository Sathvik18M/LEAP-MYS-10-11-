/**
 * app.js — Main application entry point
 * LEAP C-Room Dashboard
 *
 * Initialises all modules, manages Firebase vs. Demo mode,
 * and exposes the global `app` API for HTML event handlers.
 */

/* ═══════════════════════════════════════════════════════
   ROUTE DATA — Mysuru, Karnataka
   Coordinates verified against OpenStreetMap.
   Replace / extend these with your real route data.
════════════════════════════════════════════════════════ */
const ROUTES = {
  'MYS-R01': {
    id:   'MYS-R01',
    name: 'Route 01 — Bus Stand → Vijayanagar',
    stops: [
      { id: 'MYS001', name: 'Mysuru City Bus Stand',    lat: 12.2960, lng: 76.6394 },
      { id: 'MYS002', name: 'CFTRI Circle',             lat: 12.2958, lng: 76.6237 },
      { id: 'MYS003', name: 'Vijayanagar 2nd Stage',    lat: 12.3097, lng: 76.5993 },
      { id: 'MYS004', name: 'Vijayanagar Bus Terminal', lat: 12.3213, lng: 76.5990 },
    ],
  },
  'MYS-R02': {
    id:   'MYS-R02',
    name: 'Route 02 — Railway Station → Chamundi Hill',
    stops: [
      { id: 'MYS005', name: 'Mysuru Railway Station', lat: 12.3132, lng: 76.6395 },
      { id: 'MYS006', name: 'KR Circle',              lat: 12.3000, lng: 76.6419 },
      { id: 'MYS007', name: 'Mysuru Palace Gate',     lat: 12.3052, lng: 76.6551 },
      { id: 'MYS008', name: 'Chamundi Hill Foothills',lat: 12.2715, lng: 76.6706 },
    ],
  },
  'MYS-R03': {
    id:   'MYS-R03',
    name: 'Route 03 — Bus Stand → Mysuru Airport',
    stops: [
      { id: 'MYS009', name: 'City Bus Stand',       lat: 12.2960, lng: 76.6394 },
      { id: 'MYS010', name: 'Bannimantap Circle',   lat: 12.2903, lng: 76.6451 },
      { id: 'MYS011', name: 'Ring Road Junction',   lat: 12.2606, lng: 76.6491 },
      { id: 'MYS012', name: 'Mysuru Airport',       lat: 12.2300, lng: 76.6557 },
    ],
  },
};

/* ═══════════════════════════════════════════════════════
   FIREBASE CONFIG
   ► Replace placeholder values with your actual project config.
   ► Get these from: Firebase Console → Project Settings → Web App
   ► Once configured, set DEMO_MODE = false below.
════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  // apiKey:            'YOUR_API_KEY',
  // authDomain:        'YOUR_PROJECT.firebaseapp.com',
  // databaseURL:       'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  // projectId:         'YOUR_PROJECT_ID',
  // storageBucket:     'YOUR_PROJECT.appspot.com',
  // messagingSenderId: 'YOUR_SENDER_ID',
  // appId:             'YOUR_APP_ID',
};

/**
 * DEMO_MODE
 * true  → uses the built-in simulation engine (no Firebase needed)
 * false → connects to Firebase Realtime Database
 *
 * Set to false after populating FIREBASE_CONFIG above.
 */
const DEMO_MODE = true;

/* ═══════════════════════════════════════════════════════
   EXPECTED FIREBASE REALTIME DATABASE SCHEMA
   (for reference when integrating ESP32 firmware)

   /buses/{busId}: {
     id:            "178-3",
     routeId:       "MYS-R01",
     driverId:      "D-041",
     deviceId:      "ESP-101",
     lat:           12.2958,
     lng:           76.6394,
     speed:         32,
     status:        "RUNNING",   // RUNNING | PAUSED | RESUMED | CANCELLED | DELAYED | IDLE
     currentStop:   "MYS003",
     nextStop:      "MYS004",
     problemCode:   null,        // "01".."10" or null
     delayMinutes:  0,
     lastUpdated:   1726589285000
   }

   /events/{busId}/{eventId}: {
     timestamp:   1726589285000,
     type:        "DELAY",       // START | STOP | DELAY | CANCEL | PROBLEM | STOP_REACH | RESUME
     message:     "Delay at MYS003",
     problemCode: "03"
   }
════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   APP MODULE
════════════════════════════════════════════════════════ */
const app = (() => {
  'use strict';

  let _db = null;
  let _clockInterval = null;

  /* ─── Init ─── */
  function init() {
    _startClock();
    fleetModule.init(ROUTES);
    mapModule.init(ROUTES);

    if (DEMO_MODE) {
      _startDemo();
    } else {
      _startFirebase();
    }
  }

  /* ─── Clock ─── */
  function _startClock() {
    const el = document.getElementById('systemClock');
    const tick = () => {
      if (el) el.textContent = new Date().toTimeString().slice(0, 8);
    };
    tick();
    _clockInterval = setInterval(tick, 1000);
  }

  /* ─── Demo Mode ─── */
  function _startDemo() {
    const badge = document.getElementById('demoBadge');
    if (badge) badge.style.display = 'flex';

    _setConnStatus('connected', 'Simulation Active');

    demoModule.start(ROUTES, (busData) => {
      fleetModule.updateBus(busData);
      mapModule.updateBus(busData, ROUTES);
    });
  }

  /* ─── Firebase Mode ─── */
  function _startFirebase() {
    const badge = document.getElementById('demoBadge');
    if (badge) badge.style.display = 'none';

    _setConnStatus('idle', 'Connecting…');

    // Dynamically load Firebase SDK so file:// pages don't error
    function _loadScript(src, cb) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      s.onerror = () => { console.warn('[LEAP] Failed to load', src); cb(); };
      document.head.appendChild(s);
    }

    _loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js', () => {
      _loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js', () => {
        _connectFirebase();
      });
    });
  }

  function _connectFirebase() {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();

      // Connection health
      _db.ref('.info/connected').on('value', snap => {
        if (snap.val()) {
          _setConnStatus('connected', 'Connected');
        } else {
          _setConnStatus('error', 'Disconnected');
        }
      });

      // Live bus updates
      _db.ref('/buses').on('value', snap => {
        const data = snap.val();
        if (!data) return;
        Object.values(data).forEach(busData => {
          if (!busData || !busData.id) return;
          fleetModule.updateBus(busData);
          mapModule.updateBus(busData, ROUTES);
        });
      });

      // Live event log from Firebase
      _db.ref('/events').on('child_added', snap => {
        const busEvents = snap.val();
        if (!busEvents) return;
        const busId = snap.key;
        Object.values(busEvents).forEach(ev => {
          if (!ev) return;
          eventsModule.addEvent(
            ev.busId || busId,
            ev.type  || 'INFO',
            ev.message || '',
            ev.problemCode || null
          );
        });
      });

    } catch (err) {
      console.warn('[LEAP C-Room] Firebase init failed — falling back to demo mode.', err);
      _setConnStatus('error', 'Firebase Error — Demo');
      _startDemo();
    }
  }

  /* ─── Connection status helper ─── */
  function _setConnStatus(cls, label) {
    const el = document.getElementById('connStatus');
    if (!el) return;
    el.className = `conn-status ${cls}`;
    const lbl = document.getElementById('connLabel');
    if (lbl) lbl.textContent = label;
  }

  /* ─── Public: Select Bus ─── */
  function selectBus(busId) {
    fleetModule.selectBus(busId);
  }

  /* ─── Public: Set Fleet Filter ─── */
  function setFilter(filter) {
    fleetModule.setFilter(filter);
  }

  /* ─── Public: Search Bus ─── */
  function searchBus(query) {
    fleetModule.setSearch(query);
  }

  /* ─── Public: Filter log by selected bus ─── */
  function filterLogByBus() {
    const busId = fleetModule.getSelectedBus();
    if (busId) eventsModule.filterByBus(busId);
  }

  /* ─── Public: Management Modal ─── */
  function openManagement() {
    fleetModule.renderManagement();
    document.getElementById('mgmtBackdrop')?.classList.remove('hidden');
    document.getElementById('mgmtModal')?.classList.remove('hidden');
  }

  function closeManagement() {
    document.getElementById('mgmtBackdrop')?.classList.add('hidden');
    document.getElementById('mgmtModal')?.classList.add('hidden');
  }

  /* ─── Keyboard shortcuts ─── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeManagement();
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('busSearch')?.focus();
    }
  });

  return {
    init,
    selectBus,
    setFilter,
    searchBus,
    filterLogByBus,
    openManagement,
    closeManagement,
  };
})();

/* ─── Bootstrap on DOM ready ─── */
document.addEventListener('DOMContentLoaded', () => app.init());
