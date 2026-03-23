// ============================================================
// js/EntregaHXH/ViagensPorHora.js
// Responsabilidade: Gráfico "Viagens e Análise por Hora"
//   — Usa chartsBaseRenderer.createTimeChart() — estilo v3 original
//   — Linha com gradiente (viagens) + taxa de análise %
// ============================================================

(function () {

    function initViagensPorHora(producaoRows) {
        _render();
    }

    function updateViagensPorHora(producaoRows) {
        _render();
    }

    function _render() {
        const dashboard = window.agriculturalDashboard;
        if (!dashboard) return;

        const visualizer = dashboard.visualizer;
        if (!visualizer || !visualizer.chartsBaseRenderer) return;

        const analysis = dashboard.analysisResult;
        if (!analysis) return;

        const theme = visualizer.getThemeConfig ? visualizer.getThemeConfig() : {};

        // createTimeChart = gráfico de linha viagens + taxa análise % (estilo v3)
        visualizer.chartsBaseRenderer.createTimeChart(analysis.analise24h, theme);
    }

    window.ViagensPorHora = { init: initViagensPorHora, update: updateViagensPorHora };

})();
