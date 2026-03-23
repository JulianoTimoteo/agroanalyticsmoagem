// visualizer-charts-base.js - VERSÃO FINAL: CAMINHÕES LIMPO, ENTREGA HXH DESTAQUE

class VisualizerChartsBase {
    
    constructor(visualizer) {
        this.visualizer = visualizer;
        // Fallback de cores
        this.baseColors = visualizer.baseColors || {
            proprio: '#40800c',
            terceiro: '#FF8C00',
            primary: '#00D4FF',
            text: '#E0E0E0'
        };
    }

    _drawCenterText(chart, text) {
        const ctx = chart.ctx;
        ctx.restore();
        const cx = chart.chartArea ? (chart.chartArea.left + chart.chartArea.right) / 2 : chart.width / 2;
        const cy = chart.chartArea ? (chart.chartArea.top  + chart.chartArea.bottom) / 2 : chart.height / 2;

        // ⚠️ NUNCA ALTERAR: formata o número para exibição limpa no centro do donut
        // Limita a 8 caracteres para não vazar para fora do círculo
        let display = String(text || '');
        // Reformata: se for número grande usa abreviação
        const numMatch = display.match(/^([\d.,]+)/);
        if (numMatch) {
            const n = parseFloat(String(numMatch[1]).replace(/\./g,'').replace(',','.'));
            if (!isNaN(n)) {
                if (n >= 1000000) display = (n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' M t';
                else if (n >= 1000) display = (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' k t';
                else display = n.toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' t';
            }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Line 1: value (bold, larger)
        const valFontSize = Math.min(Math.max(chart.height / 14, 11), 16);
        ctx.font = 'bold ' + valFontSize + 'px "Segoe UI",system-ui,sans-serif';
        ctx.fillStyle = '#00D4FF';
        ctx.fillText(display, cx, cy - valFontSize * 0.5);

        // Line 2: "TOTAL" label (smaller, dimmer)
        const lblFontSize = Math.min(valFontSize * 0.68, 11);
        ctx.font = lblFontSize + 'px "Segoe UI",system-ui,sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText('TOTAL', cx, cy + valFontSize * 0.85);

        ctx.save();
    }
    
    _sortDataAgroTime(labels, datasets) {
        if (!labels || !Array.isArray(labels)) return { labels: [], datasets: [] };

        const getOrder = (timeStr) => {
            if (!timeStr) return 99;
            const str = String(timeStr);
            if (!str.includes(':')) return 99;
            const parts = str.split(':');
            const hour = parseInt(parts[0]);
            if (isNaN(hour)) return 99;
            if (hour >= 6 && hour <= 23) return hour - 6; 
            if (hour >= 0 && hour <= 5) return hour + 18; 
            return 99;
        };

        const combined = labels.map((label, index) => ({
            label,
            originalIndex: index,
            order: getOrder(label)
        }));

        combined.sort((a, b) => a.order - b.order);

        const newLabels = combined.map(c => c.label);
        const safeDatasets = Array.isArray(datasets) ? datasets : [];
        
        const newDatasets = safeDatasets.map(ds => {
            const newData = combined.map(c => ds.data[c.originalIndex]);
            return { ...ds, data: newData };
        });

        return { labels: newLabels, datasets: newDatasets };
    }

    // 1. Gráfico de Rosca (Distribuição)
    createFleetChart(fleetData, config) {
        const canvas = document.getElementById('camDistribuicaoChart') || document.getElementById('fleetChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.visualizer.charts.fleetChart) { try { this.visualizer.charts.fleetChart.destroy(); } catch(e){} }
        
        const propria = Math.round(fleetData?.propria || 0);
        const terceiros = Math.round(fleetData?.terceiros || 0);
        const total = propria + terceiros;
        
        if (total === 0) return;

        const percPropria = Math.round((propria / total) * 100);
        const percTerceiros = Math.round((terceiros / total) * 100);
        
        this.visualizer.charts.fleetChart = new Chart(ctx, {
            type: 'doughnut', 
            data: { 
                labels: [`Própria ${percPropria}%`, `Terceiros ${percTerceiros}%`], 
                datasets: [{ 
                    data: [propria, terceiros], 
                    backgroundColor: [config.proprio || '#40800c', config.terceiro || '#FF8C00'], 
                    borderColor: config.cardColor, 
                    borderWidth: 2, 
                    hoverOffset: 10 
                }] 
            },
            plugins: [{ 
                id: 'centerText', 
                beforeDraw: (chart) => this._drawCenterText(chart, (typeof Utils !== 'undefined' ? Utils.formatNumber(total) : total) + " t") 
            }, ChartDataLabels],
            options: { 
                responsive: true,
                maintainAspectRatio: false, 
                cutout: '65%', 
                layout: { padding: 20 }, 
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: {
                            color: document.documentElement.getAttribute('data-theme') === 'light'
                                ? '#1f2937' : '#F0F0F0',
                            usePointStyle: true,
                            pointStyle: 'rect',
                            pointStyleWidth: 12,
                            padding: 20
                        }
                    }, 
                    datalabels: { 
                        display: (ctx) => (ctx.dataset.data[ctx.dataIndex] / total) > 0.05, 
                        color: '#FFF', 
                        font: { weight: 'bold', size: 14 },
                        textStrokeColor: '#000',
                        textStrokeWidth: 2,
                        formatter: (value) => Math.round((value / total) * 100) + '%'
                    } 
                } 
            }
        });
    }

    createHarvestChart(data, config) {
        const canvas = document.getElementById('harvestChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.visualizer.charts.harvestChart) { try { this.visualizer.charts.harvestChart.destroy(); } catch(e){} }
        if (typeof Chart !== 'undefined') {
            const existingH = Chart.getChart(canvas);
            if (existingH) { try { existingH.destroy(); } catch(e) {} }
        }
        
        const propria = Math.round(data?.propria || 0);
        const terceiros = Math.round(data?.terceiros || 0);
        const total = propria + terceiros;

        if (total === 0) return;

        const percPropria = Math.round((propria / total) * 100);
        const percTerceiros = Math.round((terceiros / total) * 100);

        this.visualizer.charts.harvestChart = new Chart(ctx, {
            type: 'doughnut',
            data: { 
                labels: [`Própria ${percPropria}%`, `Terceiros ${percTerceiros}%`], 
                datasets: [{ 
                    data: [propria, terceiros], 
                    backgroundColor: [config.proprio || '#40800c', config.terceiro || '#FF8C00'], 
                    borderColor: config.cardColor, 
                    borderWidth: 2, 
                    hoverOffset: 10 
                }] 
            },
            plugins: [{ 
                id: 'centerText', 
                beforeDraw: (chart) => this._drawCenterText(chart, (typeof Utils !== 'undefined' ? Utils.formatNumber(total) : total) + " t") 
            }, ChartDataLabels],
            options: { 
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%', 
                layout: { padding: 20 }, 
                plugins: { 
                    legend: { position: 'bottom', labels: { color: config.fontColor, usePointStyle: true, padding: 20 } }, 
                    datalabels: { 
                        display: (ctx) => (ctx.dataset.data[ctx.dataIndex] / total) > 0.05,
                        color: '#FFF', 
                        font: { weight: 'bold', size: 14 },
                        textStrokeColor: '#000',
                        textStrokeWidth: 2,
                        formatter: (value) => Math.round((value / total) * 100) + '%'
                    } 
                } 
            }
        });
    }

    // 2. Gráfico de Entrega Horária (Caminhões - Empilhado)
    // 🔥 CORREÇÃO AQUI: VISUAL LIMPO (SEM NEGRITO, SEM CONTORNO) 🔥
    createFleetHourlyChart(fleetHourlyData, config) {
        const canvas = document.getElementById('fleetHourlyChartInCaminhoes');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.visualizer.charts.fleetHourlyChartInCaminhoes) this.visualizer.charts.fleetHourlyChartInCaminhoes.destroy();

        const safeData = Array.isArray(fleetHourlyData) ? fleetHourlyData : [];
        
        const labels = safeData.map(d => d.time || d.hora); 
        const propColor  = config.proprio  || '#40800c';
        const tercColor  = config.terceiro || '#FF8C00';
        const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
        // No modo claro, escurece levemente verde e laranja para mais ênfase
        const propColorLight = '#2d5c08';
        const tercColorLight = '#c96d00';
        const getPropColor = () => isLight() ? propColorLight : propColor;
        const getTercColor = () => isLight() ? tercColorLight : tercColor;
        const rawDatasets = [
            {
                label: 'Própria',
                data: safeData.map(d => Math.round(d.propria || 0)),
                backgroundColor: isLight() ? propColorLight + '88' : propColor + '55',
                borderColor: isLight() ? propColorLight : propColor,
                borderWidth: 2,
                borderRadius: 3,
                stack: 'delivery',
            },
            {
                label: 'Terceiros',
                data: safeData.map(d => Math.round(d.terceiros || 0)),
                backgroundColor: isLight() ? tercColorLight + '88' : tercColor + '55',
                borderColor: isLight() ? tercColorLight : tercColor,
                borderWidth: 2,
                borderRadius: 3,
                stack: 'delivery',
            }
        ];

        const sorted = this._sortDataAgroTime(labels, rawDatasets);
        const hourlySums = sorted.labels.map((_, i) => sorted.datasets[0].data[i] + sorted.datasets[1].data[i]);

        const totalDataset = {
            label: 'Total',
            data: hourlySums,
            type: 'line',
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointRadius: 0,
            datalabels: {
                display: (ctx) => ctx.parsed && ctx.parsed.y > 0,
                align: 'end', anchor: 'end', offset: 5,
                color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF',
                font: { size: 12 }, // Sem bold
                formatter: (value) => value > 0 ? (typeof Utils !== 'undefined' ? Utils.formatNumber(value).split(',')[0] : value) + ' t' : ''
            }
        };

        this.visualizer.charts.fleetHourlyChartInCaminhoes = new Chart(ctx, {
            type: 'bar',
            data: { labels: sorted.labels, datasets: [...sorted.datasets, totalDataset] },
            plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: config.fontColor }, filter: i => i.text !== 'Total' },
                    datalabels: { 
                        display: (ctx) => ctx.dataset.label !== 'Total' && ctx.dataset.data[ctx.dataIndex] > 0,
                        color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF', 
                        font: { size: 11 }, // Sem bold, visual clean
                        formatter: (value) => Math.round(value)
                    }
                },
                scales: {
                    x: { stacked: true, grid: { color: config.gridColor }, ticks: { color: config.fontColor } },
                    y: { stacked: true, beginAtZero: true, grid: { color: config.gridColor }, ticks: { color: config.fontColor } }
                }
            }
        });
    }

    // 3. Gráfico de Linha (Viagens vs Taxa)
    createTimeChart(hourlyData, config) {
        const canvas = document.getElementById('timeChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.visualizer.charts.timeChart) this.visualizer.charts.timeChart.destroy();

        const safeData = Array.isArray(hourlyData) ? hourlyData : [];
        const rawLabels = safeData.map(d => d.time || d.hora); 
        
        let gradientViagens = config.primary;
        try {
            gradientViagens = ctx.createLinearGradient(0, 0, 0, 400);
            gradientViagens.addColorStop(0, (config.primary || '#00D4FF') + '80'); 
            gradientViagens.addColorStop(1, (config.primary || '#00D4FF') + '10'); 
        } catch (e) { }

        // Pré-calcula o max do eixo Y com margem para pontos nunca saírem do canvas
        const viagensData = safeData.map(d => d.viagens || 0);
        const maxViagens  = Math.max(...viagensData.filter(v => isFinite(v)), 1);
        // 30% de margem: garante que o ponto mais alto fica DENTRO do canvas
        const yMax = Math.ceil(maxViagens * 1.30);

        // FIX OVERFLOW: clamp taxa a [0, 100] ANTES de passar ao dataset.
        // Chart.js com max:100 no eixo ainda desenha a linha entre os pontos
        // atravessando o topo quando o valor raw é > 100 (ex: 127%).
        // O clamp garante que nenhum valor escape a escala.
        const taxaData = safeData.map(d => {
            const v = d.taxa || d.taxaAnalise || 0;
            return Math.min(100, Math.max(0, v)); // hard clamp [0, 100]
        });

        const rawDatasets = [
            { 
                label: 'Viagens', 
                data: viagensData, 
                backgroundColor: gradientViagens, 
                borderColor: config.primary || '#00D4FF', 
                borderWidth: 2,
                fill: true, 
                tension: 0.3,
                yAxisID: 'y',
                pointBackgroundColor: config.bg || '#000', 
                pointBorderColor: config.primary || '#00D4FF',
                pointRadius: 3,
                pointHoverRadius: 5,
                order: 2
            },
            { 
                label: 'Análise %', 
                data: taxaData,  // usa dados já clampados
                borderColor: config.success || '#40800c', 
                backgroundColor: config.success || '#40800c',
                borderWidth: 2,
                fill: false, 
                tension: 0.3,
                spanGaps: false,
                yAxisID: 'y1',
                pointRadius: 3,
                pointHoverRadius: 5,
                order: 1,
                segment: {
                    borderColor: ctx => {
                        if (!ctx.p0.parsed || !ctx.p1.parsed) return config.success;
                        return (ctx.p0.parsed.y < 30 || ctx.p1.parsed.y < 30) ? (config.danger || '#FF2E63') : config.success;
                    },
                    borderDash: ctx => {
                        if (!ctx.p0.parsed || !ctx.p1.parsed) return undefined;
                        return (ctx.p0.parsed.y < 30 || ctx.p1.parsed.y < 30) ? [5, 5] : undefined;
                    }
                },
                pointBackgroundColor: ctx => {
                    const val = ctx.raw;
                    return val < 30 ? (config.danger || '#FF2E63') : config.success;
                },
                pointBorderColor: '#fff'
            }
        ];

        const sorted = this._sortDataAgroTime(rawLabels, rawDatasets);

        // Store real analisadas per hour to use in tooltip
        const analisadasPerHour = sorted.labels.map((_, i) => {
            const origIdx = sorted.labels === rawLabels ? i : 
                rawLabels.indexOf(sorted.labels[i]);
            return safeData[origIdx] ? (safeData[origIdx].analisadas ?? null) : null;
        });

        this.visualizer.charts.timeChart = new Chart(ctx, {
            type: 'line', 
            data: { labels: sorted.labels, datasets: sorted.datasets },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                // CRÍTICO: clip:true impede linhas/pontos de saírem do canvas
                clip: true,
                layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
                interaction: {
                    mode: 'index',     
                    intersect: false,  
                },
                plugins: { 
                    legend: { labels: { color: config.fontColor } }, 
                    // Desabilita datalabels globalmente — eram eles que causavam overflow
                    datalabels: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)', 
                        titleColor: config.primary,
                        bodyFont: { size: 13 },
                        padding: 12,
                        cornerRadius: 8,
                        boxPadding: 6,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const val = context.parsed.y; 
                                if (label === 'Viagens') {
                                    const taxaDataset = context.chart.data.datasets.find(d => d.label === 'Análise %');
                                    const taxa = taxaDataset ? taxaDataset.data[context.dataIndex] : 0;
                                    // Usa analisadasData real se disponível (passou pelo dataset extra)
                                    const analisadasReal = context.chart._analisadasData
                                        ? (context.chart._analisadasData[context.dataIndex] ?? null)
                                        : null;
                                    const analisadasStr = analisadasReal !== null
                                        ? analisadasReal + ' unid.'
                                        : Math.round((val * taxa) / 100) + ' unid.';
                                    return [`🚛 Viagens: ${val}`, `🔍 Analisadas: ~${analisadasStr}`];
                                }
                                if (label === 'Análise %') {
                                    const statusIcon = val < 30 ? '⚠️' : '✅';
                                    return `${statusIcon} Taxa: ${val}%`;
                                }
                                return `${label}: ${val}`;
                            }
                        }
                    }
                }, 
                scales: { 
                    x: { 
                        grid: { color: config.gridColor }, 
                        ticks: { color: config.fontColor, maxRotation: 45 }
                    }, 
                    y: { 
                        beginAtZero: true,
                        min: 0,
                        max: yMax,
                        grid: { color: config.gridColor }, 
                        ticks: { 
                            color: config.fontColor,
                            // Nunca exibe tick além do yMax
                            callback: (v) => v <= yMax ? v : null
                        },
                        title: { display: true, text: 'Viagens', color: config.primary, font: { size: 10 } }
                    }, 
                    y1: { 
                        position: 'right', 
                        min: 0, 
                        max: 100,
                        // suggestedMax garante que Chart nunca extende o eixo além de 100
                        suggestedMax: 100,
                        grid: { drawOnChartArea: false }, 
                        ticks: { color: config.fontColor, callback: v => v + '%' }, 
                        title: { display: true, text: 'Taxa (%)', color: config.success, font: { size: 10 } } 
                    } 
                } 
            }
        });
        // Attach real analisadas data for tooltip use
        if (this.visualizer.charts.timeChart) {
            this.visualizer.charts.timeChart._analisadasData = analisadasPerHour;
        }
    }

    // 4. Gráfico Entrega por Frente - 🔥 MANTIDO ESTILO FORTE (ENTREGA HXH) 🔥
    createFrontHourlyChart(data, config, filterType = 'todas', propriaSet = new Set()) {
        const chartId = 'frontHourlyChart';
        const canvas = document.getElementById(chartId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.visualizer.charts.frontHourlyChart) this.visualizer.charts.frontHourlyChart.destroy();
        
        let labels = data.labels;
        let datasets = data.datasets;

        if (!labels && Array.isArray(data)) {
             labels = data.map(d => d.time || d.hora);
             datasets = []; 
        }

        const sorted = this._sortDataAgroTime(labels || [], datasets || []);
        
        if (sorted.datasets && sorted.datasets.length > 0) {
            sorted.datasets.sort((a, b) => {
                const numA = parseInt(String(a.label).replace(/\D/g, '')) || 0;
                const numB = parseInt(String(b.label).replace(/\D/g, '')) || 0;
                return numA - numB;
            });
        }

        const hourlyTotals = new Array(sorted.labels.length).fill(0);
        
        const colors = [
            '#00D4FF', '#FF2E63', '#00F5A0', '#FFB800', '#7B61FF', 
            '#FF8C00', '#E74C3C', '#3498DB', '#9B59B6', '#1ABC9C', 
            '#F1C40F', '#E67E22', '#2ECC71', '#34495E'
        ];
        
        const finalDatasets = sorted.datasets.map((d, i) => {
            const frenteCode = String(d.label).replace(/\D/g, '');
            const isPropria = propriaSet.has(frenteCode);
            
            let isHidden = false;
            if (filterType === 'propria' && !isPropria) isHidden = true;
            if (filterType === 'terceira' && isPropria) isHidden = true;

            if (!isHidden && d.data) {
                d.data.forEach((v, idx) => hourlyTotals[idx] += (v || 0));
            }

            return { 
                ...d, 
                backgroundColor: colors[i % colors.length] + '90', 
                borderColor: colors[i % colors.length],
                borderWidth: 1,
                stack: 'Stack 0', 
                hidden: isHidden, 
                datalabels: { 
                    display: (ctx) => {
                        if (ctx.dataset.hidden) return false;
                        return ctx.dataset.data[ctx.dataIndex] > 50; 
                    },
                    color: '#FFF',
                    // 🔥 MANTIDO NEGRITO E CONTORNO AQUI (ABA ENTREGA HXH) 🔥
                    font: { size: 10, weight: 'bold' }, 
                    textStrokeColor: '#000',
                    textStrokeWidth: 3, 
                    textShadowBlur: 2,
                    textShadowColor: '#000',
                    formatter: (val) => Math.round(val) 
                } 
            };
        });

        finalDatasets.push({
            label: 'Total', data: hourlyTotals, type: 'line', borderColor: 'transparent', pointRadius: 0,
            datalabels: { 
                display: (ctx) => ctx.parsed && ctx.parsed.y > 0, 
                align: 'end', anchor: 'end', 
                // Lê o tema em runtime para garantir branco no escuro, preto no claro
                color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF',
                font: { weight: 'bold' },
                formatter: (val) => Math.round(val) + ' t'
            }
        });

        this.visualizer.charts.frontHourlyChart = new Chart(ctx, {
            type: 'bar', 
            data: { labels: sorted.labels, datasets: finalDatasets },
            // Passa ChartDataLabels localmente (não está mais registrado globalmente)
            plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
            options: { 
                responsive: true, maintainAspectRatio: false, 
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { 
                            color: config.fontColor, 
                            usePointStyle: true, 
                            padding: 20,
                            generateLabels: (chart) => {
                                const defaults = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                return defaults.map(label => {
                                    if (label.hidden) {
                                        label.textDecoration = 'line-through'; 
                                        label.fontColor = 'rgba(128, 128, 128, 0.5)'; 
                                        label.fillStyle = 'rgba(128, 128, 128, 0.2)'; 
                                        label.strokeStyle = 'rgba(128, 128, 128, 0.2)';
                                    }
                                    return label;
                                });
                            }
                        }, 
                        filter: i => i.text !== 'Total' 
                    },
                    datalabels: { display: true },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        filter: function(tooltipItem) {
                            return !tooltipItem.dataset.hidden;
                        },
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += Math.round(context.parsed.y) + ' t';
                                }
                                return label;
                            }
                        }
                    }
                }, 
                scales: { 
                    x: { stacked: true, grid: { color: config.gridColor }, ticks: { color: config.fontColor } }, 
                    y: { stacked: true, beginAtZero: true, grid: { color: config.gridColor }, ticks: { color: config.fontColor } } 
                } 
            } 
        });
    }
}

if (typeof window !== 'undefined') window.VisualizerChartsBase = VisualizerChartsBase;