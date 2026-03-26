// ================================================================
// ConsumoCaminhoes.js  v4.0  — AgroAnalytics
// Grupos: Série 2015 | Apoio/Bate-Pino | Série 2025
// Fontes: snapshots/colCamD1 (Dia) + snapshots_bulk/COLCAMACM (Acm)
// Colunas: Km/L · Combustível · R.Energético · Disp%
// ================================================================

(function () {
  'use strict';

  // ── Lista canônica de caminhões próprios (prefixo 31) ──────────
  const GRUPOS = [
    {
      id: 'serie2015',
      label: 'Frota 2015 — Série 15',
      desc: 'Caminhões modelo ano 2015',
      equips: ['31115','31215','31315','31415','31515','31615','31715','311115','311215'],
    },
    {
      id: 'apoio',
      label: 'Apoio / Bate-Pino',
      desc: 'Caminhões 2015 que operam no pátio descarregando na indústria',
      equips: ['31815','31915','311015'],
    },
    {
      id: 'serie2025',
      label: 'Frota 2025 — Série 25',
      desc: 'Caminhões modelo ano 2025 (novos)',
      equips: [
        '31125','31225','31325','31425','31525','31625','31725','31825','31925',
        '311025','311125','311225','311325','311425','311525','311625','311725',
        '311825','311925','312025',
      ],
    },
  ];

  // Todos os equipamentos próprios (flat)
  const ALL_EQUIPS = new Set(GRUPOS.flatMap(g => g.equips));

  // ── Metas ──────────────────────────────────────────────────────
  const META_KML   = 1.10;
  const META_RENG  = 77;
  const META_DISP  = 86;
  const ANOMALY_KML = 10; // Litros/Ton > 10 = defeito de sensor ou apontamento

  // Renderiza célula Km/L com alerta ⚠️ animado quando há anomalia de sensor
  function kmlCell(val, cssClass) {
    if (!val || val <= 0) return '<span class="c-nd">—</span>';
    const formatted = _fmt(val, 2);
    if (val > ANOMALY_KML) {
      return `<span class="vcc-anomaly-wrap">
        <span class="vcc-anomaly">
          <span class="vcc-anomaly-icon" title="Dado anômalo">⚠️</span>${formatted}
        </span>
        <span class="vcc-anomaly-tooltip">
          <b>Dado anômalo — verificar sensor</b><br>
          Litros/Ton = ${formatted} (limite aceitável: ${ANOMALY_KML})<br>
          Possível causa: produção (Ton) não integrada<br>ou sensor de fluxo com defeito.
        </span>
      </span>`;
    }
    return `<span class="c-${cssClass}">${formatted}</span>`;
  }

  // ── Helpers numéricos ─────────────────────────────────────────
  const _p = v => { const n = parseFloat(String(v).replace(',','.')); return isNaN(n) ? 0 : n; };
  const _fmt = (v, dec=2) => v == null || isNaN(v) || v === 0 ? '—' :
    v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const _fmtInt = v => v == null || isNaN(v) || v === 0 ? '—' :
    Math.round(v).toLocaleString('pt-BR');
  const _pct = v => v == null || isNaN(v) || v === 0 ? '—' : _fmt(v,1) + '%';

  // ── Parse do payload chunked (snapshots_bulk) ─────────────────
  function parseChunked(raw) {
    // raw pode ser array de chunks {cab, rows} ou objeto único {cab, rows}
    if (!raw) return [];
    const chunks = Array.isArray(raw) ? raw : [raw];
    let cab = [], rows = [];
    for (const c of chunks) {
      if (!c) continue;
      const parsedCab = typeof c.cab === 'string' ? JSON.parse(c.cab) : (c.cab || []);
      const parsedRows = typeof c.rows === 'string' ? JSON.parse(c.rows) : (c.rows || []);
      if (parsedCab.length) cab = parsedCab;
      rows = rows.concat(parsedRows);
    }
    return rows.map(r => {
      const obj = {};
      cab.forEach((k, i) => { obj[k] = r[i] ?? '0'; });
      return obj;
    });
  }

  // ── Parse do payload snapshots (colCamD1 / colCamAcm) ─────────
  function parseSnapshot(payload) {
    if (!payload) return [];
    let cab = [], rows = [];
    try {
      const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
      cab  = typeof p.cab  === 'string' ? JSON.parse(p.cab)  : (p.cab  || []);
      rows = typeof p.rows === 'string' ? JSON.parse(p.rows) : (p.rows || []);
    } catch(e) { return []; }
    return rows.map(r => {
      const obj = {};
      cab.forEach((k, i) => { obj[k] = r[i] ?? '0'; });
      return obj;
    });
  }

  // ── Extrai campos de uma row ───────────────────────────────────
  function fields(r) {
    return {
      equip   : String(r['Equip'] || '').trim(),
      tonCana : _p(r['Ton. Cana']),
      horas   : _p(r['Horas']),
      comb    : _p(r['Combustivel']),
      diasTrab: _p(r['Dias Trab.']),
      litTon  : _p(r['Litros/Ton']),   // Km/L (campo mapeado pelo sistema)
      rEnerg  : _p(r['R. Energetico']),
      disp    : _p(r['Disp %']),
      periodo : String(r['Periodo'] || ''),
    };
  }

  // ── Constrói mapa equip→row filtrando por ALL_EQUIPS ──────────
  function buildMap(rows) {
    const m = new Map();
    for (const r of rows) {
      const f = fields(r);
      if (ALL_EQUIPS.has(f.equip)) m.set(f.equip, f);
    }
    return m;
  }

  // ── Status badge ─────────────────────────────────────────────
  function badge(val, meta, invert=false) {
    if (val == null || val === 0) return 'nd';
    if (invert) {
      // menor = melhor (ex: Lit/Ton)
      if (val <= meta * 0.97) return 'ok';
      if (val <= meta * 1.05) return 'prx';
      return 'bad';
    }
    if (val >= meta) return 'ok';
    if (val >= meta * 0.95) return 'prx';
    return 'bad';
  }

  // ══════════════════════════════════════════════════════════════
  class VisualizerConsumoCaminhoes {

    constructor() {
      this._d1Map  = new Map();
      this._acmMap = new Map();
      this._ts     = '';
      this._total  = 0;
      console.log('[ConsumoCam] v4.0 — registrado');
    }

    // ── Ponto de entrada principal ───────────────────────────────
    // d1Raw  : payload de snapshots/colCamD1  — pode ser:
    //   • objeto {cab, rows, ...}  (snapshot direto)
    //   • array de objetos [{Equip, ...}]  (já parseado pelo app.js)
    //   • string JSON
    // acmRaw : payload de snapshots_bulk/COLCAMACM — pode ser:
    //   • objeto {cab, rows, ...}  (snapshot direto)
    //   • array de objetos [{Equip, ...}]  (já parseado)
    //   • array de chunks [{cab, rows}, ...]
    //   • string JSON
    render(d1Raw, acmRaw, updatedAt) {
      const el = document.getElementById('consumo-cam-tab-content');
      if (!el) {
        console.error('[ConsumoCam] #consumo-cam-tab-content não encontrado');
        return;
      }

      try {
        const d1Rows  = this._normalizeInput(d1Raw);
        const acmRows = this._normalizeInput(acmRaw);

        this._d1Map  = buildMap(d1Rows);
        this._acmMap = buildMap(acmRows);
        this._ts     = updatedAt || '';
        this._total  = ALL_EQUIPS.size;

        console.log(`[ConsumoCam] D1 total=${d1Rows.length} own=${this._d1Map.size} | Acm total=${acmRows.length} own=${this._acmMap.size}`);
        if (this._acmMap.size === 0) {
          console.warn('[ConsumoCam] ⚠️ acmMap vazio — verifique se app.js passa acmRaw correto');
          console.warn('[ConsumoCam] acmRaw type:', typeof acmRaw, Array.isArray(acmRaw) ? `array[${acmRaw.length}]` : '');
        }

        el.innerHTML = this._css() + this._html();
        this._bindTooltips(el);

      } catch (err) {
        console.error('[ConsumoCam] Erro no render:', err);
        el.innerHTML = `<p style="color:red;padding:20px">[ConsumoCam] Erro: ${err.message}</p>`;
      }
    }

    // ── Normaliza qualquer formato de input para array de objetos ──
    _normalizeInput(raw) {
      if (!raw) return [];

      // Já é array de objetos com chaves legíveis (ex: [{Equip:'31215',...}])
      if (Array.isArray(raw)) {
        if (raw.length === 0) return [];
        const first = raw[0];
        // Array de chunks com {cab, rows}
        if (first && (first.cab !== undefined || first.rows !== undefined)) {
          return parseChunked(raw);
        }
        // Array de objetos já mapeados
        if (first && typeof first === 'object' && !Array.isArray(first)) {
          return raw;
        }
        return [];
      }

      // String JSON
      if (typeof raw === 'string') {
        try { return this._normalizeInput(JSON.parse(raw)); } catch(e) { return []; }
      }

      // Objeto único: {cab, rows} ou {payload: '...'} ou {chunks: [...]}
      if (typeof raw === 'object') {
        // Tem campo payload (snapshot do Firestore)
        if (raw.payload) return this._normalizeInput(raw.payload);
        // Tem cab+rows diretamente
        if (raw.cab || raw.rows) return parseSnapshot(raw);
        // Tem chunks
        if (raw.chunks) {
          const chunkArr = Array.isArray(raw.chunks) ? raw.chunks : Object.values(raw.chunks);
          return parseChunked(chunkArr);
        }
      }

      return [];
    }

    // ── CSS ──────────────────────────────────────────────────────
    _css() {
      if (document.getElementById('vcc4-styles')) return '';
      return `<style id="vcc4-styles">
/* ── Reset scope ── */
.vcc-root { font-family: inherit; }

/* ── Variáveis (dark = default) ── */
.vcc-root {
  --vcc-bg       : var(--bg-header, #0A0E17);
  --vcc-bg-card  : var(--glass, rgba(255,255,255,0.07));
  --vcc-bg-table : var(--bg-dark-container, #0A0E17);
  --vcc-text      : var(--text, #F0F0F0);
  --vcc-text-sub  : var(--text-secondary, #D8D8D8);
  --vcc-border    : var(--glass-border, rgba(255,255,255,.12));
  --vcc-accent    : #38bdf8;
  --vcc-ok        : #22c55e;
  --vcc-prx       : #f59e0b;
  --vcc-bad       : #ef4444;
  --vcc-nd        : #64748b;
  --vcc-shadow    : 0 2px 8px rgba(0,0,0,.35);
  --vcc-radius    : 10px;
}

/* ── Modo claro explícito ── */
[data-theme="light"] .vcc-root,
.light .vcc-root,
body.light-mode .vcc-root {
  --vcc-bg       : #F5F5F5;
  --vcc-bg-card  : #FFFFFF;
  --vcc-bg-table : #E8ECF0;
  --vcc-text      : #333333;
  --vcc-text-sub  : #555555;
  --vcc-border    : rgba(0,0,0,.12);
  --vcc-shadow    : 0 2px 8px rgba(0,0,0,.12);
  --vcc-nd        : #888888;
}

/* ── Layout ── */
.vcc-root { background: var(--vcc-bg); color: var(--vcc-text); padding: 16px; border-radius: var(--vcc-radius); }

/* ── Header ── */
.vcc-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
.vcc-title  { font-size:1.1rem; font-weight:700; color: var(--vcc-text); }
.vcc-meta   { font-size:.78rem; color: var(--vcc-text-sub); display:flex; align-items:center; gap:6px; }
.vcc-meta span.dot { width:6px;height:6px;border-radius:50%;background:var(--vcc-accent);display:inline-block; }

/* ── Legend ── */
.vcc-legend { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
.vcc-leg    { display:flex; align-items:center; gap:5px; font-size:.75rem; color:var(--vcc-text-sub); }
.vcc-leg-dot { width:10px;height:10px;border-radius:50%; }

/* ── Cards de KPIs ── */
.vcc-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-bottom:18px; }
.vcc-card  {
  background: var(--vcc-bg-card);
  border: 1px solid var(--vcc-border);
  border-radius: var(--vcc-radius);
  padding: 14px 16px;
  box-shadow: var(--vcc-shadow);
  position: relative;
}
.vcc-card-label { font-size:.72rem; color:var(--vcc-text-sub); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
.vcc-card-meta  { font-size:.7rem; color:var(--vcc-text-sub); margin-bottom:8px; }
.vcc-card-meta b { color: var(--vcc-accent); }
.vcc-card-rows  { display:flex; flex-direction:column; gap:4px; }
.vcc-card-row   { display:flex; justify-content:space-between; align-items:center; }
.vcc-card-period{ font-size:.72rem; color:var(--vcc-text-sub); }
.vcc-card-val   { font-size:1.3rem; font-weight:700; }
.vcc-card-val.ok  { color: var(--vcc-ok); }
.vcc-card-val.prx { color: var(--vcc-prx); }
.vcc-card-val.bad { color: var(--vcc-bad); }
.vcc-card-val.nd  { color: var(--vcc-nd); }
.vcc-card-note  { font-size:.68rem; color:var(--vcc-text-sub); margin-top:6px; font-style:italic; }

/* ── Tabela ── */
.vcc-wrap  { overflow-x:auto; }
.vcc-table { width:100%; border-collapse:collapse; font-size:.82rem; }
.vcc-table th {
  background: var(--vcc-bg-table);
  color: var(--vcc-text-sub);
  font-weight:600;
  font-size:.72rem;
  text-transform:uppercase;
  letter-spacing:.04em;
  padding:8px 10px;
  text-align:right;
  border-bottom: 2px solid var(--vcc-border);
  white-space: nowrap;
}
.vcc-table th:first-child { text-align:left; }
.vcc-table td {
  padding:7px 10px;
  border-bottom: 1px solid var(--vcc-border);
  text-align:right;
  color: var(--vcc-text);
  vertical-align: middle;
}
.vcc-table td:first-child { text-align:left; font-weight:600; }
.vcc-table tr:hover td { background: rgba(56,189,248,.06); }

/* ── Linha de grupo ── */
.vcc-gh td {
  background: var(--vcc-bg-table) !important;
  color: var(--vcc-text) !important;
  font-weight: 700;
  font-size: .80rem;
  padding: 9px 10px;
  border-top: 2px solid var(--vcc-border);
  border-bottom: 1px solid var(--vcc-border);
}
.vcc-gh .vcc-gh-icon { margin-right:6px; }
.vcc-gh .vcc-gh-count { font-size:.7rem; color:var(--vcc-text-sub); font-weight:400; margin-left:6px; }

/* ── Linha de referência/meta ── */
.vcc-ref td {
  background: rgba(56,189,248,.05) !important;
  font-size:.71rem;
  color: var(--vcc-text-sub) !important;
  font-style:italic;
  padding: 5px 10px;
}

/* ── Linha de período (Dia/Acm) ── */
.vcc-period-dia td { background: rgba(255,255,255,.02); }
.vcc-period-acm td { background: rgba(0,0,0,.08); }
[data-theme="light"] .vcc-period-acm td,
.light .vcc-period-acm td { background: rgba(0,0,0,.03); }

/* ── Badge de período ── */
.vcc-badge {
  display:inline-block; font-size:.65rem; font-weight:700;
  padding:1px 6px; border-radius:4px; margin-right:4px;
  text-transform:uppercase; letter-spacing:.04em;
  vertical-align:middle;
}
.vcc-badge.dia { background:rgba(56,189,248,.18); color:#38bdf8; }
.vcc-badge.acm { background:rgba(148,163,184,.18); color:#94a3b8; }

/* ── Valores coloridos ── */
.c-ok  { color: var(--vcc-ok) !important; font-weight:700; }
.c-prx { color: var(--vcc-prx) !important; font-weight:700; }
.c-bad { color: var(--vcc-bad) !important; font-weight:700; }
.c-nd  { color: var(--vcc-nd) !important; }

/* ── Alerta de dado anômalo (Litros/Ton > 10 = sensor com defeito) ── */
.vcc-anomaly {
  display:inline-flex; align-items:center; gap:4px;
  color: var(--vcc-bad) !important; font-weight:700;
}
.vcc-anomaly-icon {
  font-size:.8rem; cursor:help;
  animation: vcc-pulse 1.8s ease-in-out infinite;
}
@keyframes vcc-pulse {
  0%,100% { opacity:1; } 50% { opacity:.45; }
}
.vcc-anomaly-tooltip {
  visibility:hidden; opacity:0; pointer-events:none;
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background:#7f1d1d; color:#fecaca; border:1px solid #ef4444;
  font-size:.7rem; padding:7px 10px; border-radius:7px;
  white-space:normal; min-width:210px; max-width:290px;
  z-index:1000; box-shadow:0 4px 16px rgba(239,68,68,.3);
  transition: opacity .15s; font-weight:400;
}
.vcc-anomaly-wrap { position:relative; display:inline-flex; align-items:center; }
.vcc-anomaly-wrap:hover .vcc-anomaly-tooltip { visibility:visible; opacity:1; }
.vcc-anomaly-tooltip::after {
  content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:#7f1d1d;
}

/* ── Modo claro: reforço de legibilidade (COMPLETO) ── */
[data-theme="light"] .vcc-period-dia td,
.light .vcc-period-dia td { background: rgba(0,0,0,.02); color: #333333 !important; }
[data-theme="light"] .vcc-period-acm td,
.light .vcc-period-acm td { background: rgba(0,0,0,.04); color: #333333 !important; }
[data-theme="light"] .vcc-table td,
.light .vcc-table td { color: #333333 !important; }
[data-theme="light"] .vcc-table th,
.light .vcc-table th { color: #555555 !important; }
[data-theme="light"] .vcc-gh td,
.light .vcc-gh td { color: #111111 !important; background: #D8DDE5 !important; }
[data-theme="light"] .vcc-ref td,
.light .vcc-ref td { color: #555555 !important; }
[data-theme="light"] .c-nd,
.light .c-nd { color: #888888 !important; }
[data-theme="light"] .vcc-badge.dia,
.light .vcc-badge.dia { background:rgba(0,130,180,.15); color:#0070AA; }
[data-theme="light"] .vcc-badge.acm,
.light .vcc-badge.acm { background:rgba(60,70,90,.12); color:#3A4A60; }
[data-theme="light"] .vcc-table tr:hover td,
.light .vcc-table tr:hover td { background: rgba(0,136,204,.08) !important; }
[data-theme="light"] .vcc-tooltip,
.light .vcc-tooltip { background:#2d3748; color:#f0f0f0; border-color:#4a5568; }
[data-theme="light"] .vcc-card-val.nd,
.light .vcc-card-val.nd { color: #888888 !important; }

/* ── Tooltip ── */
.vcc-tooltip-wrap { position:relative; display:inline-flex; align-items:center; gap:4px; cursor:default; }
.vcc-tip-icon { width:13px;height:13px;border-radius:50%;background:rgba(148,163,184,.25);
  color:var(--vcc-text-sub);font-size:.65rem;font-weight:700;
  display:inline-flex;align-items:center;justify-content:center;cursor:help; }
.vcc-tooltip  {
  visibility:hidden; opacity:0; pointer-events:none;
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
  background:#1e293b; color:#e2e8f0; border:1px solid #334155;
  font-size:.72rem; padding:7px 10px; border-radius:7px;
  white-space:normal; min-width:200px; max-width:280px; z-index:999; box-shadow:0 4px 16px rgba(0,0,0,.4);
  transition: opacity .15s;
}
[data-theme="light"] .vcc-tooltip, .light .vcc-tooltip { background:#1e293b; color:#e2e8f0; }
.vcc-tooltip-wrap:hover .vcc-tooltip  { visibility:visible; opacity:1; }
.vcc-tooltip::after {
  content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
  border:5px solid transparent; border-top-color:#1e293b;
}
</style>`;
    }

    // ── HTML principal ────────────────────────────────────────────
    _html() {
      const d1  = this._d1Map;
      const acm = this._acmMap;

      // ── Estatísticas globais ──
      const acmVals = [...acm.values()];
      const d1Vals  = [...d1.values()];

      // Km/L = Litros/Ton (campo mapeado)
      const acmKmlArr = acmVals.filter(f=>f.litTon>0).map(f=>f.litTon);
      const d1KmlArr  = d1Vals.filter(f=>f.litTon>0).map(f=>f.litTon);
      const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;

      const kmlAcm = avg(acmKmlArr);
      const kmlD1  = avg(d1KmlArr);

      // Combustível total
      const combAcm = acmVals.reduce((s,f)=>s+f.comb,0);
      const combD1  = d1Vals.reduce((s,f)=>s+f.comb,0);

      // Horas → proxy de km (Horas × velocidade média ~50km/h para cálculo de km rodados)
      // Na verdade Horas no campo colCam = km rodados (conforme mapeamento do sistema)
      const kmAcm = acmVals.reduce((s,f)=>s+f.horas,0);
      const kmD1  = d1Vals.reduce((s,f)=>s+f.horas,0);

      // R. Energético
      const acmRengArr = acmVals.filter(f=>f.rEnerg>0).map(f=>f.rEnerg);
      const d1RengArr  = d1Vals.filter(f=>f.rEnerg>0).map(f=>f.rEnerg);
      const rengAcm = avg(acmRengArr);
      const rengD1  = avg(d1RengArr);

      // Disponibilidade
      const acmDispArr = acmVals.filter(f=>f.disp>0).map(f=>f.disp);
      const d1DispArr  = d1Vals.filter(f=>f.disp>0).map(f=>f.disp);
      const dispAcm = avg(acmDispArr);
      const dispD1  = avg(d1DispArr);

      // Timestamp
      const tsStr = this._ts
        ? new Date(this._ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',
            day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
        : '—';

      return `
<div class="vcc-root">

  ${this._header(tsStr)}

  ${this._legend()}

  ${this._cards({ kmlD1, kmlAcm, combD1, combAcm, kmD1, kmAcm, rengD1, rengAcm, dispD1, dispAcm })}

  <div class="vcc-wrap">
    <table class="vcc-table">
      <thead>
        <tr>
          <th>Equipamento</th>
          <th>Período</th>
          <th>Km / L<br><span style="font-weight:400;font-size:.68rem">eficiência</span></th>
          <th>Combustível<br><span style="font-weight:400;font-size:.68rem">litros</span></th>
          <th>R. Energ.<br><span style="font-weight:400;font-size:.68rem">índice</span></th>
          <th>Disp %<br><span style="font-weight:400;font-size:.68rem">mecânica</span></th>
        </tr>
      </thead>
      <tbody>
        ${GRUPOS.map(g => this._grupoRows(g, d1, acm)).join('')}
      </tbody>
    </table>
  </div>

</div>`;
    }

    // ── Header ───────────────────────────────────────────────────
    _header(tsStr) {
      const total = this._acmMap.size;
      return `
<div class="vcc-header">
  <div class="vcc-title">🚛 Consumo &amp; Performance — Caminhões Próprios</div>
  <div class="vcc-meta">
    <span class="dot"></span>
    <span class="vcc-tooltip-wrap">
      Atualizado em ${tsStr} · ${total} caminhões ativos
      <span class="vcc-tip-icon">?</span>
      <span class="vcc-tooltip">
        Dados: COLCAMD1 (dia) + COLCAMACM (acumulado safra)<br>
        Atualização automática via bot de ingestão<br>
        Prefixo 31 — Frotas próprias 2015 e 2025
      </span>
    </span>
  </div>
</div>`;
    }

    // ── Legenda ──────────────────────────────────────────────────
    _legend() {
      return `
<div class="vcc-legend">
  <div class="vcc-leg"><div class="vcc-leg-dot" style="background:#22c55e"></div>Na Meta</div>
  <div class="vcc-leg"><div class="vcc-leg-dot" style="background:#f59e0b"></div>Próximo</div>
  <div class="vcc-leg"><div class="vcc-leg-dot" style="background:#ef4444"></div>Abaixo</div>
  <div class="vcc-leg"><div class="vcc-leg-dot" style="background:#64748b"></div>Sem dado</div>
</div>`;
    }

    // ── Cards de KPI ─────────────────────────────────────────────
    _cards({ kmlD1, kmlAcm, combD1, combAcm, kmD1, kmAcm, rengD1, rengAcm, dispD1, dispAcm }) {
      const bkml  = (v,m) => badge(v,m,false);
      const breng = (v,m) => badge(v,m,false);
      const bdisp = (v,m) => badge(v,m,false);

      return `<div class="vcc-cards">

  <div class="vcc-card">
    <div class="vcc-card-label">
      <span class="vcc-tooltip-wrap">Km / Litro
        <span class="vcc-tip-icon">?</span>
        <span class="vcc-tooltip">Eficiência de combustível<br>Campo "Litros/Ton" mapeado como Km/L<br>pelo sistema de telemetria</span>
      </span>
    </div>
    <div class="vcc-card-meta">Meta: <b>${META_KML.toFixed(2)} km/L</b></div>
    <div class="vcc-card-rows">
      <div class="vcc-card-row">
        <span class="vcc-card-period">Hoje</span>
        <span class="vcc-card-val ${bkml(kmlD1,META_KML)}">${_fmt(kmlD1,2)}</span>
      </div>
      <div class="vcc-card-row">
        <span class="vcc-card-period">Acumulado</span>
        <span class="vcc-card-val ${bkml(kmlAcm,META_KML)}">${_fmt(kmlAcm,2)}</span>
      </div>
    </div>
  </div>

  <div class="vcc-card">
    <div class="vcc-card-label">
      <span class="vcc-tooltip-wrap">Combustível
        <span class="vcc-tip-icon">?</span>
        <span class="vcc-tooltip">Total consumido pela frota própria<br>Soma de todos os caminhões ativos</span>
      </span>
    </div>
    <div class="vcc-card-meta">Total consumido (frota)</div>
    <div class="vcc-card-rows">
      <div class="vcc-card-row">
        <span class="vcc-card-period">Hoje</span>
        <span class="vcc-card-val nd">${_fmtInt(combD1)} L</span>
      </div>
      <div class="vcc-card-row">
        <span class="vcc-card-period">Acumulado</span>
        <span class="vcc-card-val nd">${_fmtInt(combAcm)} L</span>
      </div>
    </div>
  </div>

  <div class="vcc-card">
    <div class="vcc-card-label">
      <span class="vcc-tooltip-wrap">Km Rodados
        <span class="vcc-tip-icon">?</span>
        <span class="vcc-tooltip">Quilômetros totais percorridos<br>Campo "Horas" = km rodados<br>conforme mapeamento do bot</span>
      </span>
    </div>
    <div class="vcc-card-meta">Total da frota</div>
    <div class="vcc-card-rows">
      <div class="vcc-card-row">
        <span class="vcc-card-period">Hoje</span>
        <span class="vcc-card-val nd">${_fmtInt(kmD1)} km</span>
      </div>
      <div class="vcc-card-row">
        <span class="vcc-card-period">Acumulado</span>
        <span class="vcc-card-val nd">${_fmtInt(kmAcm)} km</span>
      </div>
    </div>
  </div>

  <div class="vcc-card">
    <div class="vcc-card-label">
      <span class="vcc-tooltip-wrap">R. Energético
        <span class="vcc-tip-icon">?</span>
        <span class="vcc-tooltip">Índice de Rendimento Energético<br>Meta: ≥ ${META_RENG}<br>Média da frota com dados disponíveis</span>
      </span>
    </div>
    <div class="vcc-card-meta">Meta: <b>≥ ${META_RENG}</b></div>
    <div class="vcc-card-rows">
      <div class="vcc-card-row">
        <span class="vcc-card-period">Hoje</span>
        <span class="vcc-card-val ${breng(rengD1,META_RENG)}">${rengD1 ? _fmt(rengD1,1) : '—'}</span>
      </div>
      <div class="vcc-card-row">
        <span class="vcc-card-period">Acumulado</span>
        <span class="vcc-card-val ${breng(rengAcm,META_RENG)}">${rengAcm ? _fmt(rengAcm,1) : '—'}</span>
      </div>
    </div>
    ${rengD1 == null ? `<div class="vcc-card-note">Série 15: dado disponível<br>Série 25: aguarda bot v2</div>` : ''}
  </div>

  <div class="vcc-card">
    <div class="vcc-card-label">
      <span class="vcc-tooltip-wrap">Disponibilidade
        <span class="vcc-tip-icon">?</span>
        <span class="vcc-tooltip">Disponibilidade Mecânica (%)<br>Meta: ≥ ${META_DISP}%<br>Média da frota com dados disponíveis</span>
      </span>
    </div>
    <div class="vcc-card-meta">Meta: <b>${META_DISP}%</b></div>
    <div class="vcc-card-rows">
      <div class="vcc-card-row">
        <span class="vcc-card-period">Hoje</span>
        <span class="vcc-card-val ${bdisp(dispD1,META_DISP)}">${dispD1 ? _fmt(dispD1,1)+'%' : '—'}</span>
      </div>
      <div class="vcc-card-row">
        <span class="vcc-card-period">Acumulado</span>
        <span class="vcc-card-val ${bdisp(dispAcm,META_DISP)}">${dispAcm ? _fmt(dispAcm,1)+'%' : '—'}</span>
      </div>
    </div>
    ${dispD1 == null ? `<div class="vcc-card-note">Série 15: dado disponível<br>Série 25: aguarda bot v2</div>` : ''}
  </div>

</div>`;
    }

    // ── Linhas de um grupo ────────────────────────────────────────
    _grupoRows(grupo, d1, acm) {
      const count = grupo.equips.filter(e => acm.has(e) || d1.has(e)).length;
      const rows  = [`
<tr class="vcc-gh">
  <td colspan="6">
    <span class="vcc-gh-icon">📦</span>${grupo.label}
    <span class="vcc-gh-count">(${count} equip.)</span>
  </td>
</tr>
<tr class="vcc-ref">
  <td>Referência (Meta)</td>
  <td></td>
  <td>≥ ${META_KML.toFixed(2)} km/L</td>
  <td>—</td>
  <td>≥ ${META_RENG}</td>
  <td>${META_DISP}%</td>
</tr>`];

      for (const equip of grupo.equips) {
        const d  = d1.get(equip)  || null;
        const a  = acm.get(equip) || null;
        if (!d && !a) {
          // equipamento sem dado algum — mostra linha cinza
          rows.push(`
<tr class="vcc-period-dia">
  <td rowspan="2">${equip}</td>
  <td><span class="vcc-badge dia">Dia</span></td>
  <td class="c-nd">—</td><td class="c-nd">—</td><td class="c-nd">—</td><td class="c-nd">—</td>
</tr>
<tr class="vcc-period-acm">
  <td><span class="vcc-badge acm">Acm</span></td>
  <td class="c-nd">—</td><td class="c-nd">—</td><td class="c-nd">—</td><td class="c-nd">—</td>
</tr>`);
          continue;
        }

        // ── Linha DIA ──
        const dKml  = d ? d.litTon  : null;
        const dComb = d ? d.comb    : null;
        const dReng = d ? d.rEnerg  : null;
        const dDisp = d ? d.disp    : null;

        // ── Linha ACM ──
        const aKml  = a ? a.litTon  : null;
        const aComb = a ? a.comb    : null;
        const aReng = a ? a.rEnerg  : null;
        const aDisp = a ? a.disp    : null;

        const bKmlD  = dKml  && dKml>0  ? badge(dKml, META_KML)   : 'nd';
        const bKmlA  = aKml  && aKml>0  ? badge(aKml, META_KML)   : 'nd';
        const bRengD = dReng && dReng>0  ? badge(dReng, META_RENG) : 'nd';
        const bRengA = aReng && aReng>0  ? badge(aReng, META_RENG) : 'nd';
        const bDispD = dDisp && dDisp>0  ? badge(dDisp, META_DISP) : 'nd';
        const bDispA = aDisp && aDisp>0  ? badge(aDisp, META_DISP) : 'nd';

        rows.push(`
<tr class="vcc-period-dia">
  <td rowspan="2" style="border-right:1px solid var(--vcc-border)">${equip}</td>
  <td><span class="vcc-badge dia">Dia</span></td>
  <td>${kmlCell(dKml, bKmlD)}</td>
  <td class="c-nd">${dComb && dComb>0 ? _fmtInt(dComb)+' L' : '—'}</td>
  <td class="c-${bRengD}">${dReng && dReng>0 ? _fmt(dReng,1) : '—'}</td>
  <td class="c-${bDispD}">${dDisp && dDisp>0 ? _fmt(dDisp,1)+'%' : '—'}</td>
</tr>
<tr class="vcc-period-acm">
  <td><span class="vcc-badge acm">Acm</span></td>
  <td>${kmlCell(aKml, bKmlA)}</td>
  <td class="c-nd">${aComb && aComb>0 ? _fmtInt(aComb)+' L' : '—'}</td>
  <td class="c-${bRengA}">${aReng && aReng>0 ? _fmt(aReng,1) : '—'}</td>
  <td class="c-${bDispA}">${aDisp && aDisp>0 ? _fmt(aDisp,1)+'%' : '—'}</td>
</tr>`);
      }

      return rows.join('');
    }

    // ── Tooltips hover (fallback JS) ──────────────────────────────
    _bindTooltips(el) {
      // CSS hover já resolve — este método é placeholder para futura interatividade
    }
  }

  // ── Expõe globalmente ─────────────────────────────────────────
  window.VisualizerConsumoCam = VisualizerConsumoCaminhoes;
  console.log('[ConsumoCam] v4.0 FINAL — window.VisualizerConsumoCam registrado');

})();