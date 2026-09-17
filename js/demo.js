/**
 * demo.js — Fleet Simulation Engine
 * LEAP C-Room Dashboard
 *
 * Simulates 6 buses driving along 3 Mysuru routes.
 * Randomises delays, problems, pauses, and cancellations.
 * Writes bus state updates via a callback — same code path
 * as real Firebase data, so swapping to live data requires
 * only changing app.js.
 */

const demoModule = (() => {
  'use strict';

  /* ─── Demo Bus Configurations ─── */
  const DEMO_BUSES = [
    { id: '178-1', routeId: 'MYS-R01', driverId: 'D-041', deviceId: 'ESP-101', startStopIdx: 0 },
    { id: '178-2', routeId: 'MYS-R01', driverId: 'D-042', deviceId: 'ESP-102', startStopIdx: 1 },
    { id: '178-3', routeId: 'MYS-R02', driverId: 'D-043', deviceId: 'ESP-103', startStopIdx: 0 },
    { id: '178-4', routeId: 'MYS-R02', driverId: 'D-044', deviceId: 'ESP-104', startStopIdx: 2 },
    { id: '178-5', routeId: 'MYS-R03', driverId: 'D-045', deviceId: 'ESP-105', startStopIdx: 0 },
    { id: '178-6', routeId: 'MYS-R03', driverId: 'D-046', deviceId: 'ESP-106', startStopIdx: 1 },
  ];

  /* ─── Problem codes to randomly assign ─── */
  const PROBLEM_POOL = ['01', '02', '03', '05', '06', '07', '09'];

  /* ─── Internal per-bus simulation state ─── */
  let busStates = {};
  let tickInterval = null;

  /* ─── Linear interpolation ─── */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ─── Gaussian-like jitter (tiny GPS noise) ─── */
  function jitter(scale = 0.0004) {
    return (Math.random() + Math.random() - 1) * scale;
  }

  /* ─── Build initial state for one bus ─── */
  function _initBusState(cfg, routes) {
    const route = routes[cfg.routeId];
    if (!route || !route.stops.length) return null;
    const stops = route.stops;
    const idx = Math.min(cfg.startStopIdx, stops.length - 2);

    return {
      // Identity
      id:        cfg.id,
      routeId:   cfg.routeId,
      driverId:  cfg.driverId,
      deviceId:  cfg.deviceId,

      // Position
      lat: stops[idx].lat + jitter(0.003),
      lng: stops[idx].lng + jitter(0.003),
      speed: 22 + Math.floor(Math.random() * 18),

      // Route progress
      currentStop:    stops[idx].id,
      nextStop:       stops[idx + 1]?.id || stops[idx].id,
      targetStopIdx:  idx + 1 < stops.length ? idx + 1 : idx,
      legProgress:    Math.random() * 0.3, // 0→1 along current leg

      // Status
      status:        'RUNNING',
      delayMinutes:  0,
      problemCode:   null,

      // Internal timers
      pauseTicks:    0,  // ticks remaining in paused/delayed state
      cancelledAt:   null,

      lastUpdated: Date.now(),
    };
  }

  /* ─── Advance one bus by one tick ─── */
  function _tickBus(state, routes, onUpdate) {
    const route = routes[state.routeId];
    if (!route) return;
    const stops = route.stops;

    state.lastUpdated = Date.now();

    /* Cancelled — stays stationary */
    if (state.status === 'CANCELLED') {
      state.speed = 0;
      onUpdate(_snapshot(state));
      return;
    }

    /* Paused / Delayed — count down then resume */
    if (state.status === 'PAUSED' || state.status === 'DELAYED') {
      state.speed = 0;
      state.pauseTicks--;
      if (state.delayMinutes > 0) state.delayMinutes = Math.max(0, state.delayMinutes - 0.25);

      if (state.pauseTicks <= 0) {
        // Resume
        state.status = 'RESUMED';
        state.pauseTicks = 0;
        eventsModule.addEvent(state.id, 'RESUME', `Bus ${state.id} resumed service`);

        // Transition to RUNNING after 2 more ticks
        setTimeout(() => {
          if (busStates[state.id]) {
            busStates[state.id].status = 'RUNNING';
            busStates[state.id].problemCode = null;
          }
        }, 3000);
      }

      onUpdate(_snapshot(state));
      return;
    }

    /* ── Moving: advance along current leg ── */
    const progressStep = 0.025 + Math.random() * 0.018; // vary speed
    state.legProgress = Math.min(1, state.legProgress + progressStep);

    const fromStop = stops[Math.max(0, state.targetStopIdx - 1)];
    const toStop   = stops[state.targetStopIdx];

    if (!toStop) {
      // Reached end of route — loop back to start
      _resetToStart(state, stops);
      onUpdate(_snapshot(state));
      return;
    }

    state.lat   = lerp(fromStop.lat, toStop.lat, state.legProgress) + jitter(0.0003);
    state.lng   = lerp(fromStop.lng, toStop.lng, state.legProgress) + jitter(0.0003);
    state.speed = 18 + Math.floor(Math.random() * 24);

    /* ── Reached next stop ── */
    if (state.legProgress >= 1) {
      state.legProgress    = 0;
      state.currentStop    = toStop.id;
      state.lat            = toStop.lat + jitter(0.0002);
      state.lng            = toStop.lng + jitter(0.0002);
      state.speed          = 0;
      state.targetStopIdx++;

      if (state.targetStopIdx >= stops.length) {
        // Completed route — restart from first stop
        _resetToStart(state, stops);
        eventsModule.addEvent(state.id, 'STOP_REACH', `Route completed — returning to ${stops[0].name}`);
      } else {
        state.nextStop = stops[state.targetStopIdx]?.id || stops[0].id;
        eventsModule.addEvent(state.id, 'STOP_REACH', `Arrived at ${toStop.name}`);

        /* Random delay/problem (~15% chance, only after 1st stop) */
        if (state.targetStopIdx > 1 && Math.random() < 0.15) {
          const code = PROBLEM_POOL[Math.floor(Math.random() * PROBLEM_POOL.length)];
          state.status       = 'DELAYED';
          state.problemCode  = code;
          state.delayMinutes = 3 + Math.floor(Math.random() * 7);
          state.pauseTicks   = 7 + Math.floor(Math.random() * 8);
          eventsModule.addEvent(state.id, 'DELAY',   `Delay detected at ${toStop.name} — ${state.delayMinutes} min`, code);
          eventsModule.addEvent(state.id, 'PROBLEM', `Driver reported problem at ${toStop.name}`, code);
        }

        /* Random cancellation (~3% chance, only after stop 1) */
        else if (state.targetStopIdx > 1 && Math.random() < 0.03) {
          state.status = 'CANCELLED';
          eventsModule.addEvent(state.id, 'CANCEL', `Trip cancelled at ${toStop.name} — operator notified`);

          // Auto-revive bus after 30 ticks (~45 seconds) for demo continuity
          setTimeout(() => {
            if (busStates[state.id]?.status === 'CANCELLED') {
              _resetToStart(busStates[state.id], stops);
              busStates[state.id].status = 'RUNNING';
              eventsModule.addEvent(state.id, 'START', `Bus ${state.id} redeployed on route`);
            }
          }, 45000);
        }
      }
    }

    onUpdate(_snapshot(state));
  }

  function _resetToStart(state, stops) {
    state.targetStopIdx = 1;
    state.currentStop   = stops[0].id;
    state.nextStop      = stops[1].id;
    state.lat           = stops[0].lat + jitter(0.001);
    state.lng           = stops[0].lng + jitter(0.001);
    state.legProgress   = 0;
    state.speed         = 0;
    state.delayMinutes  = 0;
    state.problemCode   = null;
    if (state.status !== 'CANCELLED') state.status = 'RUNNING';
  }

  /* ─── Shallow snapshot for callbacks (avoids mutating external code) ─── */
  function _snapshot(state) {
    return { ...state };
  }

  /* ─── Public: Start Simulation ─── */
  function start(routes, onUpdate) {
    // Initialise all buses
    DEMO_BUSES.forEach(cfg => {
      const s = _initBusState(cfg, routes);
      if (!s) return;
      busStates[cfg.id] = s;
      eventsModule.addEvent(cfg.id, 'START', `Bus ${cfg.id} connected on ${routes[cfg.routeId]?.name || cfg.routeId}`);
      onUpdate(_snapshot(s));
    });

    // Tick every 1500 ms
    tickInterval = setInterval(() => {
      Object.keys(busStates).forEach(busId => {
        _tickBus(busStates[busId], routes, onUpdate);
      });
    }, 1500);

    return () => stop(); // return stop handle
  }

  /* ─── Public: Stop Simulation ─── */
  function stop() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    busStates = {};
  }

  return { start, stop };
})();
