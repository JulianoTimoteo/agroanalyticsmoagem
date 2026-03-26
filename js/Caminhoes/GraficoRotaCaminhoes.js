// ============================================================
// js/Caminhoes/GraficoRotaCaminhoes.js
// Responsabilidade: Gráfico de distribuição de caminhões por etapa
//   (Ida, Campo, Volta, Descarga, Fila Externa)
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (chama init/update com analysisResult)
// Interage com: RankingCaminhoes.js (mesma aba, dados do mesmo fleetStatus)
// Se alterar nomes de etapas no HTML/CSS, revisar aqui
// ============================================================

let _chartRota = null;

/**
 * Inicializa o gráfico de distribuição por etapa.
 * @param {Object} analysisResult
 */
function initGraficoRotaCaminhoes(analysisResult) {
    updateGraficoRotaCaminhoes(analysisResult);
}

/**
 * Atualiza o gráfico com novos dados.
 * @param {Object} analysisResult
 */
function updateGraficoRotaCaminhoes(analysisResult) {
    if (!analysisResult) return;

    const fleet = analysisResult.fleetStatus || analysisResult.statusFrota || {};

    const etapas = [
        { label: 'Ida',          valor: _n(fleet.ida       || fleet.emIda       || 0), color: '#2196F3' },
        { label: 'Campo',        valor: _n(fleet.campo     || fleet.emCampo     || 0), color: '#40800c' },
        { label: 'Volta',        valor: _n(fleet.volta     || fleet.emVolta     || 0), color: '#6abf2e' },
        { label: 'Descarga',     valor: _n(fleet.descarga  || fleet.emDescarga  || 0), color: '#FFB800' },
        { label: 'Fila Externa', valor: _n(fleet.filaExterna || fleet.fila      || 0), color: '#FF2E63' }
    ];

    _renderDoughnut(etapas);
    _renderBarras(etapas);
}

// ─────────────────────────────────
// PRIVADO
// ─────────────────────────────────

function _renderDoughnut(etapas) {
    // Route status donut removed — fleetChart now shows prop/terc weight distribution
    // rendered by VisaoHorariaDetalhada_charts.js createFleetChart()
    return;
    const canvasId = 'camDistribuicaoChart'; // route status donut uses cam tab canvas
    const canvas   = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = etapas.map(e => e.label);
    const dados  = etapas.map(e => e.valor);
    const colors = etapas.map(e => e.color);

    // Always destroy and recreate to avoid canvas already in use error
    if (_chartRota) {
        try { _chartRota.destroy(); } catch(e) {}
        _chartRota = null;
    }
    // Check if the base visualizer already created a chart on this canvas
    // If so, destroy that too via Chart.js registry
    if (typeof Chart !== 'undefined') {
        const existing = Chart.getChart(canvas);
        if (existing) { try { existing.destroy(); } catch(e) {} }
    }

    const total = dados.reduce((s, v) => s + v, 0);
    _chartRota = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data:            dados,
                backgroundColor: colors.map(c => c + 'cc'),
                borderColor:     colors.map(c => c),
                borderWidth:     2,
                hoverOffset:     8,
                // Remove dark outline between slices
                spacing:         0
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
                        color: document.documentElement.getAttribute('data-theme') === 'light'
                            ? '#1f2937' : '#F0F0F0',
                        font: { size: 11, weight: '700' },
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'rect',
                        pointStyleWidth: 12,
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} caminhões (${total > 0 ? ((ctx.parsed/total)*100).toFixed(1) : 0}%)`
                    }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw(chart) {
                const { ctx: c, chartArea: { width, height, left, top } } = chart;
                c.save();
                const x = left + width/2, y = top + height/2;
                c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillStyle = document.documentElement.getAttribute('data-theme') === 'light' ? '#40800c' : '#6abf3a';
                c.font = 'bold 14px "Segoe UI"';
                c.fillText(total + ' cam.', x, y - 8);
                c.fillStyle = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)';
                c.font = '11px "Segoe UI"';
                c.fillText('EM ROTA', x, y + 10);
                c.restore();
            }
        }]
    });
}

function _renderBarras(etapas) {
    // Atualiza barras visuais simples (elementos HTML, sem Chart.js)
    etapas.forEach(({ label, valor, color }) => {
        const barId = `etapaBar${label.replace(/\s/g, '')}`;
        const bar   = document.getElementById(barId);
        if (!bar) return;
        const total = etapas.reduce((s, e) => s + e.valor, 0);
        const pct   = total > 0 ? (valor / total) * 100 : 0;
        bar.style.width      = `${pct}%`;
        bar.style.background = color;
        bar.title            = `${label}: ${valor} caminhões (${pct.toFixed(1)}%)`;
    });
}

function _n(v) { return parseInt(v) || 0; }

// Expõe globalmente
window.GraficoRotaCaminhoes = { init: initGraficoRotaCaminhoes, update: updateGraficoRotaCaminhoes };