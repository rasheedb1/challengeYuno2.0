/**
 * Smart Payment Router — Dashboard
 * Connects via SSE and drives all UI updates.
 */

// ── State ─────────────────────────────────────────────────────────────────────
let simRunning = false;
let processorConfigs = [];
let processorDegraded = {};   // { id: bool }
let processorOverride = {};   // { id: bool|null }
let healthMap = {};           // { id: ProcessorHealth }
const MAX_FEED_ITEMS = 50;

// ── SSE connection ────────────────────────────────────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/events');

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  es.onerror = () => {
    setTimeout(connectSSE, 2000);
    es.close();
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'init':        handleInit(msg.payload);        break;
    case 'health':      handleHealth(msg.payload);      break;
    case 'transaction': handleTransaction(msg.payload); break;
    case 'metrics':     handleMetrics(msg.payload);     break;
    case 'simulation':  handleSimulation(msg.payload);  break;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function handleInit(payload) {
  processorConfigs = payload.processors;

  processorConfigs.forEach(p => {
    processorOverride[p.id] = null;
    processorDegraded[p.id] = false;
  });

  buildProcessorGrid(processorConfigs);
  handleHealth(payload.health);

  const cfg = payload.thresholds;
  setInputValue('cfg-window',   cfg.windowSizeMs);
  setInputValue('cfg-degraded', Math.round(cfg.degradedThreshold * 100));
  setInputValue('cfg-down',     Math.round(cfg.downThreshold * 100));

  payload.transactions.slice().reverse().forEach(tx => prependTransaction(tx, false));
  handleMetrics(payload.metrics);
  handleSimulation(payload.simulation);
}

// ── Processor grid ────────────────────────────────────────────────────────────
function buildProcessorGrid(processors) {
  const grid = document.getElementById('processor-grid');
  grid.textContent = '';
  processors.forEach(p => grid.appendChild(createProcessorCard(p)));
}

/**
 * Build a processor card entirely with DOM API (no innerHTML for dynamic values).
 */
function createProcessorCard(processor) {
  const safeId   = processor.id.replace(/[^a-z0-9_-]/gi, '');
  const safeName = processor.name;

  const card = document.createElement('div');
  card.className = 'processor-card status-healthy';
  card.id = `card-${safeId}`;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'card-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = safeName;

  const pill = document.createElement('span');
  pill.className = 'status-pill pill-healthy';
  pill.id = `pill-${safeId}`;
  pill.textContent = 'Healthy';

  header.appendChild(nameEl);
  header.appendChild(pill);

  // ── Score line ──
  const scoreEl = document.createElement('div');
  scoreEl.className = 'card-score';
  scoreEl.id = `score-${safeId}`;
  scoreEl.textContent = `Score: 100 · $${(processor.costPerTransaction / 100).toFixed(2)}/tx`;

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'card-body';

  body.appendChild(makeStatRow('Success Rate', `sr-val-${safeId}`, `sr-bar-${safeId}`, 'fill-success'));
  body.appendChild(makeStatRow('Error Rate',   `er-val-${safeId}`, `er-bar-${safeId}`, 'fill-error'));
  body.appendChild(makeStatRow('Timeout Rate', `tr-val-${safeId}`, `tr-bar-${safeId}`, 'fill-timeout'));

  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';
  statsGrid.appendChild(makeStatCell('Avg Latency',       `lat-${safeId}`, '—'));
  statsGrid.appendChild(makeStatCell('Requests (window)', `req-${safeId}`, '0'));
  body.appendChild(statsGrid);

  // ── Actions ──
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const btnDegrade = document.createElement('button');
  btnDegrade.className = 'btn btn-sm btn-danger';
  btnDegrade.id = `btn-degrade-${safeId}`;
  btnDegrade.textContent = 'Degrade';
  btnDegrade.addEventListener('click', () => degradeProcessor(safeId));

  const btnRestore = document.createElement('button');
  btnRestore.className = 'btn btn-sm btn-success';
  btnRestore.id = `btn-restore-${safeId}`;
  btnRestore.textContent = 'Restore';
  btnRestore.style.display = 'none';
  btnRestore.addEventListener('click', () => restoreProcessor(safeId));

  const overrideLabel = document.createElement('label');
  overrideLabel.className = 'override-toggle';
  overrideLabel.title = 'Force-enable this processor (ignore health)';

  const overrideText = document.createElement('span');
  overrideText.textContent = 'Override';

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'toggle-switch';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `override-${safeId}`;
  checkbox.addEventListener('change', () => toggleOverride(safeId, checkbox.checked));

  const slider = document.createElement('div');
  slider.className = 'toggle-slider';

  toggleWrap.appendChild(checkbox);
  toggleWrap.appendChild(slider);
  overrideLabel.appendChild(overrideText);
  overrideLabel.appendChild(toggleWrap);

  actions.appendChild(btnDegrade);
  actions.appendChild(btnRestore);
  actions.appendChild(overrideLabel);

  card.appendChild(header);
  card.appendChild(scoreEl);
  card.appendChild(body);
  card.appendChild(actions);

  return card;
}

function makeStatRow(label, valId, barId, fillClass) {
  const row = document.createElement('div');
  row.className = 'stat-row';

  const labelRow = document.createElement('div');
  labelRow.className = 'stat-label-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const valEl = document.createElement('span');
  valEl.id = valId;
  valEl.textContent = '—';

  labelRow.appendChild(labelEl);
  labelRow.appendChild(valEl);

  const barContainer = document.createElement('div');
  barContainer.className = 'progress-bar';

  const barFill = document.createElement('div');
  barFill.className = `progress-fill ${fillClass}`;
  barFill.id = barId;
  barFill.style.width = barId.startsWith('sr-') ? '100%' : '0%';

  barContainer.appendChild(barFill);
  row.appendChild(labelRow);
  row.appendChild(barContainer);
  return row;
}

function makeStatCell(label, id, initial) {
  const cell = document.createElement('div');
  cell.className = 'stat-cell';

  const lbl = document.createElement('div');
  lbl.className = 'stat-cell-label';
  lbl.textContent = label;

  const val = document.createElement('div');
  val.className = 'stat-cell-value';
  val.id = id;
  val.textContent = initial;

  cell.appendChild(lbl);
  cell.appendChild(val);
  return cell;
}

// ── Health updates ────────────────────────────────────────────────────────────
function handleHealth(healthList) {
  healthList.forEach(h => {
    healthMap[h.processorId] = h;
    updateProcessorCard(h);
  });
}

function updateProcessorCard(h) {
  const safeId = h.processorId.replace(/[^a-z0-9_-]/gi, '');
  const card = document.getElementById(`card-${safeId}`);
  if (!card) return;

  card.className = `processor-card status-${h.status}`;

  const pill = document.getElementById(`pill-${safeId}`);
  if (pill) {
    pill.className = `status-pill pill-${h.status}`;
    pill.textContent = capitalize(h.status);
  }

  const scoreEl = document.getElementById(`score-${safeId}`);
  if (scoreEl) {
    const cfg = processorConfigs.find(p => p.id === h.processorId);
    const cost = cfg ? `$${(cfg.costPerTransaction / 100).toFixed(2)}/tx` : '';
    scoreEl.textContent = `Score: ${h.score} · ${cost}`;
  }

  setPct(`sr-val-${safeId}`, `sr-bar-${safeId}`, h.successRate);
  setPct(`er-val-${safeId}`, `er-bar-${safeId}`, h.errorRate);
  setPct(`tr-val-${safeId}`, `tr-bar-${safeId}`, h.timeoutRate);

  setText(`lat-${safeId}`, h.totalRequests > 0 ? `${h.avgLatencyMs}ms` : '—');
  setText(`req-${safeId}`, String(h.totalRequests));
}

function setPct(valId, barId, rate) {
  const pct = Math.round(rate * 100);
  setText(valId, `${pct}%`);
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = `${pct}%`;
}

// ── Simulation control ────────────────────────────────────────────────────────
function handleSimulation(state) {
  simRunning = state.running;
  const btn   = document.getElementById('btn-start');
  const badge = document.getElementById('sim-status-badge');

  if (simRunning) {
    btn.textContent  = '■ Stop Simulation';
    btn.className    = 'btn btn-danger';
    badge.className  = 'badge badge-running';
    badge.textContent = 'Running';
  } else {
    btn.textContent  = '▶ Start Simulation';
    btn.className    = 'btn btn-primary';
    badge.className  = 'badge badge-idle';
    badge.textContent = 'Idle';
  }
}

async function toggleSimulation() {
  const endpoint = simRunning ? '/api/simulation/stop' : '/api/simulation/start';
  await apiPost(endpoint);
}

// ── Processor actions ─────────────────────────────────────────────────────────
async function degradeProcessor(id) {
  await apiPost(`/api/processor/${id}/degrade`);
  processorDegraded[id] = true;
  const btnD = document.getElementById(`btn-degrade-${id}`);
  const btnR = document.getElementById(`btn-restore-${id}`);
  if (btnD) btnD.style.display = 'none';
  if (btnR) btnR.style.display = '';
}

async function restoreProcessor(id) {
  await apiPost(`/api/processor/${id}/restore`);
  processorDegraded[id] = false;
  const btnD = document.getElementById(`btn-degrade-${id}`);
  const btnR = document.getElementById(`btn-restore-${id}`);
  if (btnD) btnD.style.display = '';
  if (btnR) btnR.style.display = 'none';
}

async function toggleOverride(id, enabled) {
  await apiPost(`/api/processor/${id}/override`, { enabled: enabled ? true : null });
  processorOverride[id] = enabled ? true : null;
}

// ── Transaction feed ──────────────────────────────────────────────────────────
function handleTransaction(tx) {
  prependTransaction(tx, true);
}

/**
 * Build a transaction feed row using DOM API to avoid XSS risks.
 */
function prependTransaction(tx, animate) {
  const feed = document.getElementById('tx-feed');

  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = `feed-item ${tx.status}`;
  if (!animate) item.style.animation = 'none';

  const proc = processorConfigs.find(p => p.id === tx.processorId);
  const procName = proc ? proc.name : tx.processorId;

  // Dot
  const dot = document.createElement('div');
  dot.className = `feed-dot dot-${tx.status}`;

  // Processor name
  const nameEl = document.createElement('div');
  nameEl.className = 'feed-processor';
  nameEl.textContent = procName;

  // Status
  const statusEl = document.createElement('div');
  statusEl.className = `feed-status ${tx.status}`;
  statusEl.textContent = capitalize(tx.status);

  // Amount + cost saved
  const amountWrap = document.createElement('div');
  amountWrap.className = 'feed-amount';
  const amountText = document.createTextNode(`$${(tx.amount / 100).toFixed(2)} `);
  amountWrap.appendChild(amountText);
  if (tx.costSaved > 0) {
    const tag = document.createElement('span');
    tag.className = 'cost-saved-tag';
    tag.textContent = `-${(tx.costSaved / 100).toFixed(0)}¢`;
    amountWrap.appendChild(tag);
  }

  // Latency
  const latEl = document.createElement('div');
  latEl.className = 'feed-latency';
  latEl.textContent = `${Math.round(tx.latencyMs)}ms`;

  // Timestamp
  const timeEl = document.createElement('div');
  timeEl.className = 'feed-time';
  timeEl.dataset.ts = String(tx.timestamp);
  timeEl.textContent = 'just now';

  item.appendChild(dot);
  item.appendChild(nameEl);
  item.appendChild(statusEl);
  item.appendChild(amountWrap);
  item.appendChild(latEl);
  item.appendChild(timeEl);

  feed.insertBefore(item, feed.firstChild);

  while (feed.children.length > MAX_FEED_ITEMS) {
    feed.removeChild(feed.lastChild);
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function handleMetrics(metrics) {
  setText('m-total', metrics.totalTransactions.toLocaleString());

  const successRate = metrics.totalTransactions > 0
    ? ((metrics.successfulTransactions / metrics.totalTransactions) * 100).toFixed(1) + '%'
    : '—';
  setText('m-success-rate', successRate);
  setText('m-failed',       metrics.failedTransactions.toLocaleString());
  setText('m-cost-saved',   `$${(metrics.totalCostSaved / 100).toFixed(2)}`);
  setText('m-latency',      `${metrics.avgLatencyMs}ms`);
  setText('m-tps',          metrics.transactionsPerSecond.toFixed(1));
}

// ── Threshold panel ───────────────────────────────────────────────────────────
function toggleThresholdPanel() {
  const panel = document.getElementById('threshold-panel');
  panel.classList.toggle('hidden');
}

async function saveThresholds() {
  const windowSizeMs      = parseInt(document.getElementById('cfg-window').value, 10);
  const degradedThreshold = parseInt(document.getElementById('cfg-degraded').value, 10) / 100;
  const downThreshold     = parseInt(document.getElementById('cfg-down').value, 10) / 100;

  await fetch('/api/thresholds', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ windowSizeMs, degradedThreshold, downThreshold }),
  });

  const msg = document.getElementById('cfg-saved-msg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);
}

// ── Relative timestamps (updated every second) ────────────────────────────────
function updateTimestamps() {
  document.querySelectorAll('.feed-time[data-ts]').forEach(el => {
    const ts  = parseInt(el.dataset.ts, 10);
    const sec = Math.floor((Date.now() - ts) / 1000);
    el.textContent = sec < 5  ? 'just now'
      : sec < 60 ? `${sec}s ago`
      : `${Math.floor(sec / 60)}m ago`;
  });
}
setInterval(updateTimestamps, 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function apiPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
connectSSE();
