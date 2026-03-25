const express = require("express");
const app = express();
app.use(express.json({ limit: "5mb" }));

const SCANNER_API_KEY = process.env.SCANNER_API_KEY || "";
const DASH_KEY = process.env.DASH_KEY || "Tanger2026@";

let scannerResults = [];
let scannerHeartbeat = null;
let exploitResults = [];

function authDash(req, res) {
  const key = req.query.key;
  if (key !== DASH_KEY) { res.status(403).send("Unauthorized"); return false; }
  return true;
}

app.get("/", (_, res) => res.send("ok"));

// === API ENDPOINTS ===

app.post("/api/scanner/heartbeat", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== SCANNER_API_KEY) return res.status(403).json({ error: "Unauthorized" });
  scannerHeartbeat = { ...req.body, ts: Date.now() };
  return res.json({ ok: true });
});

app.get("/api/scanner/status", (req, res) => {
  if (!authDash(req, res)) return;
  if (!scannerHeartbeat) return res.json({ online: false });
  const age = Date.now() - scannerHeartbeat.ts;
  return res.json({ online: age < 6 * 60 * 1000, age, ...scannerHeartbeat });
});

app.post("/api/scanner/results", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== SCANNER_API_KEY) return res.status(403).json({ error: "Unauthorized" });
  let body = req.body;
  if (Array.isArray(body)) {
    scannerResults = body.slice(0, 500);
  } else if (body.result) {
    const idx = scannerResults.findIndex(r => r.address?.toLowerCase() === body.result.address?.toLowerCase());
    if (idx >= 0) scannerResults[idx] = body.result;
    else scannerResults.unshift(body.result);
    if (scannerResults.length > 500) scannerResults.pop();
  }
  return res.json({ ok: true, count: scannerResults.length });
});

app.get("/api/scanner/results", (req, res) => {
  if (!authDash(req, res)) return;
  return res.json(scannerResults);
});

// Exploit results API
app.post("/api/scanner/exploit", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== SCANNER_API_KEY) return res.status(403).json({ error: "Unauthorized" });
  const result = req.body;
  const idx = exploitResults.findIndex(r => r.address?.toLowerCase() === result.address?.toLowerCase());
  if (idx >= 0) exploitResults[idx] = result;
  else exploitResults.unshift(result);
  if (exploitResults.length > 200) exploitResults.pop();
  return res.json({ ok: true });
});

app.get("/api/scanner/exploit", (req, res) => {
  if (!authDash(req, res)) return;
  return res.json(exploitResults);
});

// === DASHBOARD ===
app.get("/scanner", (req, res) => {
  if (!authDash(req, res)) return;
  const key = req.query.key;

  res.send(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BSC Scanner v4</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #080b12; color: #c9d1d9; min-height: 100vh; }

  /* Header */
  .header { background: linear-gradient(135deg, #0d1117 0%, #161b22 100%); border-bottom: 1px solid #21262d; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .header h1 .v4 { background: linear-gradient(135deg, #f0b429, #ff6b00); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 12px; font-weight: 800; border: 1px solid #f0b42944; padding: 2px 8px; border-radius: 4px; }
  .clock { color: #484f58; font-size: 12px; font-family: monospace; }

  /* Scanner status bar */
  .status-bar { display: flex; align-items: center; gap: 16px; padding: 10px 24px; background: #0d1117; border-bottom: 1px solid #21262d; flex-wrap: wrap; }
  .status-pill { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
  .status-pill.online { background: #23863622; color: #3fb950; border: 1px solid #23863644; }
  .status-pill.offline { background: #da363622; color: #f85149; border: 1px solid #da363644; }
  .status-pill .dot { width: 7px; height: 7px; border-radius: 50%; }
  .status-pill.online .dot { background: #3fb950; animation: pulse 2s infinite; }
  .status-pill.offline .dot { background: #f85149; }
  .status-detail { font-size: 11px; color: #484f58; }

  /* Tabs */
  .tabs { display: flex; gap: 0; padding: 0 24px; background: #0d1117; border-bottom: 1px solid #21262d; }
  .tab { padding: 10px 20px; font-size: 13px; font-weight: 600; color: #484f58; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
  .tab:hover { color: #c9d1d9; }
  .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
  .tab .count { background: #21262d; padding: 1px 7px; border-radius: 10px; font-size: 11px; margin-left: 6px; }
  .tab.active .count { background: #1f6feb33; color: #58a6ff; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; padding: 16px 24px; }
  .stat { background: #161b22; border: 1px solid #21262d; border-radius: 10px; padding: 14px 16px; }
  .stat .label { font-size: 10px; color: #484f58; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600; }
  .stat .val { font-size: 26px; font-weight: 800; margin-top: 4px; }
  .stat .sub { font-size: 11px; color: #484f58; margin-top: 2px; }
  .green { color: #3fb950; } .red { color: #f85149; } .gold { color: #f0b429; } .blue { color: #58a6ff; } .purple { color: #a371f7; }

  /* Panels */
  .panel { display: none; }
  .panel.active { display: block; }

  /* Table */
  .table-wrap { padding: 0 24px 24px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0d1117; border-bottom: 2px solid #21262d; padding: 8px 10px; text-align: left; cursor: pointer; user-select: none; color: #484f58; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.8px; position: sticky; top: 0; z-index: 1; }
  th:hover { color: #58a6ff; }
  td { padding: 9px 10px; border-bottom: 1px solid #161b22; }
  tr:hover td { background: #161b2288; }
  tr.exploitable { background: #f8514908; }
  tr.exploitable:hover td { background: #f8514912; }

  .addr { font-family: 'Courier New', monospace; font-size: 11px; }
  .addr a { color: #58a6ff; text-decoration: none; }
  .addr a:hover { text-decoration: underline; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; }
  .badge.critical { background: #f8514918; color: #f85149; border: 1px solid #f8514933; }
  .badge.high { background: #db6d2818; color: #db6d28; border: 1px solid #db6d2833; }
  .badge.medium { background: #d2992218; color: #f0b429; border: 1px solid #d2992233; }
  .badge.clean { background: #23863618; color: #3fb950; border: 1px solid #23863633; }
  .badge.exploitable { background: #f8514930; color: #ff7b72; border: 1px solid #f8514966; animation: glow 2s infinite; }

  @keyframes glow { 0%,100% { box-shadow: 0 0 4px #f8514933; } 50% { box-shadow: 0 0 12px #f8514966; } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* Findings detail */
  .finding-row { background: #0d1117; }
  .finding-row td { padding: 0; }
  .finding-detail { padding: 12px 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .finding-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 10px 14px; font-size: 11px; }
  .finding-card h4 { font-size: 11px; color: #484f58; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .finding-item { padding: 3px 0; display: flex; gap: 6px; align-items: flex-start; }
  .finding-item .sev { font-weight: 700; min-width: 14px; }

  /* Exploit panel */
  .exploit-card { background: #161b22; border: 1px solid #21262d; border-radius: 10px; margin: 0 24px 12px; padding: 16px 20px; }
  .exploit-card.has-exploitable { border-color: #f8514944; background: linear-gradient(135deg, #161b22, #1a0a0a); }
  .exploit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .exploit-header h3 { font-size: 14px; font-weight: 700; }
  .exploit-header .time { font-size: 11px; color: #484f58; }
  .exploit-tests { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .exploit-test-badge { font-size: 10px; padding: 3px 8px; border-radius: 4px; background: #21262d; color: #8b949e; }
  .exploit-finding { padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 12px; }
  .exploit-finding.critical { background: #f8514912; border-left: 3px solid #f85149; }
  .exploit-finding.high { background: #db6d2812; border-left: 3px solid #db6d28; }
  .exploit-finding .fn { color: #a371f7; font-family: monospace; font-size: 11px; }
  .exploit-finding .detail { color: #8b949e; margin-top: 3px; }

  .empty { text-align: center; padding: 60px 24px; color: #30363d; font-size: 14px; }
  .refresh-info { padding: 6px 24px; font-size: 10px; color: #30363d; display: flex; justify-content: space-between; }

  /* Filters */
  .filters { padding: 10px 24px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .filter-btn { background: #21262d; border: 1px solid #30363d; color: #8b949e; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.15s; }
  .filter-btn:hover { background: #30363d; color: #c9d1d9; }
  .filter-btn.active { background: #1f6feb22; border-color: #1f6feb; color: #58a6ff; }
</style>
</head>
<body>

<div class="header">
  <h1>BSC Scanner <span class="v4">v4</span></h1>
  <div class="clock" id="clock"></div>
</div>

<div class="status-bar">
  <div class="status-pill offline" id="sc-pill">
    <div class="dot"></div>
    <span id="sc-label">Laden...</span>
  </div>
  <span class="status-detail" id="sc-detail"></span>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('contracts')">Contracten <span class="count" id="tab-contracts-count">0</span></div>
  <div class="tab" onclick="switchTab('exploits')">Exploit Tests <span class="count" id="tab-exploits-count">0</span></div>
</div>

<!-- OVERVIEW PANEL -->
<div class="panel active" id="panel-overview">
  <div class="stats">
    <div class="stat"><div class="label">Live Blocks</div><div class="val blue" id="s-blocks">-</div><div class="sub">Track A: deploys</div></div>
    <div class="stat"><div class="label">Transfers</div><div class="val purple" id="s-transfers">-</div><div class="sub">Track B: >$3k</div></div>
    <div class="stat"><div class="label">Contracten</div><div class="val gold" id="s-contracts">-</div><div class="sub">gevonden</div></div>
    <div class="stat"><div class="label">Alerts</div><div class="val red" id="s-alerts">-</div><div class="sub">verzonden</div></div>
    <div class="stat"><div class="label">Geanalyseerd</div><div class="val green" id="s-analyzed">-</div><div class="sub">Slither/Mythril</div></div>
    <div class="stat"><div class="label">Exploitable</div><div class="val red" id="s-exploitable">-</div><div class="sub">bevestigd</div></div>
  </div>

  <!-- Recent exploits preview -->
  <div style="padding: 8px 24px 4px"><h3 style="font-size: 13px; color: #484f58; text-transform: uppercase; letter-spacing: 1px;">Recente Exploit Tests</h3></div>
  <div id="recent-exploits"></div>
</div>

<!-- CONTRACTS PANEL -->
<div class="panel" id="panel-contracts">
  <div class="filters">
    <button class="filter-btn active" onclick="setFilter('all',this)">Alle</button>
    <button class="filter-btn" onclick="setFilter('high',this)">High Issues</button>
    <button class="filter-btn" onclick="setFilter('50k',this)">$50k+</button>
    <button class="filter-btn" onclick="setFilter('danger',this)">Gevaarlijk</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th onclick="sortBy('time')">Tijd</th>
        <th onclick="sortBy('contractName')">Contract</th>
        <th onclick="sortBy('address')">Adres</th>
        <th onclick="sortBy('balanceUsd')">Balance</th>
        <th onclick="sortBy('totalHigh')">High</th>
        <th onclick="sortBy('totalMedium')">Med</th>
        <th>Verdict</th>
        <th>Details</th>
      </tr></thead>
      <tbody id="results-body"><tr><td colspan="8" class="empty">Laden...</td></tr></tbody>
    </table>
  </div>
</div>

<!-- EXPLOITS PANEL -->
<div class="panel" id="panel-exploits">
  <div class="filters">
    <button class="filter-btn active" onclick="setExploitFilter('all',this)">Alle Tests</button>
    <button class="filter-btn" onclick="setExploitFilter('exploitable',this)">Exploitable</button>
    <button class="filter-btn" onclick="setExploitFilter('critical',this)">Critical+</button>
  </div>
  <div id="exploit-list"></div>
</div>

<div class="refresh-info">
  <span>Auto-refresh: 30s</span>
  <span id="last-update">Laden...</span>
</div>

<script>
const KEY='${key}';
let data=[], exploitData=[], currentSort='time', sortDir=-1, currentFilter='all', exploitFilter='all';
let expandedRows = new Set();

// === HELPERS ===
function shortAddr(a) { return a ? a.slice(0,6)+'...'+a.slice(-4) : '-'; }
function fmtBal(v) { return v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1e3?'$'+(v/1e3).toFixed(0)+'k':'$'+(v||0).toFixed(0); }
function fmtDate(t) { if(!t)return'-'; const d=new Date(t); return d.toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}); }
function fmtAgo(ms) { const m=Math.floor(ms/60000); if(m<1)return'<1m'; if(m<60)return m+'m'; return Math.floor(m/60)+'u '+m%60+'m'; }

function verdict(r) {
  // Check of er een exploit test voor is
  const ex = exploitData.find(e => e.address?.toLowerCase() === r.address?.toLowerCase());
  if (ex && ex.summary?.exploitable > 0) return { t:'EXPLOITABLE', c:'exploitable', s:4 };
  if (r.totalHigh >= 3) return { t:'GEVAARLIJK', c:'critical', s:3 };
  if (r.totalHigh >= 1) return { t:'VERDACHT', c:'high', s:2 };
  if (r.totalMedium >= 1) return { t:'REVIEW', c:'medium', s:1 };
  return { t:'SCHOON', c:'clean', s:0 };
}

// === TABS ===
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[onclick*="'+tab+'"]').classList.add('active');
  document.getElementById('panel-'+tab).classList.add('active');
}

// === CONTRACT TABLE ===
function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('#panel-contracts .filter-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderContracts();
}

function sortBy(col) {
  if (currentSort===col) sortDir*=-1; else { currentSort=col; sortDir=-1; }
  renderContracts();
}

function toggleRow(addr) {
  if (expandedRows.has(addr)) expandedRows.delete(addr); else expandedRows.add(addr);
  renderContracts();
}

function renderContracts() {
  let f = [...data];
  if (currentFilter==='high') f=f.filter(r=>r.totalHigh>0);
  else if (currentFilter==='50k') f=f.filter(r=>r.balanceUsd>=50000);
  else if (currentFilter==='danger') f=f.filter(r=>r.totalHigh>=3);

  f.sort((a,b) => {
    let va, vb;
    if (currentSort==='verdict') { va=verdict(a).s; vb=verdict(b).s; }
    else if (currentSort==='time') { va=new Date(a.time||0).getTime(); vb=new Date(b.time||0).getTime(); }
    else { va=a[currentSort]||0; vb=b[currentSort]||0; }
    if (typeof va==='string') return sortDir*va.localeCompare(vb);
    return sortDir*(va-vb);
  });

  const tb = document.getElementById('results-body');
  if (!f.length) { tb.innerHTML='<tr><td colspan="8" class="empty">Geen resultaten</td></tr>'; return; }

  let html = '';
  for (const r of f) {
    const v = verdict(r);
    const isExpl = v.c === 'exploitable';
    html += '<tr class="'+(isExpl?'exploitable':'')+'" style="cursor:pointer" onclick="toggleRow(\\''+r.address+'\\')">';
    html += '<td>'+fmtDate(r.time)+'</td>';
    html += '<td style="font-weight:600">'+(r.contractName||'-')+'</td>';
    html += '<td class="addr"><a href="https://bscscan.com/address/'+r.address+'" target="_blank" onclick="event.stopPropagation()">'+shortAddr(r.address)+'</a></td>';
    html += '<td style="color:#3fb950;font-weight:700">'+fmtBal(r.balanceUsd)+'</td>';
    html += '<td style="color:'+(r.totalHigh>0?'#f85149':'#30363d')+';font-weight:700">'+(r.totalHigh||0)+'</td>';
    html += '<td style="color:'+(r.totalMedium>0?'#f0b429':'#30363d')+';font-weight:600">'+(r.totalMedium||0)+'</td>';
    html += '<td><span class="badge '+v.c+'">'+v.t+'</span></td>';
    html += '<td style="color:#30363d;font-size:16px">'+(expandedRows.has(r.address)?'\\u25B2':'\\u25BC')+'</td>';
    html += '</tr>';

    if (expandedRows.has(r.address)) {
      html += '<tr class="finding-row"><td colspan="8"><div class="finding-detail">';
      // Slither
      if (r.slither && r.slither.success && r.slither.findings?.length > 0) {
        html += '<div class="finding-card"><h4>Slither ('+r.slither.high+' high, '+r.slither.medium+' med)</h4>';
        for (const f of r.slither.findings.slice(0,8)) {
          html += '<div class="finding-item"><span class="sev" style="color:'+(f.impact==='High'?'#f85149':'#f0b429')+'">'+(f.impact==='High'?'\\u25CF':'\\u25CB')+'</span><span><b>'+f.check+'</b> '+(f.description||'').substring(0,120)+'</span></div>';
        }
        html += '</div>';
      }
      // Mythril
      if (r.mythril && r.mythril.success && r.mythril.issues?.length > 0) {
        html += '<div class="finding-card"><h4>Mythril ('+r.mythril.high+' high, '+r.mythril.medium+' med)</h4>';
        for (const i of r.mythril.issues.slice(0,8)) {
          html += '<div class="finding-item"><span class="sev" style="color:'+(i.severity==='High'?'#f85149':'#f0b429')+'">'+(i.severity==='High'?'\\u25CF':'\\u25CB')+'</span><span><b>'+i.title+'</b>'+(i.function?' in '+i.function:'')+'</span></div>';
        }
        html += '</div>';
      }
      // Security
      if (r.security && r.security.success && r.security.findings?.length > 0) {
        html += '<div class="finding-card"><h4>Security Check</h4>';
        for (const f of r.security.findings.slice(0,8)) {
          html += '<div class="finding-item"><span class="sev" style="color:'+(f.severity==='HIGH'?'#f85149':'#f0b429')+'">'+(f.severity==='HIGH'?'\\u25CF':'\\u25CB')+'</span><span><b>'+f.title+'</b> <span style="color:#484f58">'+f.category+'</span></span></div>';
        }
        html += '</div>';
      }
      // Exploit result
      const ex = exploitData.find(e => e.address?.toLowerCase() === r.address?.toLowerCase());
      if (ex) {
        html += '<div class="finding-card" style="border-color:'+(ex.summary?.exploitable>0?'#f8514944':'#21262d')+'"><h4>Exploit Test ('+(ex.summary?.exploitable||0)+' exploitable)</h4>';
        for (const t of (ex.results||[]).filter(t=>t.severity==='CRITICAL'||t.severity==='HIGH')) {
          html += '<div class="finding-item"><span class="sev" style="color:'+(t.exploitable?'#f85149':'#db6d28')+'">'+(t.exploitable?'\\u26A1':'\\u25CF')+'</span><span><b>'+t.test+'</b>'+(t.function?' <code>'+t.function+'()</code>':'')+' — '+t.detail.substring(0,150)+'</span></div>';
        }
        html += '</div>';
      }
      html += '</div></td></tr>';
    }
  }
  tb.innerHTML = html;
}

// === EXPLOIT LIST ===
function setExploitFilter(f, el) {
  exploitFilter = f;
  document.querySelectorAll('#panel-exploits .filter-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderExploits();
}

function renderExploits() {
  let f = [...exploitData];
  if (exploitFilter==='exploitable') f=f.filter(e=>e.summary?.exploitable>0);
  else if (exploitFilter==='critical') f=f.filter(e=>e.summary?.critical>0||e.summary?.high>0);

  const el = document.getElementById('exploit-list');
  if (!f.length) { el.innerHTML='<div class="empty">Geen exploit tests'+(exploitFilter!=='all'?' (filter actief)':'')+'</div>'; return; }

  let html = '';
  for (const ex of f) {
    const hasExpl = ex.summary?.exploitable > 0;
    html += '<div class="exploit-card '+(hasExpl?'has-exploitable':'')+'">';
    html += '<div class="exploit-header">';
    html += '<h3><a href="https://bscscan.com/address/'+ex.address+'" target="_blank" style="color:'+(hasExpl?'#f85149':'#58a6ff')+';text-decoration:none">'+shortAddr(ex.address)+'</a>';
    if (hasExpl) html += ' <span class="badge exploitable">EXPLOITABLE</span>';
    html += '</h3>';
    html += '<span class="time">'+fmtDate(ex.timestamp)+'</span></div>';

    // Tests die gedraaid zijn
    if (ex.testsRun?.length) {
      html += '<div class="exploit-tests">';
      for (const t of ex.testsRun) html += '<span class="exploit-test-badge">'+t+'</span>';
      html += '</div>';
    }

    // Summary
    html += '<div style="font-size:12px;color:#484f58;margin-bottom:8px">';
    html += '<span style="color:#f85149">'+ex.summary.critical+' critical</span> &middot; ';
    html += '<span style="color:#db6d28">'+ex.summary.high+' high</span> &middot; ';
    html += '<span style="color:#f0b429">'+ex.summary.medium+' medium</span> &middot; ';
    html += '<span style="color:'+(hasExpl?'#f85149':'#3fb950')+'">'+ex.summary.exploitable+' exploitable</span>';
    html += '</div>';

    // Findings
    for (const r of (ex.results||[]).filter(r=>r.severity!=='INFO'&&r.severity!=='LOW')) {
      const cls = r.exploitable ? 'critical' : (r.severity==='CRITICAL'?'critical':'high');
      html += '<div class="exploit-finding '+cls+'">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-weight:700">'+(r.exploitable?'\\u26A1 ':'')+''+r.test+'</span>';
      html += '<span class="badge '+cls+'">'+(r.exploitable?'EXPLOITABLE':r.severity)+'</span>';
      html += '</div>';
      if (r.function) html += '<div class="fn">'+r.function+'()</div>';
      html += '<div class="detail">'+r.detail+'</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

// === DATA FETCHING ===
async function fetchAll() {
  try {
    const [resR, resS, resE] = await Promise.all([
      fetch('/api/scanner/results?key='+KEY),
      fetch('/api/scanner/status?key='+KEY),
      fetch('/api/scanner/exploit?key='+KEY),
    ]);
    data = await resR.json();
    const status = await resS.json();
    exploitData = await resE.json();

    // Status bar
    const pill = document.getElementById('sc-pill');
    const lbl = document.getElementById('sc-label');
    const det = document.getElementById('sc-detail');
    if (status.online) {
      pill.className = 'status-pill online';
      lbl.textContent = 'Online';
      const parts = [];
      if (status.liveBlocks) parts.push(status.liveBlocks.toLocaleString()+' blocks');
      if (status.transferHits) parts.push(status.transferHits+' transfers');
      if (status.contracts) parts.push(status.contracts+' contracten');
      if (status.workers !== undefined) parts.push(status.workers+'/2 workers');
      parts.push('heartbeat '+fmtAgo(status.age)+' geleden');
      det.textContent = parts.join(' · ');
    } else {
      pill.className = 'status-pill offline';
      lbl.textContent = 'Offline';
      det.textContent = 'Geen heartbeat ontvangen';
    }

    // Stats
    document.getElementById('s-blocks').textContent = (status.liveBlocks||0).toLocaleString();
    document.getElementById('s-transfers').textContent = (status.transferHits||0).toLocaleString();
    document.getElementById('s-contracts').textContent = (status.contracts||data.length||0).toLocaleString();
    document.getElementById('s-alerts').textContent = (status.alerts||0).toLocaleString();
    document.getElementById('s-analyzed').textContent = data.length;
    document.getElementById('s-exploitable').textContent = exploitData.filter(e=>e.summary?.exploitable>0).length;

    // Tab counts
    document.getElementById('tab-contracts-count').textContent = data.length;
    document.getElementById('tab-exploits-count').textContent = exploitData.length;

    // Recent exploits on overview
    renderRecentExploits();
    renderContracts();
    renderExploits();

    document.getElementById('last-update').textContent = 'Update: '+new Date().toLocaleTimeString('nl-NL');
  } catch(e) {
    document.getElementById('last-update').textContent = 'Fout bij laden';
  }
}

function renderRecentExploits() {
  const el = document.getElementById('recent-exploits');
  const recent = exploitData.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = '<div class="empty" style="padding:30px">Nog geen exploit tests uitgevoerd</div>';
    return;
  }
  let html = '';
  for (const ex of recent) {
    const hasExpl = ex.summary?.exploitable > 0;
    html += '<div class="exploit-card '+(hasExpl?'has-exploitable':'')+'">';
    html += '<div class="exploit-header">';
    html += '<h3><a href="https://bscscan.com/address/'+ex.address+'" target="_blank" style="color:'+(hasExpl?'#f85149':'#58a6ff')+';text-decoration:none">'+shortAddr(ex.address)+'</a> ';
    if (hasExpl) html += '<span class="badge exploitable">EXPLOITABLE</span>';
    else html += '<span class="badge clean">CLEAN</span>';
    html += '</h3><span class="time">'+fmtDate(ex.timestamp)+'</span></div>';
    html += '<div style="font-size:11px;color:#484f58">'+ex.summary.critical+' critical · '+ex.summary.high+' high · '+ex.summary.exploitable+' exploitable</div>';
    html += '</div>';
  }
  el.innerHTML = html;
}

function clock() { document.getElementById('clock').textContent = new Date().toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

fetchAll();
setInterval(fetchAll, 30000);
setInterval(clock, 1000);
clock();
</script>
</body></html>`);
});

const port = process.env.PORT || 3001;
app.listen(port, "0.0.0.0", () => console.log("BSC Scanner Dashboard on port", port));
