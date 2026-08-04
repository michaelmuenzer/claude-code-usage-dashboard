const charts = {};

function isDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Canvas can't read CSS custom properties, so the same palette validated for
// the page chrome (docs/... dataviz palette check) is mirrored here in JS.
function palette() {
  return isDarkMode()
    ? {
        surface: '#30302e',
        grid: '#3a3a37',
        axisText: '#8a8880',
        tool: '#d67350',
        skill: '#16967f',
        plugin: '#b8860b',
        danger: '#e2726a',
      }
    : {
        surface: '#ffffff',
        grid: '#e8e6dd',
        axisText: '#93918a',
        tool: '#d97757',
        skill: '#16967f',
        plugin: '#b8860b',
        danger: '#c1443b',
      };
}

function withAlpha(hex, alpha) {
  const value = parseInt(hex.replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatBucketLabel(bucket) {
  const date = new Date(bucket.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return bucket;
  const isMidnight = date.getHours() === 0 && date.getMinutes() === 0;
  return isMidnight
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function baseScales() {
  const p = palette();
  return {
    x: {
      grid: { display: false },
      ticks: { color: p.axisText, font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: p.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: p.axisText, font: { size: 11 }, precision: 0 },
    },
  };
}

function tooltipOptions() {
  const p = palette();
  return {
    backgroundColor: isDarkMode() ? '#1c1c1b' : '#1f1e1d',
    titleColor: '#f5f4ee',
    bodyColor: '#f5f4ee',
    borderColor: p.grid,
    borderWidth: 0,
    padding: 10,
    cornerRadius: 6,
    displayColors: false,
  };
}

function barChartData(rows, labelKey, valueKey, hueKey) {
  const p = palette();
  return {
    labels: rows.map((r) => r[labelKey]),
    datasets: [
      {
        data: rows.map((r) => r[valueKey]),
        backgroundColor: p[hueKey],
        borderRadius: 4,
        maxBarThickness: 24,
        barPercentage: 0.9,
        categoryPercentage: 0.7,
      },
    ],
  };
}

function barChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: tooltipOptions() },
    scales: baseScales(),
  };
}

function lineChartData(rows, labelKey, valueKey, hueKey) {
  const p = palette();
  const hue = p[hueKey];
  return {
    labels: rows.map((r) => formatBucketLabel(r[labelKey])),
    datasets: [
      {
        data: rows.map((r) => r[valueKey]),
        borderColor: hue,
        backgroundColor: withAlpha(hue, 0.1),
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBackgroundColor: hue,
        pointBorderColor: p.surface,
        pointBorderWidth: 2,
      },
    ],
  };
}

function lineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: tooltipOptions() },
    scales: baseScales(),
    interaction: { mode: 'nearest', intersect: false },
  };
}

function upsertChart(canvasId, type, data, options) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (charts[canvasId]) {
    charts[canvasId].data = data;
    charts[canvasId].options = options;
    charts[canvasId].update();
    return;
  }
  charts[canvasId] = new Chart(ctx, { type, data, options });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

// datetime-local inputs report the visitor's local wall-clock time with no
// timezone info attached — `new Date(value)` parses that as local time, and
// toISOString() converts it to the UTC instant the backend expects (see
// parseDateRange in routes.ts).
function currentMinutes() {
  const value = document.getElementById('dateRangeFilter').value;
  if (value === 'custom') {
    const start = document.getElementById('dateRangeStart').value;
    const end = document.getElementById('dateRangeEnd').value;
    if (!start || !end) return '';
    return `start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`;
  }
  return value ? `minutes=${encodeURIComponent(value)}` : '';
}

function toDateTimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function updateCustomDateRangeVisibility() {
  const isCustom = document.getElementById('dateRangeFilter').value === 'custom';
  document.getElementById('customDateRangeField').hidden = !isCustom;
  if (!isCustom) return;
  const startInput = document.getElementById('dateRangeStart');
  const endInput = document.getElementById('dateRangeEnd');
  if (startInput.value && endInput.value) return;
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  endInput.value = toDateTimeLocalValue(end);
  startInput.value = toDateTimeLocalValue(start);
}

function currentProject() {
  const value = document.getElementById('projectFilter').value;
  return value ? `project=${encodeURIComponent(value)}` : '';
}

function queryString(...parts) {
  const joined = parts.filter(Boolean).join('&');
  return joined ? `?${joined}` : '';
}

function populateSelect(selectEl, values, placeholder) {
  const previousValue = selectEl.value;
  selectEl.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = placeholder;
  selectEl.appendChild(allOption);
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  }
  if (seen.has(previousValue)) selectEl.value = previousValue;
}

// Tools explicitly unchecked in the multi-select — everything else is
// checked, including tools that show up later, so "all checked" (the
// default) never needs to be tracked as a set of every known tool name.
let uncheckedTools = new Set();

function toolCheckboxes() {
  return Array.from(document.querySelectorAll('#toolFilterOptions input[type="checkbox"]'));
}

function selectedTools() {
  return toolCheckboxes()
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function updateToolFilterSummary() {
  const all = toolCheckboxes();
  const selected = all.filter((cb) => cb.checked);
  const summary = document.getElementById('toolFilterSummary');
  if (all.length === 0 || selected.length === all.length) summary.textContent = 'All tools';
  else if (selected.length === 0) summary.textContent = 'No tools';
  else summary.textContent = `${selected.length} of ${all.length} tools`;
}

// Absent `tool` param means "no filter" (all tools); an explicit `tool=`
// (empty string) is "everything unchecked" and must match nothing — see
// parseToolFilter in routes.ts, which keeps that distinction server-side.
function currentToolQuery() {
  const all = toolCheckboxes();
  const selected = selectedTools();
  if (all.length === 0 || selected.length === all.length) return '';
  return `tool=${encodeURIComponent(selected.join(','))}`;
}

function populateToolCheckboxes(values) {
  const container = document.getElementById('toolFilterOptions');
  container.innerHTML = '';
  for (const value of values) {
    const label = document.createElement('label');
    label.className = 'multi-select-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.checked = !uncheckedTools.has(value);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) uncheckedTools.delete(value);
      else uncheckedTools.add(value);
      updateToolFilterSummary();
      refresh().catch((err) => console.error('Failed to refresh after tool filter change:', err));
    });
    const labelText = document.createElement('span');
    labelText.textContent = value;
    label.append(checkbox, labelText);
    container.appendChild(label);
  }
  updateToolFilterSummary();
}

document.getElementById('toolFilterSelectAll').addEventListener('click', () => {
  uncheckedTools.clear();
  toolCheckboxes().forEach((cb) => (cb.checked = true));
  updateToolFilterSummary();
  refresh().catch((err) => console.error('Failed to refresh after selecting all tools:', err));
});

document.getElementById('toolFilterClearAll').addEventListener('click', () => {
  uncheckedTools = new Set(toolCheckboxes().map((cb) => cb.value));
  toolCheckboxes().forEach((cb) => (cb.checked = false));
  updateToolFilterSummary();
  refresh().catch((err) => console.error('Failed to refresh after clearing all tools:', err));
});

document.addEventListener('click', (event) => {
  const details = document.getElementById('toolFilterDetails');
  if (details.open && !details.contains(event.target)) details.open = false;
});

async function loadDropdowns() {
  const minutes = currentMinutes();
  const project = currentProject();
  const [tools, skills, projects] = await Promise.all([
    fetchJson(`/api/tools${queryString(minutes, project)}`),
    fetchJson(`/api/skills${queryString(minutes, project)}`),
    fetchJson(`/api/projects${queryString(minutes)}`),
  ]);
  populateToolCheckboxes(tools.map((r) => r.tool));
  populateSelect(
    document.getElementById('skillFilter'),
    skills.map((r) => r.skill_name),
    'All skills'
  );
  populateSelect(
    document.getElementById('projectFilter'),
    projects.map((r) => r.project),
    'All projects'
  );
}

function renderToolCallsBySkillTable(rows) {
  const bySkill = new Map();
  for (const row of rows) {
    if (!bySkill.has(row.skill_name)) bySkill.set(row.skill_name, []);
    bySkill.get(row.skill_name).push(row);
  }
  const container = document.getElementById('toolCallsBySkillTable');
  container.innerHTML = '';
  for (const [skillName, toolRows] of bySkill) {
    const heading = document.createElement('h3');
    heading.textContent = skillName;
    container.appendChild(heading);
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tool</th><th>Calls</th></tr>';
    const tbody = document.createElement('tbody');
    for (const row of toolRows) {
      const tr = document.createElement('tr');
      const toolCell = document.createElement('td');
      toolCell.textContent = row.tool;
      const callsCell = document.createElement('td');
      callsCell.textContent = String(row.calls);
      tr.append(toolCell, callsCell);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    container.appendChild(table);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// A dependency-free Sankey-style ribbon diagram: skills on the left, tools on
// the right, ribbon width proportional to co-occurrence call count. Reuses
// the same same-trace co-occurrence data as the Tool Calls by Skill table
// (and carries the same attribution caveat — see the page footer). Plain
// SVG, not Chart.js/canvas, so it can reference CSS custom properties
// directly and repaints correctly on theme change with no JS involved.
function renderSkillToolFlow(rows) {
  const container = document.getElementById('skillToolFlow');
  container.innerHTML = '';

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'proxy-note';
    empty.textContent = 'No skill/tool co-occurrence data in this date range.';
    container.appendChild(empty);
    return;
  }

  const skillTotals = new Map();
  const toolTotals = new Map();
  for (const row of rows) {
    skillTotals.set(row.skill_name, (skillTotals.get(row.skill_name) || 0) + row.calls);
    toolTotals.set(row.tool, (toolTotals.get(row.tool) || 0) + row.calls);
  }
  const skills = Array.from(skillTotals.entries()).sort((a, b) => b[1] - a[1]);
  const tools = Array.from(toolTotals.entries()).sort((a, b) => b[1] - a[1]);
  const grandTotal = rows.reduce((sum, row) => sum + row.calls, 0);

  const width = 720;
  const nodeWidth = 12;
  const gap = 6;
  const leftX = 0;
  const rightX = width - nodeWidth;
  const minNodeHeight = 4;
  const availableHeight = 420;
  // Only individual node heights get floored to minNodeHeight (so tiny nodes
  // stay visible) — the scale factor itself must not be floored, or it
  // inflates every node and blows past availableHeight entirely.
  const pxPerCall = Math.max(
    0.1,
    (availableHeight - gap * Math.max(skills.length, tools.length)) / grandTotal
  );

  const skillNodes = new Map();
  let cursor = 0;
  for (const [name, total] of skills) {
    const height = Math.max(total * pxPerCall, minNodeHeight);
    skillNodes.set(name, { total, y0: cursor, height });
    cursor += height + gap;
  }
  const skillTrackHeight = cursor - gap;

  const toolNodes = new Map();
  cursor = 0;
  for (const [name, total] of tools) {
    const height = Math.max(total * pxPerCall, minNodeHeight);
    toolNodes.set(name, { total, y0: cursor, height });
    cursor += height + gap;
  }
  const toolTrackHeight = cursor - gap;
  const height = Math.max(skillTrackHeight, toolTrackHeight);

  const toolRank = new Map(tools.map(([name], i) => [name, i]));
  const skillRank = new Map(skills.map(([name], i) => [name, i]));
  const linksBySkill = new Map();
  const linksByTool = new Map();
  for (const row of rows) {
    if (!linksBySkill.has(row.skill_name)) linksBySkill.set(row.skill_name, []);
    linksBySkill.get(row.skill_name).push(row);
    if (!linksByTool.has(row.tool)) linksByTool.set(row.tool, []);
    linksByTool.get(row.tool).push(row);
  }
  for (const list of linksBySkill.values()) list.sort((a, b) => toolRank.get(a.tool) - toolRank.get(b.tool));
  for (const list of linksByTool.values()) list.sort((a, b) => skillRank.get(a.skill_name) - skillRank.get(b.skill_name));

  const linkKey = (row) => `${row.skill_name} ${row.tool}`;
  const skillSlice = new Map();
  for (const [skillName, list] of linksBySkill) {
    const node = skillNodes.get(skillName);
    let offset = node.y0;
    for (const row of list) {
      const h = (row.calls / node.total) * node.height;
      skillSlice.set(linkKey(row), { y0: offset, y1: offset + h });
      offset += h;
    }
  }
  const toolSlice = new Map();
  for (const [toolName, list] of linksByTool) {
    const node = toolNodes.get(toolName);
    let offset = node.y0;
    for (const row of list) {
      const h = (row.calls / node.total) * node.height;
      toolSlice.set(linkKey(row), { y0: offset, y1: offset + h });
      offset += h;
    }
  }

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: `${height}`,
    role: 'img',
    'aria-label': 'Skill to tool call flow',
  });

  const ribbonX0 = leftX + nodeWidth;
  const ribbonX1 = rightX;
  const xm = (ribbonX0 + ribbonX1) / 2;
  for (const row of rows) {
    const s = skillSlice.get(linkKey(row));
    const t = toolSlice.get(linkKey(row));
    const d = `M${ribbonX0},${s.y0} C${xm},${s.y0} ${xm},${t.y0} ${ribbonX1},${t.y0} L${ribbonX1},${t.y1} C${xm},${t.y1} ${xm},${s.y1} ${ribbonX0},${s.y1} Z`;
    const path = svgEl('path', { d, fill: 'var(--chart-skill)', opacity: '0.25' });
    path.appendChild(svgEl('title', {})).textContent = `${row.skill_name} → ${row.tool}: ${row.calls} call${row.calls === 1 ? '' : 's'}`;
    svg.appendChild(path);
  }

  for (const [name, node] of skillNodes) {
    const rect = svgEl('rect', { x: leftX, y: node.y0, width: nodeWidth, height: node.height, fill: 'var(--chart-skill)' });
    rect.appendChild(svgEl('title', {})).textContent = `${name}: ${node.total} call${node.total === 1 ? '' : 's'}`;
    svg.appendChild(rect);
    const label = svgEl('text', {
      x: leftX + nodeWidth + 6,
      y: node.y0 + node.height / 2,
      'dominant-baseline': 'middle',
      'font-size': '11',
      fill: 'var(--text-primary)',
    });
    label.textContent = name;
    svg.appendChild(label);
  }

  for (const [name, node] of toolNodes) {
    const rect = svgEl('rect', { x: rightX, y: node.y0, width: nodeWidth, height: node.height, fill: 'var(--chart-tool)' });
    rect.appendChild(svgEl('title', {})).textContent = `${name}: ${node.total} call${node.total === 1 ? '' : 's'}`;
    svg.appendChild(rect);
    const label = svgEl('text', {
      x: rightX - 6,
      y: node.y0 + node.height / 2,
      'text-anchor': 'end',
      'dominant-baseline': 'middle',
      'font-size': '11',
      fill: 'var(--text-primary)',
    });
    label.textContent = name;
    svg.appendChild(label);
  }

  container.appendChild(svg);
}

function formatPromptTimestamp(timestamp) {
  const date = new Date(timestamp.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Shared by anything that shows a long, possibly-multi-line piece of text
// (prompt bodies, error messages) clamped to 2 lines with a Show more/less
// toggle — never hard-truncated. The toggle only appears once attached to a
// visible container, since only then does scrollHeight reflect real overflow.
function createExpandableText(fullText) {
  const text = document.createElement('div');
  text.className = 'expandable-text';
  text.textContent = fullText;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'expandable-toggle';
  toggle.textContent = 'Show more';
  toggle.hidden = true;
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const expanded = text.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });

  return { text, toggle };
}

function revealExpandableToggleIfNeeded(text, toggle) {
  if (text.scrollHeight > text.clientHeight + 1) {
    toggle.hidden = false;
  }
}

const TOP_TOKEN_PROMPTS_COLUMNS = [
  { key: 'prompt', label: 'Prompt', defaultDirection: 'asc' },
  { key: 'timestamp', label: 'Time', defaultDirection: 'desc' },
  { key: 'total_tokens', label: 'Total Tokens', defaultDirection: 'desc' },
];

let topTokenPromptsRows = [];
let topTokenPromptsSort = { column: 'timestamp', direction: 'desc' };
let topTokenPromptsPage = 1;
const TOP_TOKEN_PROMPTS_PAGE_SIZE = 5;

function compareTopTokenPromptRows(a, b, column) {
  if (column === 'timestamp') return new Date(a.timestamp.replace(' ', 'T')) - new Date(b.timestamp.replace(' ', 'T'));
  if (column === 'total_tokens') return a.total_tokens - b.total_tokens;
  return a.prompt.localeCompare(b.prompt);
}

function renderTopTokenPrompts(rows) {
  topTokenPromptsRows = rows;
  topTokenPromptsPage = 1;
  renderTopTokenPromptsTable();
}

function renderTopTokenPromptsTable() {
  const container = document.getElementById('topTokenPrompts');
  container.innerHTML = '';
  if (topTokenPromptsRows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'proxy-note';
    empty.textContent = 'No token usage data in this date range.';
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of TOP_TOKEN_PROMPTS_COLUMNS) {
    const th = document.createElement('th');
    th.className = 'sortable';
    const isSorted = topTokenPromptsSort.column === col.key;
    if (isSorted) th.classList.add('sorted');
    const label = document.createElement('span');
    label.textContent = col.label;
    const arrow = document.createElement('span');
    arrow.className = 'sort-arrow';
    arrow.textContent = isSorted ? (topTokenPromptsSort.direction === 'asc' ? '▲' : '▼') : '⇅';
    th.append(label, arrow);
    th.addEventListener('click', () => {
      topTokenPromptsSort =
        topTokenPromptsSort.column === col.key
          ? { column: col.key, direction: topTokenPromptsSort.direction === 'asc' ? 'desc' : 'asc' }
          : { column: col.key, direction: col.defaultDirection };
      topTokenPromptsPage = 1;
      renderTopTokenPromptsTable();
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const sortedRows = [...topTokenPromptsRows].sort((a, b) => {
    const cmp = compareTopTokenPromptRows(a, b, topTokenPromptsSort.column);
    return topTokenPromptsSort.direction === 'asc' ? cmp : -cmp;
  });
  const totalPages = Math.max(Math.ceil(sortedRows.length / TOP_TOKEN_PROMPTS_PAGE_SIZE), 1);
  topTokenPromptsPage = Math.min(topTokenPromptsPage, totalPages);
  const pageStart = (topTokenPromptsPage - 1) * TOP_TOKEN_PROMPTS_PAGE_SIZE;
  const pageRows = sortedRows.slice(pageStart, pageStart + TOP_TOKEN_PROMPTS_PAGE_SIZE);

  const tbody = document.createElement('tbody');
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    const promptCell = document.createElement('td');
    promptCell.className = 'truncate-cell';
    promptCell.textContent = row.prompt;
    promptCell.title = row.prompt;
    const timeCell = document.createElement('td');
    timeCell.textContent = formatPromptTimestamp(row.timestamp);
    const tokensCell = document.createElement('td');
    tokensCell.textContent = row.total_tokens.toLocaleString();
    tr.append(promptCell, timeCell, tokensCell);
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  container.appendChild(table);

  if (totalPages > 1) {
    const pagination = document.createElement('div');
    pagination.className = 'pagination';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.textContent = 'Prev';
    prevButton.disabled = topTokenPromptsPage === 1;
    prevButton.addEventListener('click', () => {
      topTokenPromptsPage -= 1;
      renderTopTokenPromptsTable();
    });

    const status = document.createElement('span');
    status.className = 'pagination-status';
    status.textContent = `Page ${topTokenPromptsPage} of ${totalPages}`;

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.textContent = 'Next';
    nextButton.disabled = topTokenPromptsPage === totalPages;
    nextButton.addEventListener('click', () => {
      topTokenPromptsPage += 1;
      renderTopTokenPromptsTable();
    });

    pagination.append(prevButton, status, nextButton);
    container.appendChild(pagination);
  }
}

function renderPromptPicker(prompts) {
  const container = document.getElementById('promptPicker');
  container.innerHTML = '';

  if (prompts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'proxy-note';
    empty.textContent = 'No prompts in this date range.';
    container.appendChild(empty);
    return;
  }

  for (const prompt of prompts) {
    const block = document.createElement('div');
    block.className = 'prompt-block';

    const row = document.createElement('div');
    row.className = 'prompt-picker-row';

    const head = document.createElement('div');
    head.className = 'prompt-head';
    const { text, toggle } = createExpandableText(prompt.prompt);
    const meta = document.createElement('span');
    meta.className = 'prompt-meta';
    const time = document.createElement('span');
    time.className = 'prompt-time';
    time.textContent = formatPromptTimestamp(prompt.timestamp);
    const sessionBadge = document.createElement('span');
    sessionBadge.className = `badge badge-${prompt.session_type}`;
    sessionBadge.textContent = prompt.session_type === 'interactive' ? 'Interactive' : 'One-shot';
    meta.append(time, sessionBadge);
    head.append(text, meta);
    row.append(head, toggle);

    const trace = document.createElement('div');
    trace.className = 'prompt-trace';
    trace.hidden = true;

    row.addEventListener('click', () => togglePromptTrace(prompt, row, trace));

    block.append(row, trace);
    container.appendChild(block);
    revealExpandableToggleIfNeeded(text, toggle);
  }
}

async function togglePromptTrace(prompt, rowEl, traceEl) {
  const wasOpen = rowEl.classList.contains('selected');

  document.querySelectorAll('.prompt-picker-row.selected').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('.prompt-trace').forEach((el) => {
    el.hidden = true;
    el.innerHTML = '';
  });

  if (wasOpen) return;

  rowEl.classList.add('selected');
  traceEl.hidden = false;
  try {
    const spans = await fetchJson(`/api/trace-spans?traceId=${encodeURIComponent(prompt.trace_id)}`);
    renderWaterfall(traceEl, spans, prompt.prompt_span_id);
  } catch (err) {
    console.error('Failed to load trace spans:', err);
    traceEl.innerHTML = '';
    const error = document.createElement('p');
    error.className = 'proxy-note';
    error.textContent = 'Failed to load this prompt’s trace.';
    traceEl.appendChild(error);
  }
}

function waterfallKind(spanName) {
  if (spanName === 'claude_code.interaction') return 'interaction';
  if (spanName.startsWith('claude_code.skill:')) return 'skill';
  if (spanName.startsWith('claude_code.tool:')) return 'tool';
  if (spanName === 'claude_code.llm_request') return 'llm';
  if (spanName === 'claude_code.tool.execution') return 'execution';
  if (spanName === 'claude_code.tool.blocked_on_user') return 'blocked_on_user';
  return 'other';
}

function waterfallLabel(span) {
  const kind = waterfallKind(span.span_name);
  if (kind === 'interaction') return 'prompt';
  if (kind === 'tool' || kind === 'skill') return `${kind}: ${span.name}`;
  if (kind === 'llm') return 'llm request';
  if (kind === 'execution') return 'execution';
  if (kind === 'blocked_on_user') return 'blocked on user';
  return span.span_name;
}

// A prompt (interaction span) and every span nested under it, with real
// depth from ParentSpanId (not the old timestamp-containment heuristic) —
// a trace can hold several interaction spans in a multi-turn session, so
// this walks descendants of just the selected one, not the whole trace.
function renderWaterfall(container, allSpans, rootSpanId) {
  container.innerHTML = '';

  const byId = new Map(allSpans.map((span) => [span.span_id, span]));
  const byParent = new Map();
  for (const span of allSpans) {
    if (!byParent.has(span.parent_span_id)) byParent.set(span.parent_span_id, []);
    byParent.get(span.parent_span_id).push(span);
  }

  const root = byId.get(rootSpanId);
  if (!root) {
    const empty = document.createElement('p');
    empty.className = 'proxy-note';
    empty.textContent = 'No span data for this prompt.';
    container.appendChild(empty);
    return;
  }

  const rows = [];
  (function walk(span, depth) {
    // The execution span's timing is nearly identical to its parent tool
    // span (it's just the tool's own duration minus the permission-check
    // overhead), so showing both as separate bars is pure redundancy —
    // skip it, keeping its children (there never are any today) at the
    // same depth as if it weren't there.
    const isExecution = waterfallKind(span.span_name) === 'execution';
    if (!isExecution) rows.push({ span, depth });
    const children = (byParent.get(span.span_id) || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp.replace(' ', 'T')) - new Date(b.timestamp.replace(' ', 'T')));
    for (const child of children) walk(child, isExecution ? depth : depth + 1);
  })(root, 0);

  const rootStart = new Date(root.timestamp.replace(' ', 'T')).getTime();
  const totalMs = Math.max(root.duration_ms, 1);

  const waterfall = document.createElement('div');
  waterfall.className = 'waterfall';
  for (const { span, depth } of rows) {
    const kind = waterfallKind(span.span_name);
    const row = document.createElement('div');
    row.className = 'waterfall-row';

    const label = document.createElement('div');
    label.className = 'waterfall-label';
    label.style.paddingLeft = `${depth * 16}px`;
    label.textContent = waterfallLabel(span);
    label.title = span.span_name;

    const track = document.createElement('div');
    track.className = 'waterfall-track';
    const bar = document.createElement('div');
    bar.className = 'waterfall-bar';
    bar.dataset.kind = kind;
    const start = new Date(span.timestamp.replace(' ', 'T')).getTime();
    const offsetPct = Math.max(((start - rootStart) / totalMs) * 100, 0);
    const widthPct = Math.min(Math.max((span.duration_ms / totalMs) * 100, 0.3), 100 - offsetPct);
    bar.style.left = `${offsetPct}%`;
    bar.style.width = `${widthPct}%`;
    track.appendChild(bar);

    row.append(label, track);

    if (kind === 'llm') {
      row.classList.add('waterfall-row-expandable');
      const detail = document.createElement('div');
      detail.className = 'waterfall-detail';
      detail.style.paddingLeft = `${depth * 16 + 12}px`;
      detail.hidden = true;
      detail.textContent = span.name ? `Model: ${span.name}` : 'Model: unknown';
      row.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
      });
      waterfall.append(row, detail);
    } else {
      bar.title = `${waterfallLabel(span)} — ${Math.round(span.duration_ms)}ms`;
      waterfall.appendChild(row);
    }
  }
  container.appendChild(waterfall);
}

function renderErrorList(containerId, rows, labelFn) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'proxy-note';
    empty.textContent = 'No errors in this date range.';
    container.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const block = document.createElement('div');
    block.className = 'prompt-block';

    const head = document.createElement('div');
    head.className = 'prompt-head error-head';
    const { text, toggle } = createExpandableText(row.error);
    const meta = document.createElement('span');
    meta.className = 'prompt-meta';
    const label = document.createElement('span');
    label.className = 'badge badge-error';
    label.textContent = labelFn(row);
    const time = document.createElement('span');
    time.className = 'prompt-time';
    time.textContent = formatPromptTimestamp(row.timestamp);
    meta.append(label, time);
    head.append(text, meta);
    block.appendChild(head);
    block.appendChild(toggle);

    const detail = document.createElement('div');
    detail.className = 'error-detail';
    detail.hidden = true;
    block.appendChild(detail);

    head.addEventListener('click', () => toggleErrorDetail(row, head, detail));

    container.appendChild(block);
    revealExpandableToggleIfNeeded(text, toggle);
  }
}

// Claude Code's telemetry only records a short error *category* label (e.g.
// "ShellError"), not the full error message or stack trace, so this can only
// gloss the handful of category words below — not the specific failure.
// Matched by substring on the lowercased category name since Claude Code's
// full internal taxonomy of these labels isn't documented anywhere we can
// read from.
const TOOL_ERROR_EXPLANATIONS = {
  shell: 'The command itself failed to run cleanly — a non-zero exit code, a syntax error in the command, or the shell process couldn’t start.',
  timeout: 'The tool call ran too long and was aborted before it finished.',
  permission: 'The process didn’t have permission to access the file, directory, or resource involved.',
  notfound: 'The file, path, or resource the tool tried to use doesn’t exist.',
  network: 'A network request failed — the remote host refused the connection, couldn’t be resolved, or wasn’t reachable.',
  connection: 'A network request failed — the remote host refused the connection, couldn’t be resolved, or wasn’t reachable.',
  ratelimit: 'The call was rejected because it hit a rate limit.',
  validation: 'The tool was called with input that didn’t pass Claude Code’s own validation checks.',
  abort: 'The tool call was cancelled before it completed (for example, the user interrupted it).',
  cancel: 'The tool call was cancelled before it completed (for example, the user interrupted it).',
};

function explainToolError(error) {
  if (!error) return null;
  const normalized = error.toLowerCase();
  for (const [keyword, explanation] of Object.entries(TOOL_ERROR_EXPLANATIONS)) {
    if (normalized.includes(keyword)) return explanation;
  }
  return null;
}

// Debugging context for one error: which prompt triggered it, so it can be
// traced back without leaving the Tool/Skill Errors list.
function toggleErrorDetail(row, headEl, detailEl) {
  const wasOpen = headEl.classList.contains('selected');

  document.querySelectorAll('.error-head.selected').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('.error-detail').forEach((el) => {
    el.hidden = true;
    el.innerHTML = '';
  });

  if (wasOpen) return;

  headEl.classList.add('selected');
  detailEl.hidden = false;

  const meta = document.createElement('p');
  meta.className = 'proxy-note';
  meta.innerHTML = `Failed after <code>${Math.round(row.duration_ms)}ms</code>`;
  detailEl.appendChild(meta);

  const codeLabel = document.createElement('div');
  codeLabel.className = 'error-detail-label';
  codeLabel.textContent = 'Error code';
  const codeText = document.createElement('p');
  codeText.className = 'proxy-note';
  const codeValue = document.createElement('code');
  codeValue.textContent = row.error;
  codeText.appendChild(codeValue);
  detailEl.append(codeLabel, codeText);

  const explanationLabel = document.createElement('div');
  explanationLabel.className = 'error-detail-label';
  explanationLabel.textContent = 'What this means';
  const explanationText = document.createElement('p');
  explanationText.className = 'proxy-note';
  explanationText.textContent =
    explainToolError(row.error) ??
    'Claude Code only records a short error category in telemetry (not the full message), and this one isn’t in our recognized list — the label above is all the detail available.';
  detailEl.append(explanationLabel, explanationText);

  if (row.prompt) {
    const promptLabel = document.createElement('div');
    promptLabel.className = 'error-detail-label';
    promptLabel.textContent = 'Triggered by this prompt';
    const { text: promptText, toggle: promptToggle } = createExpandableText(row.prompt);
    detailEl.append(promptLabel, promptText, promptToggle);
    revealExpandableToggleIfNeeded(promptText, promptToggle);
  } else {
    const noPrompt = document.createElement('p');
    noPrompt.className = 'proxy-note';
    noPrompt.textContent = "Couldn't find the prompt this error happened under.";
    detailEl.appendChild(noPrompt);
  }
}

function activeTab() {
  if (document.getElementById('skillPanel').dataset.active === 'true') return 'skill';
  if (document.getElementById('promptPanel').dataset.active === 'true') return 'prompt';
  return 'tool';
}

function toolTargets(toolQuery, minutes, project, sessionQuery) {
  return [
    {
      name: 'Tool Calls by Type',
      url: `/api/tool-calls${queryString(toolQuery, minutes, project, sessionQuery)}`,
      apply: (rows) => upsertChart('toolCallsChart', 'bar', barChartData(rows, 'tool', 'calls', 'tool'), barChartOptions()),
    },
    {
      name: 'Avg Latency per Tool',
      url: `/api/tool-latency${queryString(toolQuery, minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart('toolLatencyChart', 'bar', barChartData(rows, 'tool', 'avg_latency_ms', 'tool'), barChartOptions()),
    },
    {
      name: 'Tool Call Volume Over Time',
      url: `/api/tool-volume${queryString(toolQuery, minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart('toolVolumeChart', 'line', lineChartData(rows, 'bucket', 'calls', 'tool'), lineChartOptions()),
    },
    {
      name: 'Tool Errors',
      url: `/api/tool-error-list${queryString(toolQuery, minutes, project, sessionQuery)}`,
      apply: (rows) => {
        document.getElementById('toolErrorListCard').hidden = rows.length === 0;
        renderErrorList('toolErrorList', rows, (row) => row.tool);
      },
    },
  ];
}

function skillTargets(skillQuery, minutes, project, sessionQuery) {
  return [
    {
      name: 'Skill Usage by Name',
      url: `/api/skill-usage${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart('skillUsageChart', 'bar', barChartData(rows, 'skill_name', 'calls', 'skill'), barChartOptions()),
    },
    {
      name: 'Plugin Usage',
      url: `/api/plugin-usage${queryString(minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart('pluginUsageChart', 'bar', barChartData(rows, 'plugin', 'calls', 'plugin'), barChartOptions()),
    },
    {
      name: 'Skill Usage Latency',
      url: `/api/skill-latency${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart(
          'skillLatencyChart',
          'bar',
          barChartData(rows, 'skill_name', 'avg_latency_ms', 'skill'),
          barChartOptions()
        ),
    },
    {
      name: 'Skill Call Volume Over Time',
      url: `/api/skill-volume${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: (rows) =>
        upsertChart('skillVolumeChart', 'line', lineChartData(rows, 'bucket', 'calls', 'skill'), lineChartOptions()),
    },
    {
      name: 'Tool Calls by Skill',
      url: `/api/tool-calls-by-skill${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: renderToolCallsBySkillTable,
    },
    {
      name: 'Skill to Tool Call Flow',
      url: `/api/tool-calls-by-skill${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: renderSkillToolFlow,
    },
    {
      name: 'Errors by Skill',
      url: `/api/skill-errors${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: (rows) => {
        document.getElementById('skillErrorsCard').hidden = rows.length === 0;
        upsertChart('skillErrorsChart', 'bar', barChartData(rows, 'skill_name', 'errors', 'danger'), barChartOptions());
      },
    },
    {
      name: 'Skill Errors',
      url: `/api/skill-error-list${queryString(skillQuery, minutes, project, sessionQuery)}`,
      apply: (rows) => {
        document.getElementById('skillErrorListCard').hidden = rows.length === 0;
        renderErrorList('skillErrorList', rows, (row) => row.skill_name);
      },
    },
  ];
}

function promptTargets(sessionQuery, minutes, project) {
  return [
    {
      name: 'Top Token-Consuming Prompts',
      url: `/api/top-token-prompts${queryString(minutes, project, sessionQuery)}`,
      apply: renderTopTokenPrompts,
    },
    {
      name: 'Prompts',
      url: `/api/prompts${queryString(sessionQuery, minutes, project)}`,
      apply: renderPromptPicker,
    },
  ];
}

async function refresh() {
  const minutes = currentMinutes();
  const project = currentProject();
  const tab = activeTab();
  const toolQuery = currentToolQuery();
  const skillQuery = document.getElementById('skillFilter').value
    ? `skill=${encodeURIComponent(document.getElementById('skillFilter').value)}`
    : '';
  const sessionQuery = document.getElementById('sessionFilter').value
    ? `session=${encodeURIComponent(document.getElementById('sessionFilter').value)}`
    : '';
  const targets =
    tab === 'tool'
      ? toolTargets(toolQuery, minutes, project, sessionQuery)
      : tab === 'skill'
        ? skillTargets(skillQuery, minutes, project, sessionQuery)
        : promptTargets(sessionQuery, minutes, project);

  const results = await Promise.allSettled(targets.map((target) => fetchJson(target.url)));

  const failed = [];
  results.forEach((result, index) => {
    const target = targets[index];
    if (result.status === 'fulfilled') {
      target.apply(result.value);
    } else {
      failed.push(target.name);
      console.error(`Failed to refresh "${target.name}":`, result.reason);
    }
  });

  const errorEl = document.getElementById('refreshError');
  errorEl.textContent = failed.length > 0 ? `Failed to update: ${failed.join(', ')}` : '';
}

function switchTab(tab) {
  const buttons = {
    tool: document.getElementById('toolTabButton'),
    skill: document.getElementById('skillTabButton'),
    prompt: document.getElementById('promptTabButton'),
  };
  const panels = {
    tool: document.getElementById('toolPanel'),
    skill: document.getElementById('skillPanel'),
    prompt: document.getElementById('promptPanel'),
  };
  const fieldsByTab = {
    tool: ['toolFilterField'],
    skill: ['skillFilterField'],
    prompt: [],
  };
  const allFieldIds = ['toolFilterField', 'skillFilterField'];

  for (const key of Object.keys(buttons)) {
    const active = key === tab;
    buttons[key].setAttribute('aria-selected', String(active));
    panels[key].dataset.active = String(active);
  }
  for (const fieldId of allFieldIds) {
    document.getElementById(fieldId).hidden = !fieldsByTab[tab].includes(fieldId);
  }

  refresh().catch((err) => console.error('Failed to refresh after tab switch:', err));
}

document.getElementById('toolTabButton').addEventListener('click', () => switchTab('tool'));
document.getElementById('skillTabButton').addEventListener('click', () => switchTab('skill'));
document.getElementById('promptTabButton').addEventListener('click', () => switchTab('prompt'));
document.getElementById('skillFilter').addEventListener('change', refresh);
document.getElementById('sessionFilter').addEventListener('change', refresh);
document.getElementById('dateRangeFilter').addEventListener('change', () => {
  updateCustomDateRangeVisibility();
  loadDropdowns()
    .then(refresh)
    .catch((err) => console.error('Failed to reload after date range change:', err));
});
document.getElementById('dateRangeStart').addEventListener('change', () => {
  loadDropdowns()
    .then(refresh)
    .catch((err) => console.error('Failed to reload after custom start date change:', err));
});
document.getElementById('dateRangeEnd').addEventListener('change', () => {
  loadDropdowns()
    .then(refresh)
    .catch((err) => console.error('Failed to reload after custom end date change:', err));
});
document.getElementById('projectFilter').addEventListener('change', () => {
  loadDropdowns()
    .then(refresh)
    .catch((err) => console.error('Failed to reload after project change:', err));
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    for (const id of Object.keys(charts)) {
      charts[id].destroy();
      delete charts[id];
    }
    refresh().catch((err) => console.error('Failed to redraw charts after theme change:', err));
  });
}

loadDropdowns()
  .then(refresh)
  .catch((err) => {
    console.error('Failed to initialize dashboard:', err);
    document.getElementById('refreshError').textContent =
      'Failed to load dashboard (filters and/or charts). See console for details.';
  });
