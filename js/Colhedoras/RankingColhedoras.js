// ============================================================
// js/Colhedoras/RankingColhedoras.js — Futuristic Redesign
// ⚠️ Operadores: usa campo Dsc.Oper.Carreg./Colhed. (não Cod.)
//    Concatenação: "COD - NOME" para identificação única
// ============================================================

function initRankingColhedoras(r) { updateRankingColhedoras(r); }

function updateRankingColhedoras(r) {
    if (!r) return;
    _renderBars('topEquipamentosProprios',  r.topEquipamentosProprios,  '#40800c');  // verde para próprias
    _renderBars('topEquipamentosTerceiros', r.topEquipamentosTerceiros, '#ff8c00');  // laranja para terceiras
    _renderBars('topOperadoresColheitaPropria', r.topOperadoresColheitaPropria, '#40800c');  // verde
    _renderBars('topTransbordos', r.topTransbordos, '#f59e0b');
    _renderResumo(r);
    _renderDonut(r);
}

// ── Horizontal bar list (novo design futurístico) ──────────────
function _renderBars(containerId, items, accentColor) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    if (!items || items.length === 0) {
        el.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:0.78rem;padding:12px 0;text-align:center;">Sem dados disponíveis</div>`;
        return;
    }

    const maxVal = Math.max(...items.map(i => i.value || i.peso || 0), 1);
    const rankColors = ['colh-rank-1','colh-rank-2','colh-rank-3','colh-rank-n','colh-rank-n'];
    const gradients  = [
        `linear-gradient(90deg, ${accentColor}, ${accentColor}cc)`,
        `linear-gradient(90deg, ${accentColor}cc, ${accentColor}99)`,
        `linear-gradient(90deg, ${accentColor}99, ${accentColor}77)`,
        `linear-gradient(90deg, ${accentColor}77, ${accentColor}55)`,
        `linear-gradient(90deg, ${accentColor}55, ${accentColor}33)`,
    ];

    items.slice(0, 5).forEach((item, i) => {
        const peso  = item.value || item.peso || 0;
        // Operadores: mostra "COD - NOME" completo conforme especificação
        // Equipamentos: mostra o código diretamente
        const rawName = item.name || item.codigo || item.operador || '—';
        const name = _safe(String(rawName).trim());
        const sub   = ''; // frente removida - operadores/transbordos não têm frente única
        const pct   = maxVal > 0 ? (peso / maxVal) * 100 : 0;

        const div = document.createElement('div');
        div.className = 'colh-bar-item';
        div.innerHTML = `
            <div class="colh-bar-meta">
                <div style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">
                    <span class="colh-rank-badge ${rankColors[i] || 'colh-rank-n'}">${i+1}</span>
                    <div style="min-width:0;">
                        <div class="colh-bar-name" title="${name}">${name}</div>
                        ${sub ? `<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:1px;">${sub}</div>` : ''}
                    </div>
                </div>
                <span class="colh-bar-val">${_fmtTon(peso)} t</span>
            </div>
            <div class="colh-bar-track">
                <div class="colh-bar-fill" style="width:${pct.toFixed(1)}%;background:${gradients[i]};"></div>
            </div>
        `;
        el.appendChild(div);
    });
}

// ── Donut chart (usando Chart.js) ─────────────────────────────
function _renderDonut(r) {
    const canvas = document.getElementById('harvestChart');
    if (!canvas) return;

    // Use total real de todas as colhedoras (não só top-5)
    const prop  = r.totalPesoColhProprias  > 0 ? r.totalPesoColhProprias
                : (r.topEquipamentosProprios  || []).reduce((s,i) => s+(i.value||i.peso||0), 0);
    const terc  = r.totalPesoColhTerceiros > 0 ? r.totalPesoColhTerceiros
                : (r.topEquipamentosTerceiros || []).reduce((s,i) => s+(i.value||i.peso||0), 0);
    const total = prop + terc;
    if (total === 0) return;

    // Destroy any existing chart on this canvas (from datavisualizer or previous render)
    if (canvas._chartInst) { try { canvas._chartInst.destroy(); } catch(e){} canvas._chartInst = null; }
    if (typeof Chart !== 'undefined') {
        const existing = Chart.getChart(canvas);
        if (existing) { try { existing.destroy(); } catch(e) {} }
    }

    const ctx = canvas.getContext('2d');
    canvas._chartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Próprias', 'Terceiras'],
            datasets: [{
                data: [prop, terc],
                backgroundColor: ['rgba(64,128,12,0.75)', 'rgba(255,140,0,0.75)'],  // verde próprias, laranja terceiras
                borderColor:     ['#40800c', '#ff8c00'],  // verde próprias, laranja terceiras
                borderWidth: 2,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        // Cor dinâmica: branca no modo escuro, escura no modo claro
                        color: document.documentElement.getAttribute('data-theme') === 'light'
                            ? '#1f2937' : '#F0F0F0',
                        font: { size: 11, weight: '700' },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'rect',   // quadrado em vez de bola
                        pointStyleWidth: 12,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${_fmtTon(ctx.raw)} t (${((ctx.raw/total)*100).toFixed(1)}%)`
                    }
                }
            }
        },
        plugins: [{
            // Center text plugin
            id: 'centerText',
            beforeDraw(chart) {
                const { ctx: c, chartArea: { width, height, left, top } } = chart;
                c.save();
                const x = left + width/2, y = top + height/2;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillStyle = '#40800c';
                c.font = 'bold 13px "Segoe UI"';
                // Format: never let number overflow the donut hole
                const totalStr = total >= 1000000 
                    ? (total/1000000).toFixed(1) + ' M t'
                    : total >= 1000 
                    ? (total/1000).toFixed(1) + ' k t'
                    : total.toFixed(0) + ' t';
                c.fillText(totalStr, x, y - 8);
                c.fillStyle = 'rgba(255,255,255,0.55)';
                c.font = '11px "Segoe UI"';
                c.fillText('TOTAL', x, y + 10);
                c.restore();
            }
        }]
    });
}

function _renderResumo(r) {
    const prop  = (r.topEquipamentosProprios  || []).length;
    const terc  = (r.topEquipamentosTerceiros || []).length;
    _setText('totalColhedoras', prop + terc);
    _setText('colhedorasAtivas', r.colhedorasAtivas || prop);
}

function _setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function _fmtTon(val) {
    const n = typeof val === 'number' ? val : parseFloat(val) || 0;
    // Nunca abreviar — sempre número completo com exatamente 2 casas decimais
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _safe(t) {
    return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.RankingColhedoras = { init: initRankingColhedoras, update: updateRankingColhedoras };