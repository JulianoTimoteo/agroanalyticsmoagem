// ============================================================
// js/EntregaHXH/PesoPorFrente.js
// Responsabilidade: Gráfico "Entrega de Peso por Frente"
//   — Usa chartsBaseRenderer.createFrontHourlyChart() — estilo v3 original
//   — Barras empilhadas por frente, cores vibrantes, bold+stroke,
//     filtro própria/terceira, total como linha
// ============================================================

(function () {

    function initPesoPorFrente(producaoRows) {
        _render('todas');
        _registerFilterFrontChart();
    }

    function updatePesoPorFrente(producaoRows) {
        _render('todas');
    }

    // ─────────────────────────────────
    // PRIVADO
    // ─────────────────────────────────

    function _render(filterType) {
        const dashboard = window.agriculturalDashboard;
        if (!dashboard) return;

        const visualizer = dashboard.visualizer;
        if (!visualizer || !visualizer.chartsBaseRenderer) return;

        const analysis = dashboard.analysisResult;
        if (!analysis) return;

        const theme = visualizer.getThemeConfig ? visualizer.getThemeConfig() : {};

        // Obtém dados horários por frente via analyzeFrontHourlyComplete
        const analyzer = dashboard.analyzer;
        let hourlyData = { labels: [], datasets: [] };

        if (analyzer && analyzer.timeModule && analyzer.timeModule.analyzeFrontHourlyComplete) {
            hourlyData = analyzer.timeModule.analyzeFrontHourlyComplete(dashboard.data || []);
        } else if (analysis.analyzeFrontHourly) {
            hourlyData = analysis.analyzeFrontHourly(analysis.data);
        }

        // Monta o Set de frentes próprias (número < 30 = própria, como no v3)
        const propriaSet = new Set();
        (dashboard.data || []).forEach(row => {
            const frenteCode = String(row.frente || '').trim();
            const frenteNum  = parseInt(frenteCode.replace(/\D/g, '')) || 0;
            if (frenteNum > 0 && frenteNum < 30) {
                propriaSet.add(frenteCode);
            }
        });

        // createFrontHourlyChart = barras empilhadas por frente (estilo v3)
        visualizer.chartsBaseRenderer.createFrontHourlyChart(
            hourlyData, theme, filterType || 'todas', propriaSet
        );
    }

    /**
     * Registra window.filterFrontChart para os botões de rádio do HTML
     * (própria / terceira / todas)
     */
    function _registerFilterFrontChart() {
        window.filterFrontChart = function(type) {
            _render(type);
        };
    }

    window.PesoPorFrente = { init: initPesoPorFrente, update: updatePesoPorFrente };

})();
