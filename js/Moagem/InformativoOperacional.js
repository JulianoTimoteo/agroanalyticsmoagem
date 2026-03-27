// visualizer-kpis.js - VERSÃO 5.5 - LABELS SIMPLIFICADOS + BARRA SAFRA + TOOLTIPS

if (typeof VisualizerKPIs === 'undefined') {
    class VisualizerKPIs {

        constructor(visualizer) {
            console.log("🚀 KPI Visualizer v5.5 Iniciado");
            
            if (typeof VisualizerMetas !== 'undefined') {
                this.metasRenderer = new VisualizerMetas(visualizer);
            }

            this.visualizer = visualizer;
            
            this.COLORS = {
                GREEN:  '#40800c',
                RED:    '#FF2E63',
                BLUE:   '#2196F3',
                YELLOW: '#FFB800'
            };

            this.META_SAFRA = parseFloat(localStorage.getItem('metaSafra') || '3500000');

            this._injectStyles();
        }

        _injectStyles() {
            if (document.getElementById('kpi-styles-v55')) return;
            const style = document.createElement('style');
            style.id = 'kpi-styles-v55';
            style.innerHTML = `
                /* ── CARD LAYOUT ── */
                .info-compact-card {
                    position: relative;
                    overflow: visible !important;
                    cursor: help;
                    transition: border-color 0.3s ease;
                }

                /* ── CARD VALUE: word-break apenas, font-size vem do main.css ── */
                .info-compact-card .card-value {
                    font-weight: 900 !important;
                    line-height: 1.1;
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    max-width: 100%;
                    display: block;
                    text-align: center;
                }
                /* Card Safra: só quebra de linha, sem font-size — main.css controla */
                .info-compact-card:first-child .card-value,
                span#acumuladoSafra,
                #acumuladoSafra {
                    white-space: normal !important;
                    word-break: break-word !important;
                    overflow-wrap: break-word !important;
                    line-height: 1.2 !important;
                }

                /* ── CARD LABEL: label abreviado ── */
                .info-compact-card .card-label {
                    font-size: 0.62rem !important;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    line-height: 1.2;
                    color: var(--text-secondary, #D8D8D8);
                    display: block;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100%;
                }

                /* ── VIAGENS STATS: pró/terc ── */
                .viagens-stats {
                    display: flex;
                    gap: 4px;
                    align-items: center;
                    margin-top: 3px;
                    flex-wrap: nowrap;
                }
                .viagens-pro, .viagens-terc {
                    font-size: 0.72rem !important;
                    font-weight: 700;
                }
                .viagens-pro  { color: #40800c; }
                .viagens-terc { color: #FF8C00; }

                /* ── BARRA META SAFRA ── */
                .safra-meta-bar-wrapper { width: 100%; margin-top: 5px; }
                .safra-meta-bar-track {
                    width: 100%; height: 7px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 4px; overflow: hidden;
                }
                [data-theme="light"] .safra-meta-bar-track {
                    background: rgba(0,0,0,0.1);
                }
                .safra-meta-bar-fill {
                    height: 100%; border-radius: 4px;
                    transition: width 0.8s ease, background 0.5s ease;
                }
                @keyframes safraGoldPulse {
                    0%   { box-shadow: 0 0 0px  0px rgba(255,215,0,0.8); }
                    50%  { box-shadow: 0 0 10px 4px rgba(255,215,0,0.5); }
                    100% { box-shadow: 0 0 0px  0px rgba(255,215,0,0.8); }
                }
                .safra-meta-bar-fill.gold-pulse { animation: safraGoldPulse 1.8s ease-in-out infinite; }
                .safra-meta-bar-label {
                    font-size: 0.60rem; margin-top: 3px;
                    display: flex; justify-content: space-between; align-items: center;
                    color: var(--text-secondary, #D8D8D8);
                }

                /* ── TOOLTIP: overflow visible em todos os containers ancestrais ── */
                .info-grid-container {
                    overflow: visible !important;
                }
                .analytics-card, .glass-card {
                    overflow: visible !important;
                }
                /* ── TOOLTIP: SEMPRE PARA BAIXO ── */
                .kpi-tooltip {
                    visibility: hidden;
                    width: 220px;
                    background: rgba(10,14,23,0.98);
                    color: #e0e0e0;
                    text-align: left;
                    border-radius: 8px;
                    padding: 10px 12px;
                    position: absolute;
                    z-index: 99999;
                    top: calc(100% + 6px) !important;
                    bottom: auto !important;
                    left: 50%;
                    transform: translateX(-50%);
                    opacity: 0;
                    transition: opacity 0.15s ease;
                    border: 1px solid rgba(255,255,255,0.15);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
                    font-size: 0.73rem;
                    pointer-events: none;
                    backdrop-filter: blur(8px);
                    /* Garante que não é cortado por nenhum container */
                    clip: unset !important;
                    overflow: visible !important;
                }
                .info-compact-card:hover .kpi-tooltip,
                .info-compact-card:focus-within .kpi-tooltip {
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                /* Seta aponta para CIMA (tooltip está abaixo) */
                .kpi-tooltip::before {
                    content: "";
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    margin-left: -6px;
                    border: 6px solid transparent;
                    border-bottom-color: rgba(10,14,23,0.98);
                }
                .kpi-tooltip-title {
                    font-weight: 800; font-size: 0.78rem;
                    color: #fff;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 5px; margin-bottom: 6px;
                }
                .kpi-tooltip-desc {
                    font-size: 0.73rem; color: #b0b8c8;
                    line-height: 1.5; margin-bottom: 6px;
                }
                .kpi-tooltip-row { margin-bottom: 3px; font-size: 0.73rem; }
                .kpi-status-dot {
                    display: inline-block; width: 8px; height: 8px;
                    border-radius: 50%; margin-right: 4px; vertical-align: middle;
                }

                /* ── MOBILE ── */
                @media (max-width: 768px) {
                    .info-compact-card .card-label { font-size: 0.58rem !important; }
                    .viagens-pro, .viagens-terc   { font-size: 0.65rem !important; }
                }
            `;
            document.head.appendChild(style);
        }

        _safeHTML(text) {
            if (text === null || text === undefined) return '';
            return String(text)
                .replace(/&/g,"&amp;").replace(/</g,"&lt;")
                .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
        }

        _normalizarParaPorcentagem(valor) {
            if (valor === null || valor === undefined || valor === '') return 0;
            let s = String(valor).trim().replace('%','').replace(',','.');
            let n = parseFloat(s);
            if (isNaN(n)) return 0;
            if (n > 0 && n <= 1.1) n = n * 100;
            return n;
        }

        _toNum(v) {
            if (v === null || v === undefined || v === '') return 0;
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            let s = String(v).trim().replace(/[^\d,.-]/g,'');
            if (!s) return 0;
            const dots = (s.match(/\./g)||[]).length;
            if (dots > 1) s = s.replace(/\./g,'');
            s = s.replace(',','.');
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        }

        // ── BARRA SAFRA ──────────────────────────────────────────────────────────
        // Regras de cor:
        //   0   – 33%  → Amarelo  #FFB800
        //   33  – 66%  → Azul     #2196F3
        //   66  – 99%  → Verde    #40800c
        //   > 99%       → Dourado  pulsante
        _renderSaframetaBar(containerId, acumuladoSafra) {
            const container = document.getElementById(containerId);
            if (!container) return;

            const meta        = this.META_SAFRA;
            const pct         = meta > 0 ? (acumuladoSafra / meta) * 100 : 0;
            const pctClamped  = Math.min(pct, 100);

            // Cores: 0-33=amarelo, 33.1-66=azul, 66.1-99=verde, >99=dourado pulsante
            let barColor, pulseClass = '';
            if (pct > 99)       { barColor = 'linear-gradient(90deg,#FFD700,#FFA500)'; pulseClass = 'gold-pulse'; }
            else if (pct > 66)  { barColor = '#40800c'; }
            else if (pct > 33)  { barColor = '#2196F3'; }
            else                { barColor = '#FFB800'; }

            const metaFmt  = meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
            const pctLabel = pct.toFixed(1) + '%';

            container.innerHTML = `
                <div class="safra-meta-bar-wrapper">
                    <div class="safra-meta-bar-track">
                        <div class="safra-meta-bar-fill ${pulseClass}"
                             style="width:${pctClamped}%;background:${barColor};"></div>
                    </div>
                    <div class="safra-meta-bar-label">
                        <span style="font-weight:700;">${pctLabel}</span>
                        <span>Meta: ${metaFmt} t</span>
                    </div>
                </div>`;
        }

        // ── TOOLTIP DESCRIPTIONS ─────────────────────────────────────────────────
        _TOOLTIPS = {
            acumuladoSafra:  { title: 'Acumulado Safra',         desc: 'Total de toneladas processadas desde o início da safra.' }, // desc updated dynamically
            totalViagens:    { title: 'Viagens',                 desc: 'Número total de viagens realizadas no dia agrícola. Pró = frota própria, Terc = terceiros.' },
            taxaAnalise:     { title: 'Análise',                 desc: 'Percentual de cargas analisadas. Calculado como: cargas com SIM ÷ total de cargas.' },
            avgPotencial3h:  { title: 'Potencial',               desc: 'Média do potencial de moagem (t/h) das últimas 3 horas.' },
            avgRotacao3h:    { title: 'Rotação',                 desc: 'Média da rotação da moenda (RPM) das últimas 3 horas.' },
            avgMoagem3h:     { title: 'Moagem',                  desc: 'Média do ritmo de moagem real (t/h) das últimas 3 horas.' },
            dispColhedora:   { title: 'Disponib. Colhedora',     desc: 'Disponibilidade mecânica média das colhedoras nas últimas 3 horas.' },
            dispTransbordo:  { title: 'Disponib. Transbordo',    desc: 'Disponibilidade mecânica média dos transbordos nas últimas 3 horas.' },
            dispCaminhoes:   { title: 'Disponib. Caminhões',     desc: 'Disponibilidade mecânica média dos caminhões nas últimas 3 horas.' },
        };

        // ── UPDATE CARD ──────────────────────────────────────────────────────────
        _updateCard(elementId, options) {
            const el = document.getElementById(elementId);
            if (!el) return;

            const textVal = options.formatter ? options.formatter(options.value) : options.value;
            el.textContent = textVal + (options.unit ? ' ' + options.unit : '');

            el.className = el.className.replace(/text-(danger|warning|success|primary|info|secondary)/g,'');
            el.style.cssText = el.style.cssText.replace(/color[^;]+;/g,'');

            const card = el.closest('.info-compact-card') || el.closest('.analytics-card');
            if (!card) return;

            let colorHex = this.COLORS.BLUE;
            if (options.status === 'success') colorHex = this.COLORS.GREEN;
            else if (options.status === 'warning') colorHex = this.COLORS.YELLOW;
            else if (options.status === 'danger')  colorHex = this.COLORS.RED;

            card.style.borderLeft        = `4px solid ${colorHex}`;
            card.style.backgroundColor   = 'transparent';
            el.style.setProperty('color', colorHex, 'important');

            // Card safra: força font-size 0.62rem para número longo caber
            if (elementId === 'acumuladoSafra') {
                el.style.setProperty('font-size', '0.75rem', 'important');
                el.style.setProperty('white-space', 'normal', 'important');
                el.style.setProperty('word-break', 'break-word', 'important');
                el.style.setProperty('line-height', '1.2', 'important');
            }

            if (options.icon) {
                const icon = card.querySelector('.card-icon');
                if (icon) { icon.className = `${options.icon} card-icon`; icon.style.color = colorHex; }
            }

            this._injectTooltip(card, elementId, options, colorHex);
        }

        _injectTooltip(card, elementId, options, colorHex) {
            // Tooltip via position:fixed + mouseenter/leave
            // Garante que aparece sobre qualquer container com overflow:hidden
            let tooltip = card._kpiTooltip;
            if (!tooltip) {
                tooltip = document.createElement('div');
                // Cores seguem o tema — igual ao resto da página
                const _isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';
                const _ttBg   = () => _isDark() ? 'rgba(10,14,23,0.97)' : 'rgba(255,255,255,0.97)';
                const _ttFg   = () => _isDark() ? '#F0F0F0' : '#111111';
                const _ttBd   = () => _isDark() ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
                tooltip.style.cssText = [
                    'position:fixed', 'z-index:999999', 'width:220px',
                    'border-radius:8px', 'padding:10px 12px',
                    'font-size:0.73rem', 'pointer-events:none',
                    'backdrop-filter:blur(8px)', 'line-height:1.4',
                    'opacity:0', 'visibility:hidden',
                    'transition:opacity 0.15s ease'
                ].join(';');
                // Apply theme colors dynamically on each show
                const _applyTTTheme = () => {
                    tooltip.style.background  = _ttBg();
                    tooltip.style.color       = _ttFg();
                    tooltip.style.border      = '1px solid ' + _ttBd();
                    tooltip.style.boxShadow   = _isDark() ? '0 8px 24px rgba(0,0,0,0.6)' : '0 4px 16px rgba(0,0,0,0.15)';
                };
                document.body.appendChild(tooltip);
                card._kpiTooltip = tooltip;
                card.style.cursor = 'help';

                card.addEventListener('mouseenter', () => {
                    _applyTTTheme();
                    const r = card.getBoundingClientRect();
                    const w = 220;
                    let l = r.left + r.width / 2 - w / 2;
                    l = Math.max(8, Math.min(l, window.innerWidth - w - 8));
                    tooltip.style.left       = l + 'px';
                    tooltip.style.top        = (r.bottom + 8) + 'px';
                    tooltip.style.opacity    = '1';
                    tooltip.style.visibility = 'visible';
                });
                card.addEventListener('mouseleave', () => {
                    tooltip.style.opacity    = '0';
                    tooltip.style.visibility = 'hidden';
                });
            }

            const info = this._TOOLTIPS[elementId] || { title: options.rule || elementId, desc: '' };
            const val  = options.formatter ? options.formatter(options.value) : options.value;
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            const titleBd = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
            const descClr = isDark ? '#b0b8c8' : '#555555';
            tooltip.innerHTML =
                `<div style="font-weight:800;font-size:0.78rem;border-bottom:1px solid ${titleBd};padding-bottom:5px;margin-bottom:6px;">${info.title}</div>` +
                (info.desc ? `<div style="font-size:0.72rem;color:${descClr};line-height:1.5;margin-bottom:6px;">${info.desc}</div>` : '') +
                `<div style="margin-bottom:3px;font-size:0.72rem;"><strong>Valor:</strong> ${val}${options.unit ? ' ' + options.unit : ''}</div>` +
                `<div style="margin-bottom:3px;font-size:0.72rem;"><strong>Meta:</strong> ${options.rule || '—'}</div>` +
                `<div style="font-size:0.72rem;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle;background:${colorHex};"></span>${options.reason || ''}</div>`;
        }

        _setText(id, text) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }

        // ── UPDATE HEADER STATS ──────────────────────────────────────────────────
        updateHeaderStats(analysis) {
            if (!analysis) return;

            const stats3h = this._calculate3HourStats(analysis);

            // 1. ACUMULADO SAFRA
            const acumuladoSafra = this._toNum(analysis.acumuladoSafra || 0);
            // Obtém info de safra do analyzer (se disponível)
            const _safraI = window.agriculturalDashboard && window.agriculturalDashboard.analyzer && window.agriculturalDashboard.analyzer._safraInfo;
            const _safraNome = _safraI ? (_safraI.safraAtual || '25/26') : '25/26';
            const _safraAnt  = _safraI && _safraI.hasSafra2627 && _safraI.total2526 > 0
                ? '  |  Safra 25/26 (encerrada): ' + _safraI.total2526.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' t'
                : '';
            // Atualiza descrição do tooltip dinamicamente
            this._TOOLTIPS.acumuladoSafra.desc = `Safra ${_safraNome} — Total processado desde o início da safra.${_safraAnt}`;
            this._TOOLTIPS.acumuladoSafra.title = `Acumulado Safra ${_safraNome}`;
            this._updateCard('acumuladoSafra', {
                value: acumuladoSafra,
                unit: 'ton',
                formatter: (v) => {
                    const n = typeof v === 'number' ? v : this._toNum(v);
                    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                },
                rule: `Meta: ${this.META_SAFRA.toLocaleString('pt-BR')} t`,
                status: 'neutral',
                reason: acumuladoSafra >= this.META_SAFRA ? 'Meta atingida!' : 'Em progresso',
                icon: 'fas fa-chart-line'
            });
            this._renderSaframetaBar('acumuladoSafraBarContainer', acumuladoSafra);

            // FORÇA fonte mínima inline — sobrescreve qualquer CSS ou JS anterior
            const elSafra = document.getElementById('acumuladoSafra');
            if (elSafra) elSafra.style.setProperty('font-size', '0.75rem', 'important');

            // 2. VIAGENS
            const vProp = analysis.viagensProprias  || 0;
            const vTerc = analysis.viagensTerceiros || 0;
            const totalV = analysis.totalViagens    || 0;
            this._updateCard('totalViagens', {
                value: totalV, unit: '',
                rule: 'Própria > Terceiros',
                status: vProp >= vTerc ? 'success' : 'warning',
                reason: `Própria: ${vProp} | Terc: ${vTerc}`,
                icon: 'fas fa-route'
            });
            this._setText('viagensProprias', vProp);
            this._setText('viagensTerceiros', vTerc);

            // 3. TAXA ANÁLISE
            const taxa = analysis.taxaAnalise || 0;
            const taxaR = Math.round(taxa);
            this._updateCard('taxaAnalise', {
                value: taxa, unit: '%',
                formatter: (v) => Math.round(v),
                rule: 'Meta: 35%',
                status: taxaR >= 35 ? 'success' : taxaR >= 29 ? 'warning' : 'danger',
                reason: taxaR >= 35 ? 'Meta atingida (≥35%)' : taxaR >= 29 ? 'Atenção (29-34%)' : 'Crítico (<29%)',
                icon: 'fas fa-chart-bar'
            });

            // 4. POTENCIAL 3H
            const pot = stats3h.potencial;
            this._updateCard('avgPotencial3h', {
                value: pot, unit: 't/h', formatter: Math.round,
                rule: 'Meta: > 600 t/h',
                status: Math.round(pot) > 600 ? 'success' : 'danger',
                reason: Math.round(pot) > 600 ? 'Acima da meta' : 'Abaixo da meta',
                icon: 'fas fa-bolt'
            });

            // 5. ROTAÇÃO 3H
            const rot = stats3h.rotacao;
            const metaRot = parseFloat(localStorage.getItem('metaRotacao') || '1250');
            this._updateCard('avgRotacao3h', {
                value: rot, unit: 'RPM', formatter: Math.round,
                rule: `Meta: ${metaRot} RPM`,
                status: Math.round(rot) >= metaRot ? 'success' : 'danger',
                reason: Math.round(rot) >= metaRot ? 'Operação ideal' : 'Baixa rotação',
                icon: 'fas fa-cogs'
            });

            // 6. MOAGEM 3H
            const moagem3h = stats3h.moagem;
            const metaHora = parseFloat(localStorage.getItem('metaMoagem') || '18500') / 24;
            const mR = Math.round(moagem3h), mMH = Math.round(metaHora);
            this._updateCard('avgMoagem3h', {
                value: moagem3h, unit: 't/h', formatter: Math.round,
                rule: `Meta: ${mMH} t/h`,
                status: mR >= mMH ? 'success' : mR >= mMH * 0.9 ? 'warning' : 'danger',
                reason: mR >= mMH ? 'Meta horária atingida' : mR >= mMH * 0.9 ? 'Próximo da meta' : 'Abaixo da meta',
                icon: 'fas fa-industry'
            });

            // 7-9. DISPONIBILIDADES
            const dC = this._normalizarParaPorcentagem(stats3h.dispColhedora);
            const dT = this._normalizarParaPorcentagem(stats3h.dispTransbordo);
            const dCam = this._normalizarParaPorcentagem(stats3h.dispCaminhoes);
            this._updateDispCard('dispColhedora',  dC,   90, 'colhedora');
            this._updateDispCard('dispTransbordo', dT,   90, 'transbordo');
            this._updateDispCard('dispCaminhoes',  dCam, 90, 'caminhao');
        }

        _updateDispCard(id, val, meta, type) {
            const r = Math.round(val);
            let status = 'danger', reason = `Crítico (${r}%)`;
            if      (r >= meta)     { status = 'success'; reason = `Excelente (${r}%)`; }
            else if (r >= meta - 5) { status = 'warning'; reason = `Bom (${r}%)`; }
            else if (r >= meta - 10){ status = 'warning'; reason = `Atenção (${r}%)`; }
            this._updateCard(id, {
                value: val, unit: '%', formatter: (v) => Math.round(v),
                rule: `Meta: ${meta}%`, status, reason,
                icon: type === 'caminhao' ? 'fas fa-truck' : type === 'colhedora' ? 'fas fa-tractor' : 'fas fa-exchange-alt'
            });
        }

        _calculate3HourStats(analysis) {
            const now = new Date();
            const h = now.getHours();
            const result = { moagem:0, potencial:0, rotacao:0, dispColhedora:0, dispTransbordo:0, dispCaminhoes:0 };

            const getLast3 = (data) => {
                if (!Array.isArray(data)) return [];
                const res = [];
                for (let i = 1; i <= 3; i++) {
                    const tH = (h - i + 24) % 24;
                    const found = data.find(d => {
                        const dh = d.hora !== undefined ? d.hora : (d.time ? parseInt(d.time.split(':')[0]) : -1);
                        return dh === tH;
                    });
                    if (found) res.push(found);
                }
                return res;
            };

            const moagemData = getLast3(analysis.analise24h);
            if (moagemData.length > 0)
                result.moagem = moagemData.reduce((a,c) => a + (c.peso||0), 0) / moagemData.length;

            const potData = getLast3(analysis.potentialData);
            if (potData.length > 0) {
                const get = (r,k) => {
                    const aliases = [k, k.toUpperCase(), k.toLowerCase(),
                        k.replace('Caminhoes','CAMINHÕES'), k.replace('Caminhoes','Caminhões')];
                    for (const a of aliases) {
                        if (r[a] !== undefined && r[a] !== null && r[a] !== '') return r[a];
                        if (r.raw && r.raw[a] !== undefined) return r.raw[a];
                    }
                    return 0;
                };
                const avg = (arr) => { const v = arr.filter(x => !isNaN(x) && x > 0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; };
                result.dispColhedora  = avg(potData.map(r => this._normalizarParaPorcentagem(get(r,'dispColhedora'))));
                result.dispTransbordo = avg(potData.map(r => this._normalizarParaPorcentagem(get(r,'dispTransbordo'))));
                result.dispCaminhoes  = avg(potData.map(r => this._normalizarParaPorcentagem(get(r,'dispCaminhoes'))));
                result.potencial      = avg(potData.map(r => parseFloat(r.potencial||0)));
                result.rotacao        = avg(potData.map(r => parseFloat(r.rotacao||0)));
            }
            return result;
        }

        // ── TOP LISTS / OWNER DISTRIBUTION (inalterados) ────────────────────────
        updateTopLists(analysis) {
            if (!analysis) return;
            this._populateRankingSimplified('topFrotasProprias',          analysis.topFrotasProprias,          'toneladas', true, analysis.data);
            this._populateRankingSimplified('topFrotasTerceiros',         analysis.topFrotasTerceiros,         'toneladas', true, analysis.data);
            this._populateRankingSimplified('topEquipamentosProprios',    analysis.topEquipamentosProprios,    'toneladas', false, analysis.data);
            this._populateRankingSimplified('topEquipamentosTerceiros',   analysis.topEquipamentosTerceiros,   'toneladas', false, analysis.data);
            this._populateRankingSimplified('topTransbordos',             analysis.topTransbordos,             'toneladas', false, analysis.data);
            this._populateOperadores('topOperadoresColheitaPropria', analysis.topOperadoresColheitaPropria);
            if (this.metasRenderer && analysis.metaData) this.metasRenderer.updateMetasGrid(analysis.metaData);
        }

        _populateRankingSimplified(id, data, unitLabel, showDensity=false, rawData=[]) {
            const list = document.getElementById(id);
            if (!list) return;
            list.innerHTML = '';
            if (!data || data.length === 0) { list.innerHTML = `<div class="top-list-item" style="justify-content:center;padding:12px;">Sem dados.</div>`; return; }
            data.forEach((item, i) => {
                const li = document.createElement('li');
                const rankColor = i === 0 ? 'var(--warning)' : 'var(--secondary)';
                li.className = 'top-list-item';
                li.style.borderLeft = `4px solid ${rankColor}`;
                const peso = item.value || item.peso || 0;
                const safeCodigo = this._safeHTML(item.name || item.codigo);
                let secondaryHTML = '';
                if (showDensity) {
                    let km = parseFloat(item.distMedia || item.distancia || 0);
                    if (km === 0 && rawData?.length) {
                        const code = String(safeCodigo).split(/[\s-]/)[0].trim();
                        const matches = rawData.filter(r => String(r.frota||'').split(/[\s-]/)[0].trim()===code || String(r.equipamento||'').split(/[\s-]/)[0].trim()===code);
                        if (matches.length) km = matches.reduce((s,r)=>s+(parseFloat(r.distancia||r.raio||0)||0),0)/matches.length;
                    }
                    secondaryHTML = `<span style="font-size:0.8em;font-weight:600;color:var(--text-secondary);">Dist.: ${km.toFixed(1)} km</span>`;
                } else if (item.frente) {
                    secondaryHTML = `<span style="font-size:0.8em;font-weight:500;color:var(--text-secondary);">Fr. ${this._safeHTML(item.frente)}</span>`;
                }
                const pesoFmt = typeof Utils!=='undefined' ? Utils.formatWeight(peso) : peso.toLocaleString();
                li.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:flex-start;min-width:0;position:relative;">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;border-bottom:1px dashed rgba(255,255,255,.2);"
                              title="${safeCodigo}">${i+1}º ${safeCodigo}</span>
                        ${secondaryHTML}
                    </div>
                    <span style="flex-shrink:0;font-size:0.9em;color:var(--primary);font-weight:700;white-space:nowrap;">
                        ${pesoFmt} t
                    </span>`;
                list.appendChild(li);
            });
        }

        _populateOperadores(id, data) {
            const list = document.getElementById(id);
            if (!list) return;
            list.innerHTML = '';
            list.style.maxHeight = '350px'; list.style.overflowY = 'auto';
            if (!data || data.length === 0) { list.innerHTML = `<div class="top-list-item" style="justify-content:center;">Sem dados.</div>`; return; }
            data.forEach((item, i) => {
                const li = document.createElement('li');
                li.className = 'top-list-item';
                const peso = item.value || item.peso || 0;
                const displayOp = this._safeHTML(item.name||item.codigo);
                li.innerHTML = `
                    <div style="display:flex;flex-direction:column;min-width:0;">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;border-bottom:1px dashed rgba(255,255,255,.2);"
                              title="${displayOp}">${i+1}º ${displayOp}</span>
                        <span style="font-size:0.8em;color:var(--text-secondary);">Frente: ${this._safeHTML(item.frente||'N/A')}</span>
                    </div>
                    <span style="flex-shrink:0;font-weight:700;color:var(--primary);">
                        ${typeof Utils!=='undefined' ? Utils.formatWeight(peso) : peso.toLocaleString()} t
                    </span>`;
                list.appendChild(li);
            });
        }

        updateOwnerDistributionBar(analysis) {
            let data = analysis.ownerTypeData || {};
            if (!data.total || data.total === 0) {
                const d = analysis.distribuicaoFrota || { propria:0, terceiros:0 };
                const t = d.propria + d.terceiros;
                if (t > 0) data = { propria:d.propria, fornecedor:d.terceiros, total:t, propriaPercent:(d.propria/t)*100, fornecedorPercent:(d.terceiros/t)*100 };
            }
            const forecastValue = (analysis.projecaoMoagem?.forecast) || 0;
            const metaDiaria    = parseFloat(localStorage.getItem('metaMoagem') || '18500');
            const diff = forecastValue - metaDiaria;
            const isAbove = diff >= 0;
            const activeColor = isAbove ? this.COLORS.GREEN : this.COLORS.RED;

            const elFV = document.getElementById('moagemForecast');
            if (elFV) { elFV.textContent = (typeof Utils!=='undefined' ? Utils.formatNumber(forecastValue) : forecastValue.toLocaleString()) + ' t'; elFV.style.color = activeColor; }

            const elDiff = document.getElementById('forecastDifferenceContainer');
            if (elDiff) elDiff.style.display = 'none';

            const elBadge = document.getElementById('moagemStatus');
            if (elBadge) {
                elBadge.className = isAbove ? 'forecast-badge active' : 'forecast-badge danger';
                elBadge.style.cssText = `background:${isAbove?'rgba(64,128,12,0.1)':'rgba(255,46,99,0.1)'};color:${activeColor};border:1px solid ${activeColor};`;
                elBadge.textContent = isAbove ? 'Bater a meta' : 'Abaixo da meta';
            }

            const container = document.getElementById('ownerDistributionBarContainer');
            if (!container || !data.total) return;
            container.innerHTML = `
                <div class="owner-distribution-labels">
                    <span style="color:var(--proprio-color);">${(data.propriaPercent||0).toFixed(1)}% (${typeof Utils!=='undefined'?Utils.formatNumber(data.propria||0):(data.propria||0).toLocaleString()} t)</span>
                    <span style="color:var(--terceiro-color);">(${typeof Utils!=='undefined'?Utils.formatNumber(data.fornecedor||0):(data.fornecedor||0).toLocaleString()} t) ${(data.fornecedorPercent||0).toFixed(1)}%</span>
                </div>
                <div class="owner-distribution-bar">
                    <div class="owner-segment propria"    style="width:${data.propriaPercent||0}%;">${(data.propriaPercent||0)>10?'PRÓPRIA':''}</div>
                    <div class="owner-segment fornecedor" style="width:${data.fornecedorPercent||0}%;">${(data.fornecedorPercent||0)>10?'FORNECEDOR':''}</div>
                </div>`;
        }
    }

    window.VisualizerKPIs = VisualizerKPIs;
}