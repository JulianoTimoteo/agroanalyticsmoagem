// visualizer-charts-moagem.js - VERSÃO FINAL: POTENCIAL AZUL, ROTAÇÃO VERDE ESCURO, META/24 E LINHAS COM BOLINHAS

if (typeof VisualizerChartsMoagem === 'undefined') {
    class VisualizerChartsMoagem {
        
        constructor(visualizer) {
            this.visualizer = visualizer;
            this.baseColors = visualizer.baseColors;
            
            // --- PALETA DE CORES DEFINIDA ---
            this.COLOR_BLUE = '#2196F3';       // Potencial >= Meta (Azul)
            this.COLOR_DARK_GREEN = '#006400'; // Rotação >= Meta (Verde Escuro)
            this.COLOR_AGRO_GREEN = '#40800c'; // Moagem Real >= Meta (Verde Padrão)
            this.COLOR_RED = '#FF2E63';        // Abaixo da Meta (Vermelho)
            this.COLOR_META_LINE = '#FFB800';  // Cor da Linha de Meta (Amarelo/Laranja)
        }

        /**
         * Ordena horas no formato Agrícola (06:00 até 05:00 do dia seguinte)
         */
        _sortAgroHours(labels) {
            return labels.sort((a, b) => {
                const hA = parseInt(a.split(':')[0]);
                const hB = parseInt(b.split(':')[0]);
                
                // Ajusta horas: 00-05 viram 24-29 para ficarem no final da fila
                const adjA = hA < 6 ? hA + 24 : hA;
                const adjB = hB < 6 ? hB + 24 : hB;
                
                return adjA - adjB;
            });
        }

        /**
         * Processa os dados brutos de potencial e rotação por hora
         */
        _processPotentialByHour(potentialData) {
            if (!potentialData || potentialData.length === 0) return { labels: [], potencial: [], rotacao: [] };

            const buckets = {}; 
            
            potentialData.forEach(row => {
                if (!row.HORA && !row.hora) return;
                
                let hourKey = String(row.HORA || row.hora).trim();
                // Garante formato HH:00
                if (!hourKey.includes(':')) hourKey += ':00';
                else hourKey = hourKey.split(':')[0] + ':00';
                
                if (hourKey.length === 4) hourKey = '0' + hourKey;

                if (!buckets[hourKey]) {
                    buckets[hourKey] = { 
                        potencialSum: 0, 
                        rotacaoSum: 0, 
                        count: 0, 
                        rotacaoCount: 0 
                    };
                }
                
                // Soma Potencial
                const pot = parseFloat(row.POTENCIAL || row.CAPACIDADE || row['TONELADAS POTENCIAL'] || 0);
                if (!isNaN(pot) && pot > 0) {
                    buckets[hourKey].potencialSum += pot;
                    buckets[hourKey].count++;
                }

                // Soma Rotação
                const rotKey = Object.keys(row).find(k => k.toUpperCase().includes('ROTACAO') || k.toUpperCase().includes('RPM') || k.toUpperCase().includes('MOENDA'));
                const rot = parseFloat(row[rotKey] || 0);
                
                if (!isNaN(rot) && rot > 0) {
                    buckets[hourKey].rotacaoSum += rot;
                    buckets[hourKey].rotacaoCount++;
                }
            });

            // Ordena pelo turno agrícola
            const labels = this._sortAgroHours(Object.keys(buckets));
            
            const potencial = labels.map(lbl => {
                const b = buckets[lbl];
                return b.count > 0 ? b.potencialSum / b.count : 0;
            });
            
            const rotacao = labels.map(lbl => {
                const b = buckets[lbl];
                return b.rotacaoCount > 0 ? b.rotacaoSum / b.rotacaoCount : 0;
            });

            return { labels, potencial, rotacao };
        }

        /**
         * Lógica de Cores: Compara valor da barra com a meta
         */
        _getColors(data, metaValue, colorAbove, colorBelow) {
            return data.map(val => val >= metaValue ? colorAbove : colorBelow);
        }

        /**
         * 📊 GRÁFICO 1: MOAGEM REAL (t/h)
         * Meta: Dinâmica (vem do arquivo Metas)
         * Cor: Verde Padrão vs Vermelho
         */
        createRealHourlyChart(labels, data, metaDataArray, theme) {
            const ctx = document.getElementById('realHourlyChart');
            if (!ctx) return;

            // FIX: Fallback seguro para evitar erro de .map em undefined
            labels = labels || [];
            data = data || [];
            metaDataArray = metaDataArray || [];

            // Cores baseadas na meta de cada hora
            const barColors = data.map((val, i) => {
                const meta = metaDataArray[i] || 0;
                return val >= meta ? this.COLOR_AGRO_GREEN : this.COLOR_RED;
            });

            if (this.visualizer.charts['realHourlyChart']) {
                this.visualizer.charts['realHourlyChart'].destroy();
            }

            this.visualizer.charts['realHourlyChart'] = new Chart(ctx, {
                type: 'bar',
                plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Meta Dinâmica',
                            data: metaDataArray,
                            type: 'line',
                            borderColor: this.COLOR_META_LINE,
                            backgroundColor: this.COLOR_META_LINE,
                            borderWidth: 2,
                            pointRadius: 4,      // Bolinha
                            pointHoverRadius: 6,
                            borderDash: [5, 5],  // Tracejado
                            order: 0,
                            datalabels: { display: false }
                        },
                        {
                            label: 'Realizado (t)',
                            data: data,
                            backgroundColor: barColors,
                            borderRadius: 4,
                            order: 1,
                            datalabels: {
                                color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF',
                                anchor: 'end',
                                align: 'top',
                                font: { weight: 'bold' },
                                formatter: Math.round
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, labels: { color: theme.fontColor } },
                        tooltip: {
                            callbacks: {
                                label: (c) => {
                                    if (c.dataset.type === 'line') return `Meta: ${Math.round(c.raw)} t`;
                                    const meta = metaDataArray[c.dataIndex] || 0;
                                    const val = Math.round(c.raw);
                                    const diff = val - meta;
                                    const icon = diff >= 0 ? '✅' : '🔻';
                                    return [`Real: ${val} t`, `Meta: ${Math.round(meta)} t`, `Dif: ${diff > 0 ? '+' : ''}${Math.round(diff)} t ${icon}`];
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: theme.gridColor }, ticks: { color: theme.fontColor } },
                        x: { grid: { display: false }, ticks: { color: theme.fontColor } }
                    }
                }
            });
        }

        /**
         * 📊 GRÁFICO 2: POTENCIAL (t/h)
         * Meta: (Moagem Dia / 24)
         * Cor: Azul (>=) vs Vermelho (<)
         */
        createPotencialHourlyChart(labels, data, unusedMetaArray, theme) {
            const ctx = document.getElementById('potencialHourlyChart');
            if (!ctx) return;

            // FIX: Fallback seguro
            labels = labels || [];
            data = data || [];

            // 1. Calcula Meta Fixa: Meta Moagem / 24
            const metaMoagemDia = parseFloat(localStorage.getItem('metaMoagem') || '25000');
            const metaHora = metaMoagemDia / 24;

            // 2. Cores (Azul ou Vermelho)
            const barColors = this._getColors(data, metaHora, this.COLOR_BLUE, this.COLOR_RED);
            
            // 3. Linha de Meta Constante
            const metaLineData = new Array(data.length).fill(metaHora);

            if (this.visualizer.charts['potencialHourlyChart']) {
                this.visualizer.charts['potencialHourlyChart'].destroy();
            }

            this.visualizer.charts['potencialHourlyChart'] = new Chart(ctx, {
                type: 'bar',
                plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: `Meta (${Math.round(metaHora)} t/h)`,
                            data: metaLineData,
                            type: 'line',
                            borderColor: this.COLOR_META_LINE,
                            backgroundColor: this.COLOR_META_LINE,
                            borderWidth: 2,
                            pointRadius: 4,      // Bolinha
                            pointHoverRadius: 6,
                            borderDash: [5, 5],  // Tracejado
                            order: 0,
                            datalabels: { display: false }
                        },
                        {
                            label: 'Potencial (t)',
                            data: data,
                            backgroundColor: barColors,
                            borderRadius: 4,
                            order: 1,
                            datalabels: {
                                color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF',
                                anchor: 'end',
                                align: 'top',
                                formatter: Math.round
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: theme.fontColor } },
                        tooltip: {
                            callbacks: {
                                label: (c) => {
                                    if (c.dataset.type === 'line') return `Meta: ${Math.round(c.raw)} t`;
                                    const val = Math.round(c.raw);
                                    const diff = val - metaHora;
                                    const icon = diff >= 0 ? '✅' : '🔻';
                                    return [`Potencial: ${val} t`, `Meta: ${Math.round(metaHora)} t`, `Dif: ${diff > 0 ? '+' : ''}${Math.round(diff)} t ${icon}`];
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: theme.gridColor }, ticks: { color: theme.fontColor } },
                        x: { grid: { display: false }, ticks: { color: theme.fontColor } }
                    }
                }
            });
        }

        /**
         * 📊 GRÁFICO 3: ROTAÇÃO (RPM)
         * Meta: Meta Rotação (Fixa)
         * Cor: Verde Escuro (>=) vs Vermelho (<)
         */
        createRotacaoHourlyChart(labels, data, theme) {
            const ctx = document.getElementById('rotacaoHourlyChart');
            if (!ctx) return;

            // FIX: Fallback seguro
            labels = labels || [];
            data = data || [];

            // 1. Busca Meta Fixa
            const metaRotacao = parseFloat(localStorage.getItem('metaRotacao') || '1100');
            
            // 2. Cores (Verde Escuro ou Vermelho)
            const barColors = this._getColors(data, metaRotacao, this.COLOR_DARK_GREEN, this.COLOR_RED);
            
            // 3. Linha de Meta Constante
            const metaLineData = new Array(data.length).fill(metaRotacao);

            // Ajuste de escala para não achatar o gráfico
            const minVal = Math.min(...data.filter(v => v > 0), metaRotacao);
            const suggestedMin = minVal > 500 ? minVal - 200 : 0;

            if (this.visualizer.charts['rotacaoHourlyChart']) {
                this.visualizer.charts['rotacaoHourlyChart'].destroy();
            }

            this.visualizer.charts['rotacaoHourlyChart'] = new Chart(ctx, {
                type: 'bar',
                plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: `Meta (${metaRotacao} RPM)`,
                            data: metaLineData,
                            type: 'line',
                            borderColor: this.COLOR_META_LINE,
                            backgroundColor: this.COLOR_META_LINE,
                            borderWidth: 2,
                            pointRadius: 4,      // Bolinha
                            pointHoverRadius: 6,
                            borderDash: [5, 5],  // Tracejado
                            order: 0,
                            datalabels: { display: false }
                        },
                        {
                            label: 'Rotação (RPM)',
                            data: data,
                            backgroundColor: barColors,
                            borderRadius: 4,
                            order: 1,
                            datalabels: {
                                color: () => document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#FFFFFF',
                                anchor: 'end',
                                align: 'top',
                                formatter: Math.round
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: theme.fontColor } },
                        tooltip: {
                            callbacks: {
                                label: (c) => {
                                    if (c.dataset.type === 'line') return `Meta: ${Math.round(c.raw)} RPM`;
                                    const val = Math.round(c.raw);
                                    const diff = val - metaRotacao;
                                    const icon = diff >= 0 ? '✅' : '🔻';
                                    return [`Rotação: ${val} RPM`, `Meta: ${Math.round(metaRotacao)} RPM`, `Dif: ${diff > 0 ? '+' : ''}${Math.round(diff)} RPM ${icon}`];
                                }
                            }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: false, 
                            suggestedMin: suggestedMin,
                            grid: { color: theme.gridColor }, 
                            ticks: { color: theme.fontColor } 
                        },
                        x: { grid: { display: false }, ticks: { color: theme.fontColor } }
                    }
                }
            });
        }
    }

    window.VisualizerChartsMoagem = VisualizerChartsMoagem;
}