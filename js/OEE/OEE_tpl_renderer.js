// ============================================================
// OEE_tpl_renderer.js — Renderizador OEE baseado em dados TPL
// Estrutura TPL: COD.EQUIPAMENTO, GRUPO EQUIPAMENTO, DESC.GRUPO OPERAC.
//   HRS OPERACIONAIS, ESTADO, DATA/HORA LOCAL
//
// Cores por categoria (REGRA — não alterar):
//   Produtivas   → #40800c (Verde)
//   Improdutivas → #FF8C00 (Laranja)
//   Climático    → #38bdf8 (Azul claro)
//   Manutenção   → #ef4444 (Vermelho)
//   Preventiva   → #8b5cf6 (Roxo)
//   Indeterminado→ #1f2937 (Preto/escuro)
// ============================================================

const OEE_TPL_COLORS = {
    'Produtivas':    { bg: '#40800c', fill: 'rgba(64,128,12,0.7)',   label: 'Produtivas'    },
    'Improdutivas':  { bg: '#FF8C00', fill: 'rgba(255,140,0,0.7)',   label: 'Improdutivas'  },
    'Climático':     { bg: '#38bdf8', fill: 'rgba(56,189,248,0.7)',  label: 'Climático'     },
    'Manutenção':    { bg: '#ef4444', fill: 'rgba(239,68,68,0.7)',   label: 'Manutenção'    },
    'Preventiva':    { bg: '#8b5cf6', fill: 'rgba(139,92,246,0.7)',  label: 'Preventiva'    },
    'Indeterminado': { bg: '#374151', fill: 'rgba(55,65,81,0.7)',    label: 'Indeterminado' },
};

const OEE_CATEGORY_ORDER = ['Produtivas','Manutenção','Preventiva','Climático','Improdutivas','Indeterminado'];

// ── Parse HH:MM:SS to seconds ────────────────────────────────
function _parseHrs(s) {
    if (!s || typeof s !== 'string') return 0;
    const p = s.split(':');
    if (p.length < 2) return 0;
    return (parseInt(p[0])||0)*3600 + (parseInt(p[1])||0)*60 + (parseInt(p[2])||0);
}

// ── Normalize category name ──────────────────────────────────
function _normCat(raw) {
    if (!raw) return 'Indeterminado';
    const r = raw.trim().toLowerCase();
    if (r.includes('prod') && !r.includes('improd')) return 'Produtivas';
    if (r.includes('improd')) return 'Improdutivas';
    if (r.includes('lim') || r.includes('clima')) return 'Climático';
    if (r.includes('anu') || r.includes('mecân') || r.includes('mecan')) return 'Manutenção';
    if (r.includes('prev') || r.includes('event')) return 'Preventiva';
    return 'Indeterminado';
}

// ── Build summary per equipment from tplData ─────────────────
function buildOEESummary(tplData, prefixes) {
    if (!Array.isArray(tplData) || !tplData.length) return [];

    const byEquip = new Map();

    tplData.forEach(row => {
        const eq = String(row['Equip'] || row['COD. EQUIPAMENTO'] || row['cod_equipamento'] || '').trim();
        if (!eq) return;
        if (prefixes && !prefixes.some(p => eq.startsWith(p))) return;

        const cat = _normCat(row['DESC.GRUPO OPERAC.'] || row['desc_grupo_operac'] || row['grupo_operac'] || '');
        const hrs = _parseHrs(row['HRS OPERACIONAIS'] || row['hrs_operacionais'] || '0') / 3600;
        const frente = String(row['GRUPO EQUIPAMENTO'] || row['grupo_equipamento'] || '').trim();
        const data   = String(row['DATA/HORA LOCAL'] || row['data_hora_local'] || '').trim();

        if (!byEquip.has(eq)) {
            byEquip.set(eq, {
                eq, frente,
                cats: { Produtivas:0, Improdutivas:0, 'Manutenção':0, 'Preventiva':0, 'Climático':0, Indeterminado:0 },
                total: 0, datas: new Set()
            });
        }
        const d = byEquip.get(eq);
        d.cats[cat] = (d.cats[cat] || 0) + hrs;
        d.total += hrs;
        if (data) d.datas.add(data.substring(0,10));
    });

    return Array.from(byEquip.values()).map(d => {
        const avail  = d.total - (d.cats['Manutenção']||0) - (d.cats['Preventiva']||0);
        const active = avail - (d.cats['Climático']||0);
        const disp   = d.total > 0 ? (avail / d.total) * 100 : 0;
        const aprov  = active > 0  ? ((d.cats['Produtivas']||0) / active) * 100 : 0;
        const qual   = 100; // qualidade assumida 100% (sem dados de refugo)
        const oee    = (disp / 100) * (aprov / 100) * (qual / 100) * 100;
        return { ...d, disp, aprov, qual, oee, dias: d.datas.size || 1 };
    }).sort((a, b) => b.oee - a.oee);
}

// ── Render OEE tab content ───────────────────────────────────
function renderOEETab(containerId, tplData, prefixes, titulo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const summary = buildOEESummary(tplData, prefixes);

    if (!summary.length) {
        container.innerHTML = `
            <div style="padding:60px 20px;text-align:center;">
                <i class="fas fa-database" style="font-size:3rem;color:var(--primary);opacity:0.3;"></i>
                <p style="margin-top:16px;color:var(--text);font-size:0.9rem;">
                    Nenhum dado TPL disponível para ${titulo}.<br>
                    Execute <code>migrarTPLSafra()</code> no GAS para popular os dados.
                </p>
            </div>`;
        return;
    }

    // Global averages
    const gDisp  = summary.reduce((s,d) => s+d.disp,  0) / summary.length;
    const gAprov = summary.reduce((s,d) => s+d.aprov, 0) / summary.length;
    const gOEE   = summary.reduce((s,d) => s+d.oee,   0) / summary.length;

    const fmt1 = n => isNaN(n)||!n ? '—' : n.toFixed(1)+'%';

    const kpiHtml = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:20px;">
        ${[
            {l:'OEE Global',      v:fmt1(gOEE),  c: gOEE>=65?'#40800c':gOEE>=40?'#FF8C00':'#ef4444'},
            {l:'Disponibilidade', v:fmt1(gDisp), c: gDisp>=85?'#40800c':gDisp>=70?'#FF8C00':'#ef4444'},
            {l:'Aproveitamento',  v:fmt1(gAprov),c: gAprov>=70?'#40800c':gAprov>=50?'#FF8C00':'#ef4444'},
            {l:'Equipamentos',    v:summary.length, c:'var(--primary,#00D4FF)'},
        ].map(k=>`
        <div style="background:rgba(15,23,42,0.7);border:1px solid rgba(255,255,255,0.08);border-left:4px solid ${k.c};
                    border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:1.6rem;font-weight:900;color:${k.c};">${k.v}</div>
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text);margin-top:4px;">${k.l}</div>
        </div>`).join('')}
    </div>`;

    // Legend
    const legendHtml = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        ${OEE_CATEGORY_ORDER.map(cat => {
            const c = OEE_TPL_COLORS[cat];
            return `<span style="display:flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:700;color:var(--text);">
                <span style="width:12px;height:12px;border-radius:3px;background:${c.bg};flex-shrink:0;"></span>
                ${c.label}
            </span>`;
        }).join('')}
    </div>`;

    // Equipment rows
    const rowsHtml = summary.map(d => {
        const totalSec = d.total * 3600;
        const bars = OEE_CATEGORY_ORDER.map(cat => {
            const hrs = d.cats[cat] || 0;
            const pct = d.total > 0 ? (hrs / d.total) * 100 : 0;
            if (pct < 0.5) return '';
            const c = OEE_TPL_COLORS[cat];
            return `<div title="${cat}: ${hrs.toFixed(1)}h (${pct.toFixed(1)}%)"
                        style="width:${pct}%;background:${c.bg};height:100%;
                               transition:width .5s;cursor:help;"></div>`;
        }).join('');

        const oeeColor = d.oee>=65?'#40800c':d.oee>=40?'#FF8C00':'#ef4444';
        const dispColor = d.disp>=85?'#40800c':d.disp>=70?'#FF8C00':'#ef4444';

        return `
        <div style="background:rgba(10,16,30,0.65);border:1px solid rgba(255,255,255,0.07);
                    border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1rem;font-weight:900;color:var(--text);">${d.eq}</span>
                    ${d.frente ? `<span style="font-size:0.72rem;color:var(--text);opacity:0.6;background:rgba(255,255,255,0.06);
                                       padding:2px 8px;border-radius:10px;">${d.frente}</span>` : ''}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:0.72rem;font-weight:800;color:${oeeColor};">OEE: ${fmt1(d.oee)}</span>
                    <span style="font-size:0.72rem;font-weight:800;color:${dispColor};">Disp: ${fmt1(d.disp)}</span>
                    <span style="font-size:0.72rem;color:var(--text);">Total: ${d.total.toFixed(0)}h</span>
                </div>
            </div>
            <!-- Stacked bar -->
            <div style="height:20px;border-radius:6px;overflow:hidden;display:flex;background:rgba(255,255,255,0.04);">
                ${bars}
            </div>
            <!-- Hours breakdown -->
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${OEE_CATEGORY_ORDER.filter(c=>d.cats[c]>0).map(cat=>{
                    const h = d.cats[cat];
                    const pct = d.total>0?(h/d.total*100):0;
                    return `<span style="font-size:0.68rem;padding:2px 7px;border-radius:8px;
                                background:${OEE_TPL_COLORS[cat].fill};color:#fff;font-weight:700;">
                        ${OEE_TPL_COLORS[cat].label}: ${h.toFixed(1)}h (${pct.toFixed(0)}%)
                    </span>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
    <style>
    [data-theme="light"] .oee-equip-row { background: rgba(255,255,255,0.85) !important; border-color: rgba(0,0,0,0.08) !important; }
    </style>
    <div style="display:flex;flex-direction:column;gap:0;padding:4px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <h3 style="margin:0;font-size:1.1rem;font-weight:800;color:var(--text);display:flex;align-items:center;gap:10px;">
                <span style="width:32px;height:32px;border-radius:8px;background:rgba(99,102,241,0.15);color:#6366f1;
                             display:inline-flex;align-items:center;justify-content:center;font-size:0.9rem;">
                    <i class="fas fa-chart-bar"></i>
                </span>
                ${titulo}
            </h3>
            <span style="font-size:0.72rem;color:var(--text);opacity:0.5;">${summary.length} equipamentos analisados</span>
        </div>
        ${kpiHtml}
        ${legendHtml}
        <div style="display:flex;flex-direction:column;gap:10px;">
            ${rowsHtml}
        </div>
    </div>`;
}

// ── Render Gargalos tab ──────────────────────────────────────
function renderGargalosTab(tplData) {
    const container = document.getElementById('tab-gargalos');
    if (!container) return;

    const all = buildOEESummary(tplData, null);
    if (!all.length) {
        container.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--text);">
            <i class="fas fa-exclamation-triangle" style="font-size:3rem;opacity:0.3;"></i>
            <p style="margin-top:16px;">Sem dados TPL para análise de gargalos.</p></div>`;
        return;
    }

    // Top gargalos: equipamentos com maior % de tempo improdutivo ou manutenção
    const gargalos = all
        .filter(d => d.total > 0)
        .map(d => ({
            ...d,
            pctImprod: d.total>0 ? (d.cats['Improdutivas']||0)/d.total*100 : 0,
            pctManut : d.total>0 ? ((d.cats['Manutenção']||0)+(d.cats['Preventiva']||0))/d.total*100 : 0,
            pctClim  : d.total>0 ? (d.cats['Climático']||0)/d.total*100 : 0,
        }))
        .sort((a,b) => (b.pctManut + b.pctImprod) - (a.pctManut + a.pctImprod));

    const gRows = gargalos.slice(0,15).map((d,i) => {
        const isAlert = d.pctManut > 10 || d.oee < 30;
        const icon = d.pctManut > 10 ? '🔴' : d.pctImprod > 70 ? '🟠' : '🟡';
        return `
        <div style="display:grid;grid-template-columns:24px 1fr auto auto auto;gap:12px;align-items:center;
                    padding:10px 14px;background:rgba(10,16,30,0.6);border-radius:8px;
                    border-left:3px solid ${isAlert?'#ef4444':'#FF8C00'};">
            <span style="font-size:0.85rem;">${icon}</span>
            <div>
                <span style="font-weight:800;color:var(--text);">${d.eq}</span>
                ${d.frente?`<span style="margin-left:8px;font-size:0.7rem;color:var(--text);opacity:0.5;">${d.frente}</span>`:''}
            </div>
            <span style="font-size:0.72rem;color:#ef4444;font-weight:700;white-space:nowrap;">
                ${d.pctManut>0?`Manut: ${d.pctManut.toFixed(1)}%`:''}
            </span>
            <span style="font-size:0.72rem;color:#FF8C00;font-weight:700;white-space:nowrap;">
                Improd: ${d.pctImprod.toFixed(1)}%
            </span>
            <span style="font-size:0.72rem;color:${d.oee>=40?'#40800c':'#ef4444'};font-weight:800;white-space:nowrap;">
                OEE: ${d.oee.toFixed(1)}%
            </span>
        </div>`;
    }).join('');

    container.querySelector('.oee-tab-wrapper').innerHTML = `
    <div style="padding:4px 0;">
        <h3 style="margin:0 0 16px;font-size:1.1rem;font-weight:800;color:var(--text);">
            <i class="fas fa-exclamation-triangle" style="color:var(--warning);margin-right:8px;"></i>
            Gargalos Operacionais — Análise de Perdas
        </h3>
        <div style="display:flex;flex-direction:column;gap:8px;">${gRows}</div>
    </div>`;
}

// ── Render Comparativo OEE ────────────────────────────────────
function renderComparativoOEE(tplData) {
    const container = document.getElementById('tab-comparativo-oee');
    if (!container) return;

    const proprias  = buildOEESummary(tplData, ['80','81','82']);
    const terceiras = buildOEESummary(tplData, ['92','93','94','95']);

    if (!proprias.length && !terceiras.length) {
        container.querySelector('.oee-tab-wrapper').innerHTML =
            `<div style="padding:60px 20px;text-align:center;color:var(--text);">Sem dados TPL.</div>`;
        return;
    }

    const avg = arr => arr.length ? arr.reduce((s,d)=>s+d.oee,0)/arr.length : 0;
    const avgDisp = arr => arr.length ? arr.reduce((s,d)=>s+d.disp,0)/arr.length : 0;

    const fmt = n => isNaN(n)?'—':n.toFixed(1)+'%';

    container.querySelector('.oee-tab-wrapper').innerHTML = `
    <div style="padding:4px 0;">
        <h3 style="margin:0 0 16px;font-size:1.1rem;font-weight:800;color:var(--text);">
            <i class="fas fa-balance-scale" style="color:var(--primary);margin-right:8px;"></i>
            Comparativo OEE — Próprias vs Terceiras
        </h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            <div style="background:rgba(64,128,12,0.1);border:1px solid rgba(64,128,12,0.3);
                        border-radius:12px;padding:20px;text-align:center;">
                <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;color:var(--text);margin-bottom:12px;">
                    <i class="fas fa-tractor" style="color:#40800c;margin-right:6px;"></i> Próprias (80xxx)
                </div>
                <div style="font-size:2rem;font-weight:900;color:#40800c;">${fmt(avg(proprias))}</div>
                <div style="font-size:0.75rem;color:var(--text);margin-top:4px;">OEE Médio</div>
                <div style="font-size:0.85rem;color:var(--text);margin-top:8px;">Disp: ${fmt(avgDisp(proprias))} · ${proprias.length} equip.</div>
            </div>
            <div style="background:rgba(255,140,0,0.1);border:1px solid rgba(255,140,0,0.3);
                        border-radius:12px;padding:20px;text-align:center;">
                <div style="font-size:0.72rem;font-weight:800;text-transform:uppercase;color:var(--text);margin-bottom:12px;">
                    <i class="fas fa-handshake" style="color:#FF8C00;margin-right:6px;"></i> Terceiras (92/93xxx)
                </div>
                <div style="font-size:2rem;font-weight:900;color:#FF8C00;">${fmt(avg(terceiras))}</div>
                <div style="font-size:0.75rem;color:var(--text);margin-top:4px;">OEE Médio</div>
                <div style="font-size:0.85rem;color:var(--text);margin-top:8px;">Disp: ${fmt(avgDisp(terceiras))} · ${terceiras.length} equip.</div>
            </div>
        </div>
        <canvas id="oeeComparativoChart" style="max-height:280px;"></canvas>
    </div>`;

    // Render comparison chart
    const canvas = document.getElementById('oeeComparativoChart');
    if (canvas && typeof Chart !== 'undefined') {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
        const isDark = !document.documentElement.getAttribute('data-theme');
        const fontColor = isDark ? '#F0F0F0' : '#111';
        new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['OEE', 'Disponibilidade', 'Aproveitamento'],
                datasets: [
                    {
                        label: 'Próprias',
                        data: [avg(proprias), avgDisp(proprias), proprias.length?proprias.reduce((s,d)=>s+d.aprov,0)/proprias.length:0],
                        backgroundColor: 'rgba(64,128,12,0.55)', borderColor: '#40800c', borderWidth: 2, borderRadius: 4
                    },
                    {
                        label: 'Terceiras',
                        data: [avg(terceiras), avgDisp(terceiras), terceiras.length?terceiras.reduce((s,d)=>s+d.aprov,0)/terceiras.length:0],
                        backgroundColor: 'rgba(255,140,0,0.55)', borderColor: '#FF8C00', borderWidth: 2, borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { min:0, max:100, ticks: { callback: v=>v+'%', color:fontColor }, grid: { color: 'rgba(255,255,255,0.06)' } },
                    x: { ticks: { color: fontColor }, grid: { display: false } }
                },
                plugins: {
                    legend: { labels: { color: fontColor } },
                    tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } }
                }
            }
        });
    }
}

// ── Public API ───────────────────────────────────────────────
window.OEE_TPL = {
    renderColhedoras: (tplData) => {
        renderOEETab('oee-colhedoras-content', tplData,
            ['80','81','82','92','93','94','95'],
            'OEE Colhedoras — Próprias & Terceiras');
    },
    renderCaminhoes: (tplData) => {
        renderOEETab('oee-caminhoes-content', tplData,
            ['31','32','91'], 'OEE Caminhões — Próprios & Terceiros');
    },
    renderComparativo: (tplData) => renderComparativoOEE(tplData),
    renderGargalos:    (tplData) => renderGargalosTab(tplData),
    buildSummary: buildOEESummary
};
