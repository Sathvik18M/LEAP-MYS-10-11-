/**
 * eta.js — ETA & route-progress calculation utilities
 * LEAP C-Room Dashboard
 */

const etaModule = (() => {
  'use strict';

  /**
   * Haversine formula — great-circle distance between two coordinates.
   * @returns Distance in kilometres
   */
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Calculate ETA in minutes to the next stop.
   * @param {Object} bus   Bus data object
   * @param {Object} routes  All route definitions
   * @returns {number|null} ETA in minutes, or null if not calculable
   */
  function calcEta(bus, routes) {
    if (!bus || !bus.lat || !bus.lng || !bus.nextStop || !bus.routeId) return null;
    const route = routes[bus.routeId];
    if (!route) return null;
    const nextStop = route.stops.find(s => s.id === bus.nextStop);
    if (!nextStop) return null;

    const distKm = haversine(bus.lat, bus.lng, nextStop.lat, nextStop.lng);
    const speedKph = (bus.speed && bus.speed > 2) ? bus.speed : 18; // default 18 km/h if near-stopped
    const etaMins = (distKm / speedKph) * 60;
    return Math.max(0, Math.round(etaMins));
  }

  /**
   * Calculate route progress as a percentage (0–100).
   * @param {Object} bus    Bus data object
   * @param {Object} routes  All route definitions
   * @returns {number} Progress percentage
   */
  function calcProgress(bus, routes) {
    if (!bus || !bus.routeId || !bus.currentStop) return 0;
    const route = routes[bus.routeId];
    if (!route || route.stops.length < 2) return 0;
    const idx = route.stops.findIndex(s => s.id === bus.currentStop);
    if (idx < 0) return 0;
    return Math.round((idx / (route.stops.length - 1)) * 100);
  }

  /**
   * Format ETA for display.
   * @param {number|null} mins
   * @returns {string}
   */
  function formatEta(mins) {
    if (mins === null || mins === undefined) return '—';
    if (mins === 0) return 'Arriving';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  return { haversine, calcEta, calcProgress, formatEta };
})();
