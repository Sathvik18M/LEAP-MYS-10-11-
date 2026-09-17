/**
 * events.js — Chronological activity log module
 * LEAP C-Room Dashboard
 *
 * Maintains a capped event log with filtering, export, and live rendering.
 */

const eventsModule = (() => {
  'use strict';

  const MAX_EVENTS = 500;

  /* ─── Problem Code Lookup ─── */
  const PROBLEM_CODES = {
    '01': 'Mechanical Failure',
    '02': 'Traffic Congestion',
    '03': 'Road Blockage / Accident',
    '04': 'Passenger Incident',
    '05': 'Flat Tyre',
    '06': 'Fuel Issue',
    '07': 'Driver Break',
    '08': 'Weather Conditions',
    '09': 'Route Obstruction',
    '10': 'Other / Unspecified',
  };

  /* ─── State ─── */
  let events = [];           // Most-recent first
  let currentFilter = 'all'; // 'all' | event type string
  let busFilter = null;      // busId to filter by, or null

  /* ─── Public: Add Event ─── */
  function addEvent(busId, type, message, problemCode = null) {
    const ev = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      busId,
      type,
      message,
      problemCode,
    };
    events.unshift(ev);
    if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);

    // Update badge count
    const badge = document.getElementById('logCountBadge');
    if (badge) badge.textContent = events.length;

    render();
    return ev;
  }

  /* ─── Public: Set Type Filter ─── */
  function setFilter(filter) {
    currentFilter = filter;
    busFilter = null; // clear bus filter when using type filter

    document.querySelectorAll('.log-filter-btn').forEach(btn => {
      const f = btn.dataset.filter;
      btn.classList.toggle('active', f === filter || (!f && filter === 'all'));
    });
    render();
  }

  /* ─── Public: Filter by Bus ─── */
  function filterByBus(busId) {
    busFilter = busId;
    currentFilter = 'all';
    document.querySelectorAll('.log-filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-filter="all"]')?.classList.add('active');
    render();
  }

  /* ─── Public: Clear ─── */
  function clear() {
    events = [];
    const badge = document.getElementById('logCountBadge');
    if (badge) badge.textContent = '0';
    render();
  }

  /* ─── Public: Export CSV ─── */
  function exportCSV() {
    const rows = [
      ['Timestamp', 'Bus ID', 'Type', 'Message', 'Problem Code', 'Problem Description'],
      ...events.map(ev => [
        new Date(ev.timestamp).toISOString(),
        ev.busId,
        ev.type,
        ev.message,
        ev.problemCode || '',
        ev.problemCode ? (PROBLEM_CODES[ev.problemCode] || '') : '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `croom-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ─── Render ─── */
  function render() {
    const stream = document.getElementById('logStream');
    const emptyMsg = document.getElementById('logEmptyMsg');
    if (!stream) return;

    let filtered = events;

    if (busFilter) {
      filtered = filtered.filter(ev => ev.busId === busFilter);
    }

    if (currentFilter !== 'all') {
      filtered = filtered.filter(ev => ev.type === currentFilter);
    }

    if (filtered.length === 0) {
      stream.innerHTML = '<div class="log-empty-msg" id="logEmptyMsg">No matching events yet…</div>';
      return;
    }

    stream.innerHTML = filtered.slice(0, 200).map(ev => `
      <div class="log-entry" data-bus="${ev.busId}" data-type="${ev.type}">
        <span class="le-time">${fmtTime(ev.timestamp)}</span>
        <span class="le-bus">${ev.busId}</span>
        <span class="le-type lt-${ev.type}">${labelType(ev.type)}</span>
        <span class="le-msg">${escHtml(ev.message)}${ev.problemCode ? ` — Code&nbsp;<b>${ev.problemCode}</b>: ${escHtml(PROBLEM_CODES[ev.problemCode] || '')}` : ''}</span>
      </div>
    `).join('');
  }

  /* ─── Helpers ─── */
  function fmtTime(ts) {
    return new Date(ts).toTimeString().slice(0, 8);
  }

  function labelType(type) {
    const labels = {
      START: 'START', STOP: 'STOP', DELAY: 'DELAY',
      CANCEL: 'CANCEL', PROBLEM: 'PROBLEM',
      STOP_REACH: 'ARRIVAL', RESUME: 'RESUME',
    };
    return labels[type] || type;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getProblemDesc(code) {
    return PROBLEM_CODES[code] || 'Unknown problem';
  }

  return {
    addEvent,
    setFilter,
    filterByBus,
    clear,
    exportCSV,
    render,
    getProblemDesc,
    PROBLEM_CODES,
  };
})();
