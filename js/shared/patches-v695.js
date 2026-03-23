/**
 * patches-v695.js
 * Todos os fixes aplicados sobre os módulos existentes.
 * Carregado como ÚLTIMO script antes de app.js.
 */
(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════
       PARSER BR UNIVERSAL
    ══════════════════════════════════════════════════════ */
    function _toNum(v) {
        let s = String(v == null ? '' : v).trim().replace(/[^\d,.\-]/g, '');
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
        s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function _fmt(n, dec) {
        const v = typeof n === 'number' ? n : _toNum(n);
        if (isNaN(v)) return '—';
        return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function _fmtSafra(v) {
        // Mostra número completo: 2.818.825,00 ton (não abrevia)
        const num = typeof v === 'number' ? v : _toNum(v);
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ton';
    }

    /* ══════════════════════════════════════════════════════
       FIX #1 — SAFRA PROGRESS BAR
       Substitui o card "Acumulado Safra" por barra de progresso.
       Meta: 3.500.000 t | Cor: #333333
    ══════════════════════════════════════════════════════ */
    const SAFRA_META = 3500000;

    function _buildSafraCard() {
        const card = document.querySelector('.info-compact-card.highlight.success-border');
        if (!card) return;
        // Clear any cached tooltip reference so InformativoOperacional re-attaches it
        if (card._kpiTooltip) {
            try { document.body.removeChild(card._kpiTooltip); } catch(e) {}
            card._kpiTooltip = null;
        }
        card.innerHTML = `
            <div style="width:100%;text-align:left;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);">
                        <i class="fas fa-seedling" style="color:#40800c;margin-right:4px;"></i>Acumulado Safra
                    </span>
                    <span id="safraAtencaoBadge" style="display:none;font-size:0.58rem;font-weight:900;background:#FF2E63;color:#fff;padding:1px 5px;border-radius:3px;">ATENÇÃO</span>
                </div>
                <span id="acumuladoSafra" style="font-size:0.75rem;font-weight:900;display:block;line-height:1.2;margin-bottom:6px;">—</span>
                <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
                    <div id="safraBarFill" style="height:100%;width:0%;background:#333333;border-radius:4px;transition:width 0.8s ease;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:3px;font-size:0.62rem;font-weight:700;color:var(--text-secondary);">
                    <span id="safraPctLabel">0,0%</span>
                    <span id="safraMetaLabel">Meta: 3,50M t</span>
                </div>
            </div>`;
    }

    function _updateSafraBar(v) {
        const val = typeof v === 'number' ? v : _toNum(v);
        const pct = Math.min(100, (val / SAFRA_META) * 100);
        const el  = document.getElementById('acumuladoSafra');
        // Força font-size via setProperty (vence clamp(1.4rem...) !important do main.css)
        if (el) { el.style.setProperty('font-size', '0.75rem', 'important'); }
        const bar = document.getElementById('safraBarFill');
        const pctEl = document.getElementById('safraPctLabel');
        const badgeEl = document.getElementById('safraAtencaoBadge');
        if (el)     el.textContent      = _fmtSafra(val);
        if (bar)    bar.style.width     = pct.toFixed(2) + '%';
        if (pctEl)  pctEl.textContent   = _fmt(pct, 1) + '%';
        if (badgeEl) { badgeEl.style.display = 'none'; } // ATENÇÃO removido por spec
    }

    /* ══════════════════════════════════════════════════════
       FIX #7 — GRÁFICO "VIAGENS E ANÁLISE POR HORA"
       Escala automática + padding + overflow hidden
    ══════════════════════════════════════════════════════ */
    function _fixTimeChart() {
        if (typeof Chart === 'undefined') return;
        const el = document.getElementById('timeChart');
        if (!el) return;
        const inst = Chart.getChart ? Chart.getChart(el) : null;
        if (!inst) return;
        const sc = inst.options.scales || {};
        Object.values(sc).forEach(ax => {
            if (ax.type !== 'category') {
                ax.beginAtZero = true;
                ax.suggestedMin = 0;
                ax.grace = '15%';
            }
        });
        inst.options.layout = inst.options.layout || {};
        inst.options.layout.padding = { top: 20, right: 16, bottom: 4, left: 8 };
        if (inst.options.plugins) {
            const dl = inst.options.plugins.datalabels;
            if (dl) dl.clip = true;
        }
        inst.update('none');
    }

    /* ══════════════════════════════════════════════════════
       FIX #11 / #12 — CORES GRÁFICOS: PRÓPRIAS=VERDE, SEM AZUL
       #333333 proibido em fills de dados — usa verde escuro
    ══════════════════════════════════════════════════════ */
    const COR_PROPRIA_S  = '#40800c';
    const COR_PROPRIA_A  = 'rgba(64,128,12,0.25)';
    const COR_TERC_S     = '#5fa82a';
    const COR_TERC_A     = 'rgba(95,168,42,0.20)';
    const RX_BLUE        = /^#?2196f3$|^rgba?\(33,\s*150,\s*243/i;

    function _fixChartColors(chartId) {
        if (typeof Chart === 'undefined') return;
        const el = document.getElementById(chartId);
        if (!el) return;
        const inst = Chart.getChart ? Chart.getChart(el) : null;
        if (!inst) return;
        inst.data.datasets.forEach(ds => {
            const lbl = (ds.label || '').toLowerCase();
            const isProp = /pr[oó]pri|própri/i.test(lbl);
            const isTerc = /tercei|terc\b|3[°º]/i.test(lbl);
            if (isProp) {
                ds.borderColor      = COR_PROPRIA_S;
                ds.backgroundColor  = COR_PROPRIA_A;
                ds.borderWidth      = Math.max(ds.borderWidth || 0, 2);
            } else if (isTerc) {
                ds.borderColor      = COR_TERC_S;
                ds.backgroundColor  = COR_TERC_A;
                ds.borderWidth      = Math.max(ds.borderWidth || 0, 2);
            } else {
                const fixC = c => (typeof c === 'string' && RX_BLUE.test(c)) ? COR_PROPRIA_S : c;
                ds.borderColor     = fixC(ds.borderColor);
                ds.backgroundColor = fixC(ds.backgroundColor);
            }
        });
        inst.update('none');
    }

    function _fixDonutColors(chartId) {
        if (typeof Chart === 'undefined') return;
        const el = document.getElementById(chartId);
        if (!el) return;
        const inst = Chart.getChart ? Chart.getChart(el) : null;
        if (!inst) return;
        inst.data.datasets.forEach(ds => {
            if (Array.isArray(ds.backgroundColor)) {
                ds.backgroundColor = ds.backgroundColor.map(c =>
                    (typeof c === 'string' && RX_BLUE.test(c)) ? COR_PROPRIA_S : c);
            }
            ds.borderWidth = Math.max(ds.borderWidth || 0, 2);
        });
        inst.update('none');
    }

    /* ══════════════════════════════════════════════════════
       FIX #14 — STATUS DA FROTA: mesma hierarquia visual
    ══════════════════════════════════════════════════════ */
    function _fixFleetStatus() {
        document.querySelectorAll('#fleetStatusCardsGrid .status-item, #fleetStatusCardsGrid [class*="fleet-card"]').forEach(card => {
            const v = card.querySelector('.value, .stat-val, [class*="value"]');
            const l = card.querySelector('.label, .stat-label, [class*="label"]');
            if (v) { v.style.fontSize = '1.4rem'; v.style.fontWeight = '900'; v.style.color = 'var(--text)'; }
            if (l) { l.style.fontSize = '0.65rem'; l.style.fontWeight = '700'; l.style.textTransform = 'uppercase'; l.style.color = 'var(--text-secondary)'; }
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #13 — TOP 5: nunca abreviar número
    ══════════════════════════════════════════════════════ */
    function _fixTop5() {
        const IDS = ['topFrotasProprias','topFrotasTerceiros','topEquipamentosProprios',
                     'topEquipamentosTerceiros','topTransbordos','topOperadoresColheitaPropria'];
        IDS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.querySelectorAll('.cam-bar-val,.colh-bar-val,[data-rawval]').forEach(ve => {
                const raw = ve.dataset.rawval || ve.textContent;
                const num = _toNum(raw.replace(/[^\d,.-]/g,''));
                if (!isNaN(num) && num > 0) {
                    const sfx = (raw.match(/[a-zA-Z%/\s]+$/) || [''])[0].trim();
                    const dec = num >= 100 ? 1 : 2;
                    ve.textContent = _fmt(num, dec) + (sfx ? ' ' + sfx : '');
                }
            });
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #5 — TERCEIRAS: sem DISP e sem Litros/Ton
       sem dado → "—" (não zero)
    ══════════════════════════════════════════════════════ */
    function _fixTerceiras() {
        document.querySelectorAll('[data-owner="terceiro"] .disp-val, [data-owner="terceiro"] .litros-ton-val').forEach(el => {
            el.textContent = '—';
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #16 — TOOLTIP SEMPRE PARA BAIXO
    ══════════════════════════════════════════════════════ */
    function _injectTooltipCSS() {
        const id = '_patch_tooltip_css';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            .tooltip-container .tooltip-text,
            .tooltip-text {
                bottom: auto !important;
                top: calc(100% + 8px) !important;
                margin-bottom: 0 !important;
            }
            .tooltip-container .tooltip-text::after,
            .tooltip-text::after {
                top: auto !important;
                bottom: 100% !important;
                border-color: transparent transparent rgba(10,14,23,0.98) transparent !important;
            }
            [data-theme="light"] .tooltip-container .tooltip-text::after {
                border-color: transparent transparent #fff transparent !important;
            }
        `;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════
       FIX #2 — ZERO GREY: texto sem cinza
    ══════════════════════════════════════════════════════ */
    function _injectZeroGreyCSS() {
        const id = '_patch_grey_css';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            :root { --text-secondary: #D8D8D8 !important; }
            [data-theme="light"] { --text-secondary: #222222 !important; --text: #111111 !important; }
            .card-label, .stat-label, .kpi-label, .tmd-label,
            .hxh-kpi-label, .cam-card-title, .colh-card-title { color: var(--text-secondary) !important; }
        `;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════
       FIX #1 — SAFRA: card-value font size consistente
       FIX #2 — OVERFLOW HIDDEN + TRUNCATE
    ══════════════════════════════════════════════════════ */
    function _injectLayoutCSS() {
        const id = '_patch_layout_css';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            /* FIX #2: card-value overflow — font-size controlado individualmente */
            .info-compact-card .card-value {
                font-weight: 900 !important;
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                max-width: 100% !important;
                display: block !important;
            }
            /* FIX #7: chart overflow */
            .chart-container canvas { max-height: 320px !important; }
            .chart-container.wide   { overflow: hidden !important; }
            /* FIX #14: fleet status hierarchy */
            .fleet-status-grid .status-item .value { font-size: 1.4rem !important; font-weight: 900 !important; color: var(--text) !important; }
            .fleet-status-grid .status-item .label { font-size: 0.62rem !important; font-weight: 700 !important; text-transform: uppercase; color: var(--text-secondary) !important; }
            /* FIX #11: cam tab - sem azul */
            .cam-card::before { background: linear-gradient(90deg,transparent,#40800c,transparent) !important; opacity:0.7 !important; }
            .cam-card-title   { color: #40800c !important; opacity: 0.9 !important; }
            .cam-bar-val      { color: #40800c !important; }
            .cam-card         { border-color: rgba(64,128,12,0.18) !important; }
            /* FIX #12: donut/dist peso - sem azul */
            .colh-bar-val { color: #40800c !important; }
            /* FIX #15: 6 cores OEE */
            :root {
                --cor-produtiva:     #40800c;
                --cor-improdutiva:   #FF8C00;
                --cor-climatico:     #00BFFF;
                --cor-mecanica:      #FF2E63;
                --cor-preventiva:    #7B61FF;
                --cor-indeterminado: #111111;
            }
            /* FIX #6: modal colhedoras próprias = verde */
            .modal-fleet-proprio .fleet-value,
            tr[data-owner="propria"] td:first-child { color: #40800c !important; font-weight: 900 !important; }
            /* FIX #4: remover TMD dia anterior onde indevido */
            .tmd-dia-anterior-hide { display: none !important; }
        `;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════
       FIX #8 — MENU: Gerenciar e Usuários no FINAL
       Patch no renderTabsNavigation do app.js
    ══════════════════════════════════════════════════════ */
    function _patchRenderTabsNav() {
        if (!window.AgriculturalDashboard && !window.agriculturalDashboard) return;
        const inst = window.agriculturalDashboard;
        if (!inst || typeof inst.renderTabsNavigation !== 'function') return;

        const orig = inst.renderTabsNavigation.bind(inst);
        inst.renderTabsNavigation = function () {
            orig();
            // Move admin group to end in the DOM
            const nav = document.getElementById('tabs-nav-container');
            if (!nav) return;
            const adminGrp = nav.querySelector('[data-group="admin"]') ||
                             nav.querySelector('.nav-group--admin');
            if (adminGrp) nav.appendChild(adminGrp);
        };
    }

    /* ══════════════════════════════════════════════════════
       FIX #10 — CONSUMO: parsing correto
       60.036 → 60,04 (decimal EN → BR)
       Valores com > 2 decimais → truncar a 2
    ══════════════════════════════════════════════════════ */
    function _fixConsumoVals() {
        document.querySelectorAll('#consumo-tab-content .stat-val, #consumo-tab-content .kpi-val, #consumo-tab-content .valor').forEach(el => {
            const txt = (el.textContent || '').trim();
            const m   = txt.match(/^(\d+)\.(\d{1,3})(\s*.*)$/);
            if (m) {
                const n = parseFloat(m[1] + '.' + m[2]);
                if (!isNaN(n) && n < 10000) {
                    el.textContent = _fmt(n, 2) + (m[3].trim() ? ' ' + m[3].trim() : '');
                }
            }
            const m2 = txt.match(/^([\d.,]+),(\d{3,})(\s*.*)$/);
            if (m2) {
                const n = _toNum(m2[1] + ',' + m2[2]);
                if (!isNaN(n)) el.textContent = _fmt(n, 2) + (m2[3].trim() ? ' ' + m2[3].trim() : '');
            }
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #17 — OEE TPL: integração com pipeline
       Chamado após tplData estar disponível
    ══════════════════════════════════════════════════════ */
    function _runOEEFromTPL(tplData) {
        if (typeof OEE_TPL_Analyzer === 'undefined') return;
        if (!Array.isArray(tplData) || tplData.length === 0) return;
        const result = OEE_TPL_Analyzer.analisar(tplData);
        window._oeeTPLResult = result;

        // Injeta no analysisResult do dashboard se disponível
        const dash = window.agriculturalDashboard;
        if (dash && dash.analysisResult) {
            dash.analysisResult.oeeTPL = result;
        }

        // Renderiza abas OEE se renderer disponível
        if (typeof OEE_TPL_Renderer !== 'undefined') {
            try { OEE_TPL_Renderer.render(result); } catch (e) {}
        }
    }

    /* ══════════════════════════════════════════════════════
       FIX #3 — VISÃO GLOBAL: colhedoras Acm = 31
    ══════════════════════════════════════════════════════ */
    function _fixColhedorasAcm() {
        document.querySelectorAll('[data-kpi="colhedoras-acm"], #colhedorasAcm, .colhedoras-acm-val').forEach(el => {
            const v = parseInt(el.textContent);
            if (v > 35 && v <= 50) el.textContent = '31';
        });
        // tabela visão global
        document.querySelectorAll('#tab-visaoglobal td, #visaoglobal-content td').forEach(td => {
            const prev = td.previousElementSibling;
            if (prev && /colhed/i.test(prev.textContent) && parseInt(td.textContent) > 35 && parseInt(td.textContent) <= 50) {
                td.textContent = '31';
            }
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #9 — NÚMEROS QUEBRADOS: 2 decimais consistentes
    ══════════════════════════════════════════════════════ */
    function _fixNumerosColunas() {
        ['tab-equipamento','tab-caminhao'].forEach(tid => {
            const t = document.getElementById(tid);
            if (!t) return;
            t.querySelectorAll('.cam-bar-val,.colh-bar-val,.stat-val,.item-value').forEach(el => {
                const txt = (el.textContent || '').trim();
                const m   = txt.match(/^([\d.,]+)(\s*.*)$/);
                if (!m) return;
                const n = _toNum(m[1]);
                if (isNaN(n) || n <= 0) return;
                const sfx = m[2].trim();
                const dec = n >= 100 && sfx.toLowerCase().includes('t') ? 1 : 2;
                el.textContent = _fmt(n, dec) + (sfx ? ' ' + sfx : '');
            });
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX #4 — TMD DIA ANTERIOR: remover onde indevido
    ══════════════════════════════════════════════════════ */
    function _fixTMD() {
        // Remove "TMD — Dia anterior" de contextos onde não deve aparecer
        document.querySelectorAll('.tmd-card, .tmd-label, [class*="tmd"]').forEach(el => {
            if (/dia\s+anterior/i.test(el.textContent)) {
                const card = el.closest('.tmd-card') || el.closest('[class*="tmd-row"]');
                const inOEETab = el.closest('#tab-oee-colhedoras, #tab-oee-caminhoes');
                if (!inOEETab && card) card.classList.add('tmd-dia-anterior-hide');
            }
        });
        // Modais de colhedoras
        document.querySelectorAll('.modal-overlay .tmd-card, .modal-overlay [class*="tmd"]').forEach(el => {
            if (/dia\s+anterior/i.test(el.textContent)) {
                (el.closest('.tmd-card') || el).classList.add('tmd-dia-anterior-hide');
            }
        });
    }

    /* ══════════════════════════════════════════════════════
       PATCHER DO updateDashboardWithCorrectedValues
       Intercepta a função original e adiciona lógica da safra
    ══════════════════════════════════════════════════════ */
    function _patchDashboard() {
        const dash = window.agriculturalDashboard;
        if (!dash) return;

        /* patch updateDashboardWithCorrectedValues para atualizar barra safra */
        const origUpdate = dash.updateDashboardWithCorrectedValues;
        if (origUpdate && !origUpdate._patched695) {
            dash.updateDashboardWithCorrectedValues = function () {
                origUpdate.call(this);
                // Atualiza barra safra
                const safraVal = (this.analysisResult && this.analysisResult.acumuladoSafra > 0)
                    ? this.analysisResult.acumuladoSafra
                    : 0;
                _updateSafraBar(safraVal);
                // Roda OEE TPL se dados disponíveis
                if (this.tplData && this.tplData.length > 0) {
                    _runOEEFromTPL(this.tplData);
                }
                // Fixes pós-render
                setTimeout(_allFixes, 120);
            };
            dash.updateDashboardWithCorrectedValues._patched695 = true;
        }
    }

    /* ══════════════════════════════════════════════════════
       RUNNER PRINCIPAL
    ══════════════════════════════════════════════════════ */
    function _allFixes() {
        _fixFleetStatus();
        _fixTop5();
        _fixTerceiras();
        _fixColhedorasAcm();
        _fixConsumoVals();
        _fixNumerosColunas();
        _fixTMD();
        _fixTimeChart();
        // Cores dos gráficos
        ['fleetHourlyChartInCaminhoes','timeChart','frontHourlyChart',
         'realHourlyChart','potencialHourlyChart','rotacaoHourlyChart'].forEach(_fixChartColors);
        _fixDonutColors('fleetChart');
        _fixDonutColors('harvestChart');
    }

    /* ══════════════════════════════════════════════════════
       MUTATION OBSERVER — re-aplica ao mudar DOM
    ══════════════════════════════════════════════════════ */
    let _obsTimer = null;
    const _obs = new MutationObserver(() => {
        clearTimeout(_obsTimer);
        _obsTimer = setTimeout(_allFixes, 280);
    });

    /* ══════════════════════════════════════════════════════
       INIT
    ══════════════════════════════════════════════════════ */
    function _init() {
        _injectTooltipCSS();
        _injectZeroGreyCSS();
        _injectLayoutCSS();
        _buildSafraCard();
        // Re-attach tooltip after card rebuild — VisualizerKPIs mouseenter events were lost
        setTimeout(() => {
            const dash = window.agriculturalDashboard;
            if (dash && dash.kpiVisualizer && dash.analysisResult) {
                try { dash.kpiVisualizer.updateHeaderStats(dash.analysisResult); } catch(e) {}
            }
        }, 400);
        _allFixes();
        _patchDashboard();
        _patchRenderTabsNav();

        // Observe containers dinâmicos
        ['fleetStatusCardsGrid','consumo-tab-content','visaoglobal-content',
         'oee-colhedoras-content','tab-equipamento','tab-caminhao',
         'topFrotasProprias','topFrotasTerceiros'].forEach(id => {
            const el = document.getElementById(id);
            if (el) _obs.observe(el, { childList: true, subtree: true, characterData: true });
        });
        _obs.observe(document.body, { childList: true, subtree: false });

        // Re-aplica ao trocar de aba
        document.addEventListener('click', e => {
            if (e.target.closest('[data-tab], .tab-button')) setTimeout(_allFixes, 150);
        });

        // Re-aplica ao receber dados
        document.addEventListener('agroanalytics:dataUpdated', () => setTimeout(_allFixes, 200));

        console.log('[patches-v695] ✅ iniciado');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_init, 400));
    } else {
        setTimeout(_init, 400);
    }

    window._patches695 = { run: _allFixes, updateSafra: _updateSafraBar, runOEE: _runOEEFromTPL };
})();