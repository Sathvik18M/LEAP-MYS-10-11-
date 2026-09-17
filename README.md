# LEAP C-Room — Fleet Control Dashboard

**LEAP-MYS · Mysuru City Bus Operations**

A real-time fleet monitoring dashboard for the LEAP-MYS project control room. Provides live bus tracking, route/ETA monitoring, delay detection, driver incident reporting, and a chronological event log.

---

## Features

| # | Feature | Status |
|---|---------|--------|
| 1 | Live Fleet Monitoring (all buses in one dashboard) | ✅ |
| 2 | Route & Stop Monitoring (predefined routes, next stop) | ✅ |
| 3 | Live Bus Status (Running / Paused / Resumed / Cancelled / Delayed) | ✅ |
| 4 | ETA / Arrival Information | ✅ |
| 5 | Delay Monitoring (deviation detection + duration) | ✅ |
| 6 | Cancellation Monitoring (reason + event log) | ✅ |
| 7 | Driver Problem Reporting (codes 01–10) | ✅ |
| 8 | Event / Activity Log (chronological, filterable, exportable) | ✅ |
| 9 | Bus & Device Management modal (ID ↔ route ↔ driver ↔ device) | ✅ |
| 10 | Data Storage & Reporting (Firebase + CSV export) | ✅ |

---

## Quick Start (Demo Mode — no hardware needed)

1. Open `index.html` in any modern browser (Chrome, Edge, Firefox).
2. The simulation engine starts automatically — 6 buses drive along 3 Mysuru routes.
3. Click any bus card in the left sidebar to view full details.
4. Watch the Event Log at the bottom populate in real time.

> No server or build step required — it's a static HTML/CSS/JS project.

---

## Connecting to Firebase (Live Mode)

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project → Enable **Realtime Database** (start in test mode for development)
3. Go to **Project Settings → General → Your apps → Web** → Register a web app
4. Copy the `firebaseConfig` object

### 2. Edit `js/app.js`

Replace the placeholder `FIREBASE_CONFIG` block:

```js
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  databaseURL:       'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};
```

Then switch off demo mode:

```js
const DEMO_MODE = false; // ← change to false
```

### 3. Firebase Database Structure

Your ESP32 firmware should write to these paths:

```
/buses/{busId}/
  id            : "178-3"
  routeId       : "MYS-R01"
  driverId      : "D-041"
  deviceId      : "ESP-101"
  lat           : 12.2958
  lng           : 76.6394
  speed         : 32
  status        : "RUNNING"     ← RUNNING | PAUSED | RESUMED | CANCELLED | DELAYED | IDLE
  currentStop   : "MYS003"
  nextStop      : "MYS004"
  problemCode   : null          ← "01".."10" or null
  delayMinutes  : 0
  lastUpdated   : 1726589285000

/events/{busId}/{eventId}/
  timestamp   : 1726589285000
  type        : "DELAY"         ← START | STOP | DELAY | CANCEL | PROBLEM | STOP_REACH | RESUME
  message     : "Delay detected at Stop MYS003"
  problemCode : "03"
```

---

## Problem Codes

| Code | Description |
|------|-------------|
| 01 | Mechanical Failure |
| 02 | Traffic Congestion |
| 03 | Road Blockage / Accident |
| 04 | Passenger Incident |
| 05 | Flat Tyre |
| 06 | Fuel Issue |
| 07 | Driver Break |
| 08 | Weather Conditions |
| 09 | Route Obstruction |
| 10 | Other / Unspecified |

---

## Routes (Demo)

| Route ID | Name | Stops |
|----------|------|-------|
| MYS-R01 | Bus Stand → Vijayanagar | 4 stops |
| MYS-R02 | Railway Station → Chamundi Hill | 4 stops |
| MYS-R03 | Bus Stand → Airport | 4 stops |

Add or modify routes by editing the `ROUTES` constant in `js/app.js`.

---

## Deployment

### Netlify
```bash
# Drag-and-drop the project folder at https://app.netlify.com/drop
# OR use the CLI:
npx netlify-cli deploy --dir . --prod
```

### Vercel
```bash
npx vercel --yes
```

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

---

## File Structure

```
LEAP-MYS-10-11-/
├── index.html          ← Main dashboard
├── css/
│   └── style.css       ← Dark-mode design system
├── js/
│   ├── app.js          ← Entry point, Firebase init, route data
│   ├── map.js          ← Leaflet map module
│   ├── fleet.js        ← Fleet state & UI rendering
│   ├── events.js       ← Activity log module
│   ├── eta.js          ← ETA & progress calculations
│   └── demo.js         ← Simulation engine
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | Vanilla CSS (custom properties, grid, animations) |
| Logic | Vanilla JavaScript (ES6+ modules) |
| Map | [Leaflet.js](https://leafletjs.com/) v1.9 + CartoDB Dark tiles |
| Database | [Firebase Realtime Database](https://firebase.google.com/) |
| Fonts | [Inter](https://fonts.google.com/specimen/Inter) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) |
| Deployment | Vercel / Netlify / Firebase Hosting |

---

*LEAP-MYS · SIH 2026*
