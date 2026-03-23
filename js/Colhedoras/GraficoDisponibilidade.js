// ============================================================
// js/Colhedoras/GraficoDisponibilidade.js
// Responsabilidade: Gráfico de disponibilidade das colhedoras
//   — Barra horizontal por equipamento mostrando Disp %
//     com linha de meta e cores verde/amarelo/vermelho
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (chama init/update com dados da planilha ColConAcm)
// Interage com: RankingColhedoras.js (mesma aba, dados de disponibilidade)
// Se alterar fonte de dados de disponibilidade, revisar RankingColhedoras.js
// ============================================================

let _chartDisp = null;

/** Meta de disponibilidade (%) */
const META_DISP = 85;

/**
 * Inicializa o gráfico de disponibilidade.
 * @param {Object[]} colConAcmRows - Linhas da planilha ColConAcm
 */
function initGraficoDisponibilidade(colConAcmRows) {
    updateGraficoDisponibilidade(colConAcmRows);
}

/**
 * Atualiza o gráfico com novos dados.
 * @param {Object[]} colConAcmRows
 */
function updateGraficoDisponibilidade(colConAcmRows) {
    if (!colConAcmRows || colConAcmRows.length === 0) return;

    const dados = _processarDisponibilidade(colConAcmRows);
    if (!dados.length) return;

    _render(dados);
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

function _processarDisponibilidade(rows) {
    return rows
        .filter(r => {
            const cod = String(r.Equip || r.equip || r['COD. EQUIPAMENTO'] || '');
            return cod.startsWith('80');           // apenas colhedoras série 800
        })
        .map(r => {
            const cod  = String(r.Equip || r.equip || r['COD. EQUIPAMENTO'] || '').trim();
            let disp   = _p(r['Disp %'] || r.disp || r.DISP || r.disponibilidade || 0);
            if (disp > 0 && disp <= 1) disp *= 100;  // converte fração para %
            return { cod, disp: Math.round(disp * 10) / 10 };
        })
        .filter(d => d.disp > 0)
        .sort((a, b) => b.disp - a.disp)
        .slice(0, 20);  // limita a 20 para legibilidade
}

function _render(dados) {
    const canvasId = 'chartDisponibilidadeColhedoras';
    const canvas   = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const labels     = dados.map(d => d.cod);
    const valores    = dados.map(d => d.disp);
    const bgColors   = valores.map(v =>
        v >= META_DISP      ? 'rgba(64,128,12,0.75)'   :
        v >= META_DISP - 10 ? 'rgba(255,184,0,0.75)'  :
                              'rgba(255,46,99,0.75)'
    );

    if (_chartDisp) {
        _chartDisp.data.labels           = labels;
        _chartDisp.data.datasets[0].data = valores;
        _chartDisp.data.datasets[0].backgroundColor = bgColors;
        _chartDisp.update('active');
        return;
    }

    _chartDisp = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Disponibilidade (%)',
                    data: valores,
                    backgroundColor: bgColors,
                    borderRadius: 4,
                    borderWidth: 0
                },
                {
                    // Linha de meta
                    label: `Meta (${META_DISP}%)`,
                    data: new Array(labels.length).fill(META_DISP),
                    type: 'line',
                    borderColor: '#FFB800',
                    borderWidth: 2,
                    borderDash: [6, 3],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: 'var(--text, #F0F0F0)', font: { size: 11 } }
                },
                title: {
                    display: true,
                    text: 'Disponibilidade por Colhedora (%)',
                    color: '#ffffff',
                    font: { size: 13, weight: '700' }
                },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.parsed.x}%` }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: 'var(--text, #F0F0F0)', font: { size: 10 }, callback: v => `${v}%` },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    ticks: { color: '#e0e0e0', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}

function _p(v) {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let s = String(v).trim().replace('%', '');
    if (s.includes(',')) { s = s.replace(/\./g, '').replace(',', '.'); }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// Expõe globalmente
window.GraficoDisponibilidade = { init: initGraficoDisponibilidade, update: updateGraficoDisponibilidade };
