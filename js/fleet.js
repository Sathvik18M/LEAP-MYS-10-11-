/**
 * fleet.js — Bus fleet state management & UI rendering
 * LEAP C-Room Dashboard
 *
 * Maintains in-memory fleet state, renders the sidebar fleet list,
 * the detail panel, the stats bar, and the management modal table.
 */

const fleetModule = (() => {
  'use strict';

  /* ─── State ─── */
  let fleet = new Map();      // busId → busData
  let selectedBusId = null;
  let currentFilter = 'all'; // 'all' | 'active' | 'delayed' | 'cancelled'
  let searchQuery = '';
  let _routes = {};

  /* ─── Metadata ─── */
  const STATUS_EMOJI = {
    RUNNING:   '🟢',
    PAUSED:    '🟡',
    RESUMED:   '🔵',
    CANCELLED: '🔴',
    DELAYED:   '⚠️',
    IDLE:      '⚪',
  };

  const STATUS_LABEL = {
    RUNNING:   'Running',
    PAUSED:    'Paused',
    RESUMED:   'Resumed',
    CANCELLED: 'Cancelled',
    DELAYED:   'Delayed',
    IDLE:      'Idle',
  };

  const STATUS_TO_EVENT = {
    RUNNING:   'START',
    PAUSED:    'STOP',
    DELAYED:   'DELAY',
    CANCELLED: 'CANCEL',
    RESUMED:   'RESUME',
  };

  /* ─── Init ─── */
  function init(routes) {
    _routes = routes;
  }

  /* ─── Update Bus ─── */
  function updateBus(busData) {
    const prev = fleet.get(busData.id);

    // Detect status transition → log event
    if (prev && prev.status !== busData.status) {
      const evType = STATUS_TO_EVENT[busData.status] || busData.status;
      eventsModule.addEvent(
        busData.id,
        evType,
        `Bus ${busData.id}: ${STATUS_LABEL[prev.status] || prev.status} → ${STATUS_LABEL[busData.status] || busData.status}`,
        busData.problemCode || null
      );

      // Flash card
      setTimeout(() => {
        const card = document.querySelector(`.fleet-card[data-bus="${busData.id}"]`);
        if (card) { card.classList.add('updated'); setTimeout(() => card.classList.remove('updated'), 800); }
      }, 50);
    }

    fleet.set(busData.id, { ...busData });

    renderSidebar();
    updateStats();

    if (selectedBusId === busData.id) {
      renderDetail(busData);
    }
  }

  /* ─── Filter Controls ─── */
  function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderSidebar();
  }

  function setSearch(query) {
    searchQuery = (query || '').toLowerCase().trim();
    renderSidebar();
  }

  /* ─── Select Bus ─── */
  function selectBus(busId) {
    selectedBusId = busId;
    mapModule.setSelectedBus(busId);

    document.querySelectorAll('.fleet-card').forEach(card =>
      card.classList.toggle('selected', card.dataset.bus === busId)
    );

    const bus = fleet.get(busId);
    if (bus) {
      renderDetail(bus);
      mapModule.panToBus(busId);
      mapModule.highlightRoute(bus.routeId);
    }
  }

  /* ─── Render Sidebar ─── */
  function renderSidebar() {
    const list = document.getElementById('fleetList');
    if (!list) return;

    let buses = [...fleet.values()];

    // Apply filter
    if (currentFilter === 'active') {
      buses = buses.filter(b => ['RUNNING', 'RESUMED'].includes(b.status));
    } else if (currentFilter === 'delayed') {
      buses = buses.filter(b => ['DELAYED', 'PAUSED'].includes(b.status));
    } else if (currentFilter === 'cancelled') {
      buses = buses.filter(b => b.status === 'CANCELLED');
    }

    // Apply search
    if (searchQuery) {
      buses = buses.filter(b =>
        b.id.toLowerCase().includes(searchQuery) ||
        (b.routeId || '').toLowerCase().includes(searchQuery) ||
        (b.driverId || '').toLowerCase().includes(searchQuery)
      );
    }

    // Sort: priority — delayed/cancelled first, then by ID
    const priority = { DELAYED: 0, CANCELLED: 1, PAUSED: 2, RUNNING: 3, RESUMED: 4, IDLE: 5 };
    buses.sort((a, b) => {
      const pa = priority[a.status] ?? 9;
      const pb = priority[b.status] ?? 9;
      return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
    });

    if (buses.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="spinner"></div>
          <p>${fleet.size === 0 ? 'Waiting for buses…' : 'No buses match filter'}</p>
        </div>`;
      return;
    }

    list.innerHTML = buses.map(bus => {
      const route = _routes[bus.routeId];
      const eta = etaModule.calcEta(bus, _routes);
      const label = STATUS_LABEL[bus.status] || bus.status;
      const emoji = STATUS_EMOJI[bus.status] || '⚪';

      return `
        <div class="fleet-card st-${bus.status} ${bus.id === selectedBusId ? 'selected' : ''}"
             data-bus="${bus.id}"
             onclick="app.selectBus('${bus.id}')"
             role="button"
             tabindex="0"
             aria-label="Bus ${bus.id} - ${label}"
             onkeydown="if(event.key==='Enter')app.selectBus('${bus.id}')">
          <div class="fc-row1">
            <span class="fc-bus-id">${bus.id}</span>
            <span class="fc-status-pill pill-${bus.status}">${emoji} ${label}</span>
          </div>
          <div class="fc-route">${route ? route.name : (bus.routeId || '—')}</div>
          <div class="fc-row2">
            <span class="fc-speed">${bus.speed || 0} km/h</span>
            ${eta !== null ? `<span class="fc-eta">ETA ${etaModule.formatEta(eta)}</span>` : ''}
            ${bus.delayMinutes > 0 ? `<span class="fc-delay">+${bus.delayMinutes}m</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ─── Render Detail Panel ─── */
  function renderDetail(bus) {
    const placeholder = document.getElementById('detailPlaceholder');
    const content = document.getElementById('detailContent');
    if (!placeholder || !content) return;

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    // Header
    document.getElementById('detailBusId').textContent = bus.id;
    const badge = document.getElementById('detailStatusBadge');
    badge.textContent = `${STATUS_EMOJI[bus.status] || ''} ${STATUS_LABEL[bus.status] || bus.status}`;
    badge.className = `detail-status-badge pill-${bus.status}`;

    // Metrics
    const eta = etaModule.calcEta(bus, _routes);
    document.getElementById('detailSpeed').textContent = `${bus.speed || 0} km/h`;
    document.getElementById('detailEta').textContent = etaModule.formatEta(eta);
    const delayEl = document.getElementById('detailDelay');
    delayEl.textContent = bus.delayMinutes > 0 ? `+${Math.round(bus.delayMinutes)} min` : '0 min';
    delayEl.style.color = bus.delayMinutes > 0 ? 'var(--c-delayed)' : 'var(--tx-primary)';

    // Route & stops
    const route = _routes[bus.routeId];
    document.getElementById('detailRouteName').textContent = route ? route.name : (bus.routeId || '—');
    document.getElementById('detailRouteId').textContent = bus.routeId || '—';

    if (route) {
      const cur = route.stops.find(s => s.id === bus.currentStop);
      const nxt = route.stops.find(s => s.id === bus.nextStop);
      document.getElementById('detailCurrentStop').textContent = cur ? cur.name : (bus.currentStop || '—');
      document.getElementById('detailNextStop').textContent = nxt ? nxt.name : (bus.nextStop || '—');

      const pct = etaModule.calcProgress(bus, _routes);
      document.getElementById('detailProgress').style.width = pct + '%';
      document.getElementById('progressPct').textContent = pct + '%';
      document.getElementById('progressStart').textContent = route.stops[0]?.name || '—';
      document.getElementById('progressEnd').textContent = route.stops[route.stops.length - 1]?.name || '—';
    }

    // Driver / device
    document.getElementById('detailDriver').textContent = bus.driverId || '—';
    document.getElementById('detailDevice').textContent = bus.deviceId || '—';
    document.getElementById('detailLastUpdate').textContent =
      bus.lastUpdated ? new Date(bus.lastUpdated).toTimeString().slice(0, 8) : '—';

    // Problem
    const probSec = document.getElementById('problemSection');
    if (bus.problemCode) {
      probSec.classList.remove('hidden');
      document.getElementById('problemCode').textContent = `Code ${bus.problemCode}`;
      document.getElementById('problemDesc').textContent = eventsModule.getProblemDesc(bus.problemCode);
    } else {
      probSec.classList.add('hidden');
    }

    // Delay
    const delaySec = document.getElementById('delaySection');
    if (bus.delayMinutes > 0) {
      delaySec.classList.remove('hidden');
      document.getElementById('delayDuration').textContent = `+${Math.round(bus.delayMinutes)} minutes`;
    } else {
      delaySec.classList.add('hidden');
    }
  }

  /* ─── Update Stats Bar ─── */
  function updateStats() {
    const buses = [...fleet.values()];
    const total = buses.length;
    if (total === 0) return;

    const active    = buses.filter(b => ['RUNNING', 'RESUMED'].includes(b.status)).length;
    const delayed   = buses.filter(b => b.status === 'DELAYED').length;
    const cancelled = buses.filter(b => b.status === 'CANCELLED').length;
    const ontime    = Math.round(((total - delayed - cancelled) / total) * 100);

    document.getElementById('statActive').textContent    = active;
    document.getElementById('statDelayed').textContent   = delayed;
    document.getElementById('statCancelled').textContent = cancelled;
    document.getElementById('statOntime').textContent    = `${ontime}%`;
  }

  /* ─── Render Management Modal ─── */
  function renderManagement() {
    const body = document.getElementById('mgmtBody');
    if (!body) return;

    const buses = [...fleet.values()];

    body.innerHTML = `
      <table class="mgmt-table">
        <thead>
          <tr>
            <th>Bus ID</th>
            <th>Status</th>
            <th>Route</th>
            <th>Driver ID</th>
            <th>Device ID</th>
            <th>Speed</th>
            <th>Delay</th>
          </tr>
        </thead>
        <tbody>
          ${buses.map(bus => {
            const route = _routes[bus.routeId];
            return `
              <tr>
                <td>${bus.id}</td>
                <td><span class="fc-status-pill pill-${bus.status}">${STATUS_EMOJI[bus.status] || ''} ${STATUS_LABEL[bus.status] || bus.status}</span></td>
                <td>${route ? route.name : (bus.routeId || '—')}</td>
                <td>${bus.driverId || '—'}</td>
                <td>${bus.deviceId || '—'}</td>
                <td>${bus.speed || 0} km/h</td>
                <td style="color:${bus.delayMinutes > 0 ? 'var(--c-delayed)' : 'inherit'}">${bus.delayMinutes > 0 ? `+${Math.round(bus.delayMinutes)} min` : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${buses.length === 0 ? '<p style="color:var(--tx-muted);padding:20px;text-align:center;">No buses connected</p>' : ''}
    `;
  }

  /* ─── Public API ─── */
  return {
    init,
    updateBus,
    setFilter,
    setSearch,
    selectBus,
    renderSidebar,
    renderDetail,
    renderManagement,
    getSelectedBus: () => selectedBusId,
    getFleet: () => fleet,
  };
})();
