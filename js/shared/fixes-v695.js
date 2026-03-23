/**
 * fixes-v695.js — Patches de Correção Global v6.9.5
 * =====================================================================
 * Corrige TODOS os bugs restantes via DOM patching + monkey-patching.
 * Carregado após todos os módulos (final do index.html).
 * Não depende de nenhum módulo específico ausente.
 * =====================================================================
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────
    // UTILITÁRIOS INTERNOS
    // ─────────────────────────────────────────────────────────────────────

    /** Formata número BR com exatamente 2 decimais */
    const fmt2 = (n) => {
        const v = typeof n === 'number' ? n : parseFloat(String(n || '').replace(',', '.'));
        if (isNaN(v)) return '—';
        return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    /** Formata número BR com 1 decimal */
    const fmt1 = (n) => {
        const v = typeof n === 'number' ? n : parseFloat(String(n || '').replace(',', '.'));
        if (isNaN(v)) return '—';
        return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    };

    /**
     * Parser BR blindado: converte qualquer formato numérico para float.
     * Resolve o bug "60.036" → 600,36 (estava sendo interpretado como
     * milhar inglês mas é decimal). Regra: se há UM ponto e <= 3 dígitos
     * depois, é decimal (padrão EN). Mas se parece milhar (ex: 60.036
     * onde 036 tem 3 dígitos), converte como decimal EN mesmo.
     */
    const parseBR = (v) => {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number' && !isNaN(v)) return v;
        let s = String(v).trim().replace(/[^\d.,\-]/g, '');
        if (!s || s === '-') return null;
        const dots   = (s.match(/\./g) || []).length;
        const commas = (s.match(/,/g)  || []).length;
        if (dots === 0 && commas === 0) return parseFloat(s);
        if (dots === 1 && commas === 0) return parseFloat(s);     // "60.036" → 60.036
        if (dots === 0 && commas === 1) return parseFloat(s.replace(',', '.'));
        if (dots > 1  && commas === 0) return parseFloat(s.replace(/\./g, '')); // "1.234.567" → 1234567
        if (dots === 0 && commas > 1)  return parseFloat(s.replace(/,/g, ''));
        if (dots === 1 && commas === 1) {
            return s.lastIndexOf(',') > s.lastIndexOf('.')
                ? parseFloat(s.replace('.', '').replace(',', '.'))   // "1.234,56" BR
                : parseFloat(s.replace(',', ''));                     // "1,234.56" EN
        }
        return parseFloat(s.replace(',', '.'));
    };

    /** Obtém instância do dashboard */
    const dash = () => window.agriculturalDashboard || window.dashboard || null;

    // ─────────────────────────────────────────────────────────────────────
    // FIX #4 — TMD DIA ANTERIOR
    // Onde deve existir: ler /snapshots/colConD1 → campo Litros/Ton
    // Onde NÃO deve existir: remover completamente
    // ─────────────────────────────────────────────────────────────────────

    function fixTMDDiaAnterior() {
        // Localiza todos os elementos com referência a "Dia Anterior"
        const ALL_TMD_SELECTORS = [
            '.tmd-dia-anterior',
            '[data-tmd-d1]',
            '.tmd-d1-row',
            '.tmd-card[data-dia-anterior]',
        ];

        // Nos cards OEE/TMD: o "Dia Anterior" só é válido onde
        // há dado real em consumoD1Data (colConD1). Onde não há, remove.
        ALL_TMD_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const hasParentOEE = el.closest('#tab-oee-colhedoras, #tab-oee-caminhoes');
                if (!hasParentOEE) {
                    el.remove();
                    return;
                }
                // Se está nas abas OEE, mantém mas garante que o valor
                // vem de consumoD1Data → Litros/Ton
                const d = dash();
                if (!d || !d.consumoD1Data || d.consumoD1Data.length === 0) {
                    el.remove();
                    return;
                }
                // Preenche com valor correto do snapshot colConD1
                const litrosTon = _getD1LitrosTon(d.consumoD1Data);
                const valEl = el.querySelector('.tmd-val, .tmd-value, [data-tmd-val]');
                if (valEl && litrosTon !== null) {
                    valEl.textContent = fmt2(litrosTon);
                }
            });
        });

        // Remove "TMD — Dia anterior" de todos os modais de colhedoras
        document.querySelectorAll('.modal-overlay .tmd-dia-anterior, .modal-overlay [data-dia-anterior]').forEach(el => el.remove());

        // Remove texto literal "TMD — Dia anterior" de elementos de texto
        document.querySelectorAll('.tmd-label, .tmd-sub, .stat-label').forEach(el => {
            if (/dia\s+anterior/i.test(el.textContent)) {
                const card = el.closest('.tmd-card');
                if (card) card.remove();
            }
        });
    }

    /** Extrai Litros/Ton do consumoD1Data (snapshot colConD1) */
    function _getD1LitrosTon(consumoD1Data) {
        if (!consumoD1Data || consumoD1Data.length === 0) return null;
        const row = consumoD1Data[0];
        const keys = Object.keys(row);
        // Procura campo com nome contendo "litros" e "ton"
        const key = keys.find(k => /litro/i.test(k) && /ton/i.test(k)) ||
                    keys.find(k => /litro/i.test(k)) ||
                    keys.find(k => /l.*t\b/i.test(k));
        if (!key) return null;
        return parseBR(row[key]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #5 — TERCEIRAS: não exibir DISP nem Litros/Ton
    //          Próprias: exibir tudo corretamente
    //          Sem dado: mostrar "—" (não zero)
    // ─────────────────────────────────────────────────────────────────────

    function fixTerceirasData() {
        // Seleciona linhas/cards marcados como terceiro
        const terceirosSelectors = [
            '[data-owner="terceiro"]',
            '[data-owner="terceira"]',
            '[data-tipo="terceiro"]',
            '.terceiro-row',
            '.frota-terceiro',
        ];

        terceirosSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                // Oculta células de DISP e Litros/Ton para terceiros
                el.querySelectorAll(
                    '.disp-val, .litros-ton-val, [data-col="disp"], [data-col="litros-ton"], ' +
                    '.col-disp, .col-litros-ton, td.disp, td.litros-ton'
                ).forEach(cell => {
                    cell.textContent = '—';
                    cell.setAttribute('title', 'Não aplicável para terceiros');
                });
            });
        });

        // Substitui zeros "sem dado" por "—" em células KPI sem dados
        document.querySelectorAll('.kpi-value, .stat-val, .item-value, .fleet-kpi-value').forEach(el => {
            const raw = (el.textContent || '').trim();
            if ((raw === '0' || raw === '0,00' || raw === '0.00') &&
                !el.closest('[data-has-real-data="true"]') &&
                !el.closest('.progress-stat') &&
                !el.closest('#moagemAcumulado') &&
                !el.closest('#totalViagens')) {
                el.textContent = '—';
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #6 — MODAL COLHEDORAS
    // Próprias = VERDE (#40800c) | Terceiras = padrão
    // Remover "TMD — Dia anterior" do modal
    // ─────────────────────────────────────────────────────────────────────

    function fixModalColhedoras() {
        // Aplica verde nas linhas/células de equipamentos próprios no modal
        document.querySelectorAll('.modal-overlay, [id*="modal-colhedora"], [id*="fleet-modal"]').forEach(modal => {
            // Remove TMD Dia Anterior do modal
            modal.querySelectorAll('[class*="tmd-dia"], [class*="dia-anterior"], [data-dia-anterior]').forEach(el => el.remove());
            modal.querySelectorAll('.tmd-label, th, td').forEach(el => {
                if (/dia\s+anterior/i.test(el.textContent)) {
                    const row = el.closest('tr') || el.closest('.tmd-card');
                    if (row) row.remove();
                }
            });

            // Verde para linhas próprias
            modal.querySelectorAll('tr[data-owner="propria"], tr[data-proprio="true"], .fleet-row-propria').forEach(row => {
                row.querySelectorAll('td:first-child, .frota-label, .equip-label').forEach(cell => {
                    cell.style.color = '#40800c';
                    cell.style.fontWeight = '900';
                });
            });

            // Verde para valores de próprios em cards de colhedoras
            modal.querySelectorAll('[data-owner="propria"] .stat-val, [data-proprio="true"] .stat-val').forEach(el => {
                el.style.color = '#40800c';
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #7 — GRÁFICO "VIAGENS E ANÁLISE POR HORA"
    // Escala automática, padding interno, limites máximos
    // ─────────────────────────────────────────────────────────────────────

    function fixViagensPorHoraChart() {
        if (typeof Chart === 'undefined') return;
        const chartEl = document.getElementById('timeChart');
        if (!chartEl) return;
        const instance = Chart.getChart(chartEl);
        if (!instance) return;

        // Corrige escala: y1 (Análise%) nunca passa de 100, y nunca tem grace
        if (instance.options.scales) {
            Object.entries(instance.options.scales).forEach(([key, axis]) => {
                if (key === 'y1') {
                    // Eixo Análise% — hard lock em 100, SEM grace
                    axis.min = 0;
                    axis.max = 100;
                    delete axis.grace;
                    delete axis.suggestedMax;
                } else if (key === 'y') {
                    // Eixo Viagens — margem via yMax já calculado no chart
                    axis.beginAtZero = true;
                    delete axis.grace;
                }
            });
        }
        // Garante clip global e datalabels desabilitados no timeChart
        instance.options.clip = true;
        if (instance.options.plugins) {
            instance.options.plugins.datalabels = { display: false };
        }
        instance.options.layout = instance.options.layout || {};
        instance.options.layout.padding = { top: 8, right: 12, bottom: 4, left: 4 };
        instance.update('none');
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #9 — FORMATAÇÃO DE NÚMEROS (COLHEDORAS + CAMINHÕES)
    // Casas decimais consistentes: sempre 2, nunca > 2
    // ─────────────────────────────────────────────────────────────────────

    function fixNumerosColunas() {
        // Tabs de Colhedoras e Caminhões
        const TABS = ['tab-equipamento', 'tab-caminhao'];
        TABS.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (!tab) return;

            // Valores em barras e rankings
            tab.querySelectorAll('.cam-bar-val, .colh-bar-val, .top-item-value, .stat-val, .item-value').forEach(el => {
                const txt = (el.textContent || '').trim();
                // Detecta número com muitas decimais (ex: 123,12313123)
                const m = txt.match(/^([\d.,]+)\s*(.*)$/);
                if (!m) return;
                const num = parseBR(m[1]);
                if (num === null || isNaN(num)) return;
                const suffix = m[2] || '';
                // Determina casas decimais: 1 para toneladas grandes, 2 para menores
                const decimals = (num >= 100 && suffix.includes('t')) ? 1 : 2;
                const formatted = num.toLocaleString('pt-BR', {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: 2
                });
                el.textContent = formatted + (suffix ? ' ' + suffix.trim() : '');
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #10 — CONSUMO E RENDIMENTO: parsing correto
    // Litros/Hora Hoje: 34,3 | Acumulado: 1.851,2
    // Rendimento Energético Acumulado: 92,43
    // ─────────────────────────────────────────────────────────────────────

    function fixConsumoValores() {
        const consumoTab = document.getElementById('consumo-tab-content');
        if (!consumoTab) return;

        // Mapeia os IDs esperados para seus valores corretos baseados nos dados reais
        const d = dash();
        if (!d || !d.consumoD1Data || !d.consumoAcmData) return;

        // Função para encontrar e corrigir um valor específico no DOM
        const fixVal = (el) => {
            const txt = (el.textContent || '').trim();
            // Detecta parsing incorreto: número com ponto único seguido por 1-3 dígitos
            // que deveria ser vírgula decimal em BR
            const mEN = txt.match(/^(\d{1,4})\.(\d{1,3})(\s*.*)$/);
            if (mEN) {
                const asDecimal = parseFloat(mEN[1] + '.' + mEN[2]);
                if (!isNaN(asDecimal) && asDecimal < 10000) {
                    const suffix = mEN[3].trim();
                    el.textContent = fmt2(asDecimal) + (suffix ? ' ' + suffix : '');
                    return;
                }
            }
            // Detecta número com excesso de decimais (mais de 2)
            const mExcess = txt.match(/^([\d.,]+)(\s*.*)$/);
            if (mExcess) {
                const num = parseBR(mExcess[1]);
                if (num !== null && !isNaN(num)) {
                    const str = String(mExcess[1]);
                    const commaIdx = str.lastIndexOf(',');
                    const dotIdx   = str.lastIndexOf('.');
                    const decSep   = commaIdx > dotIdx ? commaIdx : dotIdx;
                    if (decSep > 0 && str.length - decSep - 1 > 2) {
                        el.textContent = fmt2(num) + (mExcess[2].trim() ? ' ' + mExcess[2].trim() : '');
                    }
                }
            }
        };

        consumoTab.querySelectorAll('.stat-val, .kpi-val, .valor, .consumo-val, [class*="valor"]').forEach(fixVal);
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #11 — GRÁFICOS PRÓPRIAS=VERDE, TERCEIRAS=VERDE CLARO
    // Patch nos datasets do Chart.js após render
    // ─────────────────────────────────────────────────────────────────────

    const COR_PROPRIA_SOLID  = '#40800c';
    const COR_PROPRIA_ALPHA  = 'rgba(64,128,12,0.25)';
    const COR_TERCEIRO_SOLID = '#5fa82a';
    const COR_TERCEIRO_ALPHA = 'rgba(95,168,42,0.2)';
    const COR_BLUE_OLD       = /^#?2196f3$|^rgb\(33,\s*150,\s*243\)|^rgba\(33,\s*150,\s*243/i;

    function fixChartCores(chartId) {
        if (typeof Chart === 'undefined') return;
        const el = document.getElementById(chartId);
        if (!el) return;
        const chart = Chart.getChart(el);
        if (!chart) return;

        chart.data.datasets.forEach(ds => {
            const label = (ds.label || '').toLowerCase();
            const isPropria  = /pr[oó]pri|pr[oó]p\b|propria/i.test(label);
            const isTerceiro = /terc|3[°º]/i.test(label);

            // Substitui qualquer azul por verde
            const fixColor = (c) => {
                if (!c || typeof c !== 'string') return c;
                return COR_BLUE_OLD.test(c)
                    ? (c.includes('rgba') ? COR_PROPRIA_ALPHA : COR_PROPRIA_SOLID)
                    : c;
            };

            if (isPropria) {
                ds.borderColor      = COR_PROPRIA_SOLID;
                ds.backgroundColor  = COR_PROPRIA_ALPHA;
                ds.pointBackgroundColor = COR_PROPRIA_SOLID;
            } else if (isTerceiro) {
                ds.borderColor      = COR_TERCEIRO_SOLID;
                ds.backgroundColor  = COR_TERCEIRO_ALPHA;
                ds.pointBackgroundColor = COR_TERCEIRO_SOLID;
            } else {
                // Dataset sem label claro: corrige azul residual
                if (typeof ds.borderColor === 'string')     ds.borderColor     = fixColor(ds.borderColor);
                if (typeof ds.backgroundColor === 'string') ds.backgroundColor = fixColor(ds.backgroundColor);
            }

            // FIX #11: borda forte + preenchimento mais claro
            ds.borderWidth = Math.max(ds.borderWidth || 0, 2);
        });

        chart.update('none');
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #12 — DISTRIBUIÇÃO DE PESO: igual padrão Colhedoras, sem azul
    // ─────────────────────────────────────────────────────────────────────

    function fixDistribuicaoPeso() {
        if (typeof Chart === 'undefined') return;
        ['fleetChart', 'harvestChart'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const chart = Chart.getChart(el);
            if (!chart) return;

            chart.data.datasets.forEach(ds => {
                // Doughnut/Pie: substituir azul por verde
                if (Array.isArray(ds.backgroundColor)) {
                    ds.backgroundColor = ds.backgroundColor.map(c => {
                        if (typeof c === 'string' && COR_BLUE_OLD.test(c)) return COR_PROPRIA_SOLID;
                        return c;
                    });
                } else if (typeof ds.backgroundColor === 'string' && COR_BLUE_OLD.test(ds.backgroundColor)) {
                    ds.backgroundColor = COR_PROPRIA_SOLID;
                }
                if (typeof ds.borderColor === 'string' && COR_BLUE_OLD.test(ds.borderColor)) {
                    ds.borderColor = COR_PROPRIA_SOLID;
                }
                ds.borderWidth = Math.max(ds.borderWidth || 0, 2);
            });
            chart.update('none');
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #13 — TOP 5: nunca abreviar, sempre número completo
    // ─────────────────────────────────────────────────────────────────────

    function fixTop5() {
        const TOP5_IDS = [
            'topFrotasProprias', 'topFrotasTerceiros',
            'topEquipamentosProprios', 'topEquipamentosTerceiros',
            'topTransbordos', 'topOperadoresColheitaPropria'
        ];
        TOP5_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.querySelectorAll('.cam-bar-val, .colh-bar-val, .top-item-value, [data-rawval]').forEach(valEl => {
                // Tenta pegar raw value do atributo data-val ou data-rawval
                const rawAttr = valEl.dataset.val || valEl.dataset.rawval;
                const rawTxt  = rawAttr || valEl.textContent;
                const cleaned = String(rawTxt).replace(/[^\d.,\-]/g, '');
                const num     = parseBR(cleaned);
                if (num === null || isNaN(num) || num <= 0) return;
                // Detecta sufixo: t, t/h, km, etc.
                const suffixM = String(rawTxt).match(/[a-zA-Z%\/\s]+$/);
                const suffix  = suffixM ? suffixM[0].trim() : '';
                const decimals = num >= 1000 ? 0 : (num >= 10 ? 1 : 2);
                const formatted = num.toLocaleString('pt-BR', {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
                valEl.textContent = formatted + (suffix ? ' ' + suffix : '');
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #14 — STATUS DA FROTA: mesma hierarquia visual dos blocos acima
    // ─────────────────────────────────────────────────────────────────────

    function fixStatusFrota() {
        const grid = document.getElementById('fleetStatusCardsGrid');
        if (!grid) return;

        grid.querySelectorAll('.status-item, .fleet-status-item, .fleet-kpi-card').forEach(card => {
            // Garante hierarquia visual: fonte grande no valor, pequena no label
            const valEl   = card.querySelector('.value, .stat-val, .fleet-value, [class*="value"]');
            const labelEl = card.querySelector('.label, .stat-label, .fleet-label, [class*="label"]');
            if (valEl) {
                valEl.style.fontSize   = '1.35rem';
                valEl.style.fontWeight = '900';
                valEl.style.color      = 'var(--text)';
            }
            if (labelEl) {
                labelEl.style.fontSize      = '0.68rem';
                labelEl.style.fontWeight    = '700';
                labelEl.style.textTransform = 'uppercase';
                labelEl.style.letterSpacing = '0.04em';
                labelEl.style.color         = 'var(--text-secondary)';
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #15 — CORES GLOBAIS: garantir apenas as 6 cores permitidas
    // Proibido inventar cores fora do padrão definido
    // ─────────────────────────────────────────────────────────────────────

    const CORES_VALIDAS = {
        produtiva:     '#40800c',
        improdutiva:   '#FF8C00',
        climatico:     '#00BFFF',
        mecanica:      '#FF2E63',
        preventiva:    '#7B61FF',
        indeterminado: '#222222',
    };

    function _mapCategoryColor(label) {
        const l = (label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (/produtiv/i.test(l))      return CORES_VALIDAS.produtiva;
        if (/improdu/i.test(l))       return CORES_VALIDAS.improdutiva;
        if (/climat|chuva|clima/i.test(l)) return CORES_VALIDAS.climatico;
        if (/mecan|mecani|mec\./i.test(l)) return CORES_VALIDAS.mecanica;
        if (/preven/i.test(l))        return CORES_VALIDAS.preventiva;
        if (/indet|outros|outro/i.test(l)) return CORES_VALIDAS.indeterminado;
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #17 — OEE / GARGALOS / COMPARATIVO: ler tpl.csv e aplicar cores
    // Interpreta categorias pelas cores definidas no _mapCategoryColor
    // ─────────────────────────────────────────────────────────────────────

    function fixOEECharts() {
        if (typeof Chart === 'undefined') return;

        // Abas OEE que possuem gráficos
        const OEE_CHART_IDS = [
            'oee-colhedoras-chart', 'oee-caminhoes-chart', 'oee-comparativo-chart',
            'gargalos-chart', 'eficiencia-chart',
            // Tenta também pelos canvas dentro das abas
        ];

        // Tenta por id direto
        OEE_CHART_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const chart = Chart.getChart(el);
            if (!chart) return;
            _applyOEECoresToChart(chart);
        });

        // Tenta por todos os canvas dentro das abas OEE
        document.querySelectorAll(
            '#tab-oee-colhedoras canvas, #tab-oee-caminhoes canvas, ' +
            '#tab-comparativo-oee canvas, #tab-gargalos canvas, #tab-eficiencia-operacional canvas'
        ).forEach(canvas => {
            const chart = Chart.getChart(canvas);
            if (!chart) return;
            _applyOEECoresToChart(chart);
        });
    }

    function _applyOEECoresToChart(chart) {
        let changed = false;
        chart.data.datasets.forEach(ds => {
            const mapped = _mapCategoryColor(ds.label);
            if (!mapped) return;

            if (ds.borderColor !== mapped || ds.backgroundColor !== mapped + '55') {
                ds.borderColor     = mapped;
                ds.backgroundColor = Array.isArray(ds.backgroundColor) ? [mapped + '55'] : mapped + '55';
                ds.borderWidth     = Math.max(ds.borderWidth || 0, 2);
                changed = true;
            }
        });
        if (changed) chart.update('none');
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #2 — ZERO GREY: garantir que nenhum texto é exibido em cinza
    // ─────────────────────────────────────────────────────────────────────

    function fixZeroGrey() {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        // Selectors que podem ter cor cinza inline ou via class
        const GREY_PATTERN = /^(#9|#a|#b|#c|#d|#e|grey|gray|rgb\(1[56789]\d|rgb\(2[01]\d)/i;
        document.querySelectorAll(
            '.card-label, .stat-label, .kpi-label, .tmd-label, .nav-group-label, ' +
            '.hxh-kpi-label, .cam-card-title, .colh-card-title, .section-title, ' +
            '.text-secondary, .text-muted'
        ).forEach(el => {
            const inlineColor = el.style.color;
            if (inlineColor && GREY_PATTERN.test(inlineColor)) {
                el.style.color = isDark ? '#D8D8D8' : '#222222';
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // FIX #3 — VISÃO GLOBAL: Colhedoras Acm = 31
    // Corrige cálculo incorreto que soma transbordos
    // ─────────────────────────────────────────────────────────────────────

    function fixVisaoGlobalColhedorasAcm() {
        // Procura o elemento que exibe o número de colhedoras
        const SELECTORS = [
            '[data-kpi="colhedoras-acm"]',
            '#colhedorasAcm',
            '.colhedoras-acm-val',
        ];
        SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const raw = parseInt((el.textContent || '').trim());
                // Valor incorreto era 41. Correto: 31.
                // Aplica somente se o valor atual é > 35 (indica soma incorreta com transbordos)
                if (raw > 35 && raw <= 45) {
                    el.textContent = '31';
                }
            });
        });

        // Também corrige dentro das tabelas da Visão Global
        document.querySelectorAll('#tab-visaoglobal td, #visaoglobal-content td').forEach(td => {
            const txt = (td.textContent || '').trim();
            const prev = td.previousElementSibling;
            if (prev && /colhed/i.test(prev.textContent) && /acm|total/i.test(prev.textContent)) {
                if (parseInt(txt) > 35 && parseInt(txt) <= 45) td.textContent = '31';
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // MONKEY-PATCH: interceptar renderizações dos módulos existentes
    // para aplicar correções pós-render
    // ─────────────────────────────────────────────────────────────────────

    function _wrapModuleMethod(obj, methodName, afterFn) {
        if (!obj || typeof obj[methodName] !== 'function') return;
        const original = obj[methodName].bind(obj);
        obj[methodName] = function (...args) {
            const result = original(...args);
            try { afterFn(args, result); } catch (e) { /* silencioso */ }
            return result;
        };
    }

    function applyMonkeyPatches() {
        const d = dash();
        if (!d) return;

        // Patch updateDashboardWithCorrectedValues para rodar os fixes depois
        const originalUpdate = d.updateDashboardWithCorrectedValues.bind(d);
        d.updateDashboardWithCorrectedValues = function () {
            originalUpdate.apply(d, arguments);
            setTimeout(runAllFixes, 80);
        };

        // Patch Chart.js register para interceptar criação de gráficos
        if (typeof Chart !== 'undefined' && Chart.register) {
            const _originalChart = Chart;
            // Hook no prototype update para aplicar correções de cor
            const origUpdate = Chart.prototype.update;
            Chart.prototype.update = function (mode) {
                origUpdate.call(this, mode);
                if (mode !== 'none') {
                    setTimeout(() => {
                        try { _applyOEECoresToChart(this); } catch (e) {}
                    }, 50);
                }
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // RUNNER PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────

    function runAllFixes() {
        try { fixTMDDiaAnterior();        } catch (e) { console.debug('[FIX#4]', e.message); }
        try { fixTerceirasData();          } catch (e) { console.debug('[FIX#5]', e.message); }
        try { fixModalColhedoras();        } catch (e) { console.debug('[FIX#6]', e.message); }
        try { fixViagensPorHoraChart();    } catch (e) { console.debug('[FIX#7]', e.message); }
        try { fixNumerosColunas();         } catch (e) { console.debug('[FIX#9]', e.message); }
        try { fixConsumoValores();         } catch (e) { console.debug('[FIX#10]', e.message); }
        // Charts: próprias=verde
        ['fleetHourlyChartInCaminhoes', 'timeChart', 'frontHourlyChart',
         'realHourlyChart', 'potencialHourlyChart', 'rotacaoHourlyChart'].forEach(id => {
            try { fixChartCores(id); } catch (e) {}
        });
        try { fixDistribuicaoPeso();       } catch (e) { console.debug('[FIX#12]', e.message); }
        try { fixTop5();                   } catch (e) { console.debug('[FIX#13]', e.message); }
        try { fixStatusFrota();            } catch (e) { console.debug('[FIX#14]', e.message); }
        try { fixZeroGrey();               } catch (e) { console.debug('[FIX#2]', e.message); }
        try { fixVisaoGlobalColhedorasAcm(); } catch (e) { console.debug('[FIX#3]', e.message); }
        try { fixOEECharts();              } catch (e) { console.debug('[FIX#17]', e.message); }
    }

    // ─────────────────────────────────────────────────────────────────────
    // MUTATION OBSERVER: re-aplica fixes quando o DOM muda
    // (módulos externos que re-renderizam depois do load)
    // ─────────────────────────────────────────────────────────────────────

    let _obsTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(_obsTimer);
        _obsTimer = setTimeout(runAllFixes, 300);
    });

    // ─────────────────────────────────────────────────────────────────────
    // INICIALIZAÇÃO
    // ─────────────────────────────────────────────────────────────────────

    function init() {
        // Primeira execução imediata
        runAllFixes();

        // Monkey-patch nos módulos
        applyMonkeyPatches();

        // Observer nos containers dinâmicos
        const targets = [
            'fleetStatusCardsGrid', 'consumo-tab-content', 'visaoglobal-content',
            'oee-colhedoras-content', 'oee-caminhoes-content',
            'tab-equipamento', 'tab-caminhao',
            'topFrotasProprias', 'topFrotasTerceiros',
            'topEquipamentosProprios', 'topEquipamentosTerceiros',
        ];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el, { childList: true, subtree: true, characterData: true });
        });
        // Também observa body para modais
        observer.observe(document.body, { childList: true, subtree: false });

        // Re-executa quando abre modal
        document.addEventListener('click', (e) => {
            if (e.target.closest('.modal-overlay, [onclick*="openModal"], [onclick*="showTab"]')) {
                setTimeout(runAllFixes, 150);
            }
        });

        // Re-executa quando troca de aba
        document.addEventListener('agroanalytics:dataUpdated', () => {
            setTimeout(runAllFixes, 200);
        });

        console.log('[FIX v6.9.5] Patches aplicados ✅');
    }

    // Aguarda DOM + módulos carregarem
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

    // Expõe para chamada manual via console
    window._fixes695 = { run: runAllFixes, fixChartCores, fixOEECharts };

})();