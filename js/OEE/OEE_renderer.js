// visualizer-oee.js
// ============================================================
// RENDERIZADOR DAS ABAS OEE/TMD
// Responsabilidade: apenas apresentação. Não faz cálculo.
// ============================================================

if (typeof VisualizerOEE === 'undefined') {

    class VisualizerOEE {

        constructor(visualizer) {
            this.visualizer = visualizer;
            this.baseColors = visualizer.baseColors;
            this.charts = visualizer.charts;
        }

        // ── FORMATAÇÃO ───────────────────────────────────────────

        _pct(val, decimals = 1) {
            if (val == null || isNaN(val)) return '<span class="proxy-badge">N/D</span>';
            const p = (val * 100).toFixed(decimals);
            return `${p}%`;
        }

        _ton(val) {
            if (val == null || isNaN(val)) return '—';
            return val.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' t';
        }

        _tmd(val) {
            if (val == null || isNaN(val)) return '—';
            return val.toFixed(0) + ' t/maq/dia';
        }

        _h(val) {
            if (val == null || isNaN(val)) return '—';
            return val.toFixed(1) + ' h';
        }

        _semaforo(oee) {
            if (oee == null) return 'sem-dado';
            if (oee >= 0.65) return 'success';
            if (oee >= 0.45) return 'warning';
            return 'danger';
        }

        _proxyBadge(isProxy) {
            return isProxy ? '<span class="proxy-badge" title="Valor estimado por proxy — sem dado real">⚠ PROXY</span>' : '';
        }

        _catLabel(cat) {
            return {
                colh_propria:  'Colhedoras Próprias',
                colh_terceira: 'Colhedoras Terceiras',
                cam_proprio:   'Caminhões Próprios',
                cam_terceiro:  'Caminhões Terceiros'
            }[cat] || cat;
        }

        _catColor(cat) {
            return {
                colh_propria:  '#40800c',
                colh_terceira: '#FF8C00',
                cam_proprio:   '#00D4FF',
                cam_terceiro:  '#7B61FF'
            }[cat] || '#888';
        }

        // ── KPI CARDS ────────────────────────────────────────────

        _renderKPICard(title, value, subtitle, colorClass, badge = '') {
            return `
            <div class="kpi-card glass-card">
                <div class="kpi-header">
                    <span class="kpi-title">${title}${badge}</span>
                </div>
                <div class="kpi-value ${colorClass}">${value}</div>
                <div class="kpi-subtitle">${subtitle || ''}</div>
            </div>`;
        }

        _renderOEETriple(oeeResult, label) {
            const sem = this._semaforo(oeeResult?.oeeOperacional);
            const oeeStr = oeeResult?.oeeOperacional != null
                ? `<span class="oee-value oee-${sem}">${this._pct(oeeResult.oeeOperacional)}</span>`
                : '<span class="proxy-badge">N/D</span>';

            return `
            <div class="oee-triple-card glass-card">
                <div class="oee-triple-header">${label}</div>
                <div class="oee-main-value">${oeeStr}</div>
                <div class="oee-triple-grid">
                    <div class="oee-component">
                        <span class="oee-comp-label">Disponibilidade</span>
                        <span class="oee-comp-val">${this._pct(oeeResult?.disponibilidade)}${this._proxyBadge(oeeResult?.dispIsProxy)}</span>
                    </div>
                    <div class="oee-component">
                        <span class="oee-comp-label">Performance</span>
                        <span class="oee-comp-val">${this._pct(oeeResult?.performance)}${this._proxyBadge(!oeeResult?.performance)}</span>
                    </div>
                    <div class="oee-component">
                        <span class="oee-comp-label">Qualidade</span>
                        <span class="oee-comp-val">${this._pct(oeeResult?.qualidade || 1)} <span class="proxy-badge" title="${oeeResult?.qualNota || ''}">PROXY</span></span>
                    </div>
                </div>
                <div class="oee-nota">Tipo: ${oeeResult?.tipo || 'OEE Operacional'} · ${oeeResult?.nEquip || 0} equip. com dados</div>
            </div>`;
        }

        // ── RANKING TABLE ────────────────────────────────────────

        _renderRankingTable(ranking, cat, maxRows = 20) {
            if (!ranking || ranking.length === 0) {
                return `<div class="empty-state">Sem dados para esta categoria.</div>`;
            }

            const isColh = cat.startsWith('colh');
            const color  = this._catColor(cat);

            const rows = ranking.slice(0, maxRows).map(item => {
                const sem = this._semaforo(item.oeeOperacional);
                const oeeStr = item.oeeOperacional != null
                    ? `<span class="badge-oee badge-${sem}">${this._pct(item.oeeOperacional)}</span>`
                    : '<span class="proxy-badge">S/TPL</span>';
                const dispStr = item.disponibilidade != null
                    ? this._pct(item.disponibilidade) + (item.dispIsProxy ? '⚠' : '')
                    : '—';
                const perfStr = item.performance != null ? this._pct(item.performance) : '—';
                const causa = item.topOps && item.topOps[0] ? item.topOps[0].desc : '—';

                return `
                <tr>
                    <td><strong style="color:${color}">${item.rank}°</strong></td>
                    <td><strong>${item.id}</strong></td>
                    <td>${this._ton(item.ton)}</td>
                    <td>${this._tmd(item.tmdReal)}</td>
                    <td>${dispStr}</td>
                    <td>${perfStr}</td>
                    <td>${oeeStr}</td>
                    <td class="td-causa" title="${causa}">${causa.length > 28 ? causa.slice(0,28)+'…' : causa}</td>
                </tr>`;
            }).join('');

            const colhedoraExtra = isColh ? '' :
                `<th>Viagens</th>`;

            return `
            <div class="table-responsive-oee">
                <table class="oee-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Equip.</th>
                            <th>Total (t)</th>
                            <th>TMD Real</th>
                            <th>Disp.</th>
                            <th>Perf.</th>
                            <th>OEE Op.</th>
                            <th>Principal Perda</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        // ── TMD CARDS ────────────────────────────────────────────

        _renderTMDCards(tmdGroup, tmdPot, cat) {
            const color = this._catColor(cat);
            const gap = tmdPot ? (tmdPot.tmdPotencialTecnico - tmdGroup.tmdReal) : 0;
            const gapColor = gap > 0 ? 'var(--warning)' : 'var(--success)';

            return `
            <div class="tmd-cards-row">
                <div class="tmd-card" style="border-left: 4px solid ${color}">
                    <span class="tmd-label">TMD Real</span>
                    <span class="tmd-val">${this._tmd(tmdGroup.tmdReal)}</span>
                    <span class="tmd-sub">${this._ton(tmdGroup.ton)} · ${tmdGroup.nEquip} máq · ${tmdGroup.nDias} dias</span>
                    <span class="tmd-formula" title="${tmdGroup.formula}">ℹ Fórmula</span>
                </div>
                <div class="tmd-card" style="border-left: 4px solid var(--warning)">
                    <span class="tmd-label">TMD Potencial (p90)</span>
                    <span class="tmd-val">${this._tmd(tmdPot?.tmdPotencialTecnico)}</span>
                    <span class="tmd-sub">Benchmark interno do grupo</span>
                </div>
                <div class="tmd-card" style="border-left: 4px solid var(--primary)">
                    <span class="tmd-label">TMD Ajustado OEE</span>
                    <span class="tmd-val">${this._tmd(tmdPot?.tmdAjustadoOEE)}</span>
                    <span class="tmd-sub">${tmdPot?.formula || '—'}</span>
                </div>
                <div class="tmd-card" style="border-left: 4px solid ${gapColor}">
                    <span class="tmd-label">Gap para Benchmark</span>
                    <span class="tmd-val" style="color:${gapColor}">${gap >= 0 ? '+' : ''}${this._tmd(gap)}</span>
                    <span class="tmd-sub">por máquina por dia</span>
                </div>
            </div>`;
        }

        // ── ABA OEE COLHEDORAS ───────────────────────────────────

        renderAbaOEEColhedoras(oeeAnalysis) {
            const container = document.getElementById('tab-oee-colhedoras');
            if (!container) return;

            const { oeeGroups, tmd, tmdPotencial, oeeByEquip, diagnostico, hasTpl, nDias, metadados } = oeeAnalysis;
            const cp = oeeGroups.colh_propria;
            const ct = oeeGroups.colh_terceira;

            const insightsColh = diagnostico.filter(d =>
                d.id.includes('colh') || d.id === 'sem_tpl' || d.id === 'tmd_gap'
            );

            container.innerHTML = `
            <div class="oee-tab-wrapper">
                <!-- Header com nota de modelo -->
                <div class="oee-header-bar">
                    <h2><i class="fas fa-tractor"></i> OEE Colhedoras</h2>
                    <div class="oee-modelo-badge">
                        ${hasTpl ? '✅ TPL Carregado' : '⚠️ Sem TPL — Disponibilidade N/D'}
                        · Modelo: OEE Operacional (D×P×Q_proxy)
                        · Qualidade: proxy=1,0 (sem dado de perdas)
                    </div>
                </div>

                <!-- Cards OEE principais -->
                <div class="analytics-row">
                    ${this._renderOEETriple(cp, '🟢 Próprias (80x)')}
                    ${this._renderOEETriple(ct, '🟠 Terceiras (93x)')}
                </div>

                <!-- TMD Próprias -->
                <div class="section-title"><i class="fas fa-chart-bar"></i> TMD — Colhedoras Próprias</div>
                ${this._renderTMDCards(tmd.colh_propria.group, tmdPotencial.colh_propria, 'colh_propria')}

                <!-- TMD Terceiras -->
                <div class="section-title"><i class="fas fa-chart-bar"></i> TMD — Colhedoras Terceiras</div>
                ${this._renderTMDCards(tmd.colh_terceira.group, tmdPotencial.colh_terceira, 'colh_terceira')}

                <!-- Ranking lado a lado -->
                <div class="analytics-row" style="gap:16px">
                    <div class="analytics-card glass-card" style="flex:1">
                        <div class="card-header">
                            <h3>Ranking Próprias (${tmd.colh_propria.ranking.length} máq.)</h3>
                        </div>
                        ${this._renderRankingTable(oeeByEquip.colh_propria, 'colh_propria')}
                    </div>
                    <div class="analytics-card glass-card" style="flex:1">
                        <div class="card-header">
                            <h3>Ranking Terceiras (${tmd.colh_terceira.ranking.length} máq.)</h3>
                        </div>
                        ${this._renderRankingTable(oeeByEquip.colh_terceira, 'colh_terceira')}
                    </div>
                </div>

                <!-- Gráfico de barras OEE por equipamento -->
                <div class="analytics-card glass-card">
                    <div class="card-header">
                        <h3>OEE por Colhedora</h3>
                    </div>
                    <div style="height:280px; position:relative">
                        <canvas id="oeeColhedorasChart"></canvas>
                    </div>
                </div>

                <!-- Diagnóstico automático -->
                ${this._renderInsights(insightsColh)}

                <!-- Nota de auditoria -->
                <div class="audit-note">
                    <i class="fas fa-info-circle"></i>
                    <strong>Auditoria:</strong> ${metadados.disponibilidadeNota} | ${metadados.performanceNota} | ${metadados.qualidadeNota}
                    | Calculado em: ${metadados.dataCalculo}
                </div>
            </div>`;

            // Renderiza gráfico OEE por colhedora
            setTimeout(() => this._renderOEEBarChart(
                'oeeColhedorasChart',
                [...oeeByEquip.colh_propria, ...oeeByEquip.colh_terceira],
                ['colh_propria', 'colh_terceira']
            ), 100);
        }

        // ── ABA OEE CAMINHÕES ────────────────────────────────────

        renderAbaOEECaminhoes(oeeAnalysis) {
            const container = document.getElementById('tab-oee-caminhoes');
            if (!container) return;

            const { oeeGroups, tmd, tmdPotencial, oeeByEquip, diagnostico, hasTpl, nDias, metadados } = oeeAnalysis;
            const cp = oeeGroups.cam_proprio;
            const ct = oeeGroups.cam_terceiro;

            const insightsCam = diagnostico.filter(d =>
                d.id.includes('cam') || d.id === 'sem_tpl'
            );

            // Estatísticas de viagens por caminhão
            const statsViagens = this._calcCaminhaoStats(tmd);

            // Banner de mismatch TPL × Produção
            const _tplMismatch = window.agriculturalDashboard?.oeeAnalyzer?._tplMismatch;
            const _mismatchBanner = _tplMismatch ? `
                <div style="background:rgba(255,184,0,0.15);border:1px solid #FFB800;border-radius:10px;
                     padding:14px 20px;margin-bottom:16px;display:flex;gap:12px;align-items:flex-start">
                    <span style="font-size:20px">⚠️</span>
                    <div>
                        <strong style="color:#FFB800">TPL não corresponde ao período de produção</strong>
                        <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary)">
                            O TPL no Firestore tem equipamentos do período de <strong>preparo de solo</strong> (2026),
                            mas a produção é da <strong>safra de colheita de 2025</strong>.<br>
                            Para calcular o OEE corretamente, execute no GAS:<br>
                            <code style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;font-size:12px">
                                resetarMigracaoTPL()
                            </code>
                            depois
                            <code style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:4px;font-size:12px">
                                iniciarMigracaoAutomatica()
                            </code>
                            (já configurado para 14 meses — cobrirá a safra 2025)
                        </p>
                    </div>
                </div>` : '';

            container.innerHTML = `
            <div class="oee-tab-wrapper">
                ${_mismatchBanner}
                <div class="oee-header-bar">
                    <h2><i class="fas fa-truck"></i> OEE Caminhões</h2>
                    <div class="oee-modelo-badge">
                        ${hasTpl ? '✅ TPL Carregado' : '⚠️ Sem TPL — Disponibilidade N/D'}
                        · Modelo: OEE Operacional · Qualidade: proxy=1,0
                    </div>
                </div>

                <!-- KPIs rápidos -->
                <div class="kpi-row-oee">
                    ${this._renderKPICard('Viagens/cam Próprio', statsViagens.proprio.viagDia, '/dia', 'color-proprio')}
                    ${this._renderKPICard('Viagens/cam Terceiro', statsViagens.terceiro.viagDia, '/dia', 'color-terceiro')}
                    ${this._renderKPICard('Ton/cam Próprio', this._tmd(tmd.cam_proprio.group.tmdReal), 'por dia', 'color-proprio')}
                    ${this._renderKPICard('Ton/cam Terceiro', this._tmd(tmd.cam_terceiro.group.tmdReal), 'por dia', 'color-terceiro')}
                </div>

                <!-- OEE Triplos -->
                <div class="analytics-row">
                    ${this._renderOEETriple(cp, '🔵 Próprios (31x)')}
                    ${this._renderOEETriple(ct, '🟣 Terceiros (91x)')}
                </div>

                <!-- TMD -->
                <div class="section-title">TMD — Caminhões Próprios</div>
                ${this._renderTMDCards(tmd.cam_proprio.group, tmdPotencial.cam_proprio, 'cam_proprio')}

                <div class="section-title">TMD — Caminhões Terceiros</div>
                ${this._renderTMDCards(tmd.cam_terceiro.group, tmdPotencial.cam_terceiro, 'cam_terceiro')}

                <!-- Rankings -->
                <div class="analytics-row" style="gap:16px">
                    <div class="analytics-card glass-card" style="flex:1">
                        <div class="card-header"><h3>Ranking Próprios (${tmd.cam_proprio.ranking.length} cam.)</h3></div>
                        ${this._renderRankingTable(oeeByEquip.cam_proprio, 'cam_proprio')}
                    </div>
                    <div class="analytics-card glass-card" style="flex:1">
                        <div class="card-header"><h3>Ranking Terceiros (${tmd.cam_terceiro.ranking.length} cam.)</h3></div>
                        ${this._renderRankingTable(oeeByEquip.cam_terceiro, 'cam_terceiro')}
                    </div>
                </div>

                <!-- Gráfico -->
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>OEE por Caminhão</h3></div>
                    <div style="height:280px; position:relative">
                        <canvas id="oeeCaminhoesChart"></canvas>
                    </div>
                </div>

                ${this._renderInsights(insightsCam)}

                <div class="audit-note">
                    <i class="fas fa-info-circle"></i>
                    ${metadados.disponibilidadeNota} | ${metadados.qualidadeNota}
                    | Calculado em: ${metadados.dataCalculo}
                </div>
            </div>`;

            setTimeout(() => this._renderOEEBarChart(
                'oeeCaminhoesChart',
                [...oeeByEquip.cam_proprio, ...oeeByEquip.cam_terceiro],
                ['cam_proprio', 'cam_terceiro']
            ), 100);
        }

        // ── ABA COMPARATIVO OEE ──────────────────────────────────

        renderAbaComparativoOEE(oeeAnalysis) {
            const container = document.getElementById('tab-comparativo-oee');
            if (!container) return;

            const { oeeGroups, tmd, tmdPotencial, diagnostico, nDias } = oeeAnalysis;

            const grupos = [
                { cat: 'colh_propria',  label: 'Colh. Própria',  icon: '🟢', g: oeeGroups.colh_propria,  t: tmd.colh_propria,  p: tmdPotencial.colh_propria  },
                { cat: 'colh_terceira', label: 'Colh. Terceira', icon: '🟠', g: oeeGroups.colh_terceira, t: tmd.colh_terceira, p: tmdPotencial.colh_terceira },
                { cat: 'cam_proprio',   label: 'Cam. Próprio',   icon: '🔵', g: oeeGroups.cam_proprio,   t: tmd.cam_proprio,   p: tmdPotencial.cam_proprio   },
                { cat: 'cam_terceiro',  label: 'Cam. Terceiro',  icon: '🟣', g: oeeGroups.cam_terceiro,  t: tmd.cam_terceiro,  p: tmdPotencial.cam_terceiro  }
            ];

            const tabelaRows = grupos.map(({ icon, label, g, t, p }) => {
                const sem = this._semaforo(g?.oeeOperacional);
                return `
                <tr>
                    <td><strong>${icon} ${label}</strong></td>
                    <td>${t?.group?.nEquip || 0}</td>
                    <td>${this._ton(t?.group?.ton)}</td>
                    <td>${this._tmd(t?.group?.tmdReal)}</td>
                    <td>${this._tmd(p?.tmdPotencialTecnico)}</td>
                    <td>${this._tmd(p?.tmdAjustadoOEE)}</td>
                    <td>${this._pct(g?.disponibilidade)}${g?.dispIsProxy ? '⚠' : ''}</td>
                    <td>${this._pct(g?.performance)}</td>
                    <td><span class="badge-oee badge-${sem}">${this._pct(g?.oeeOperacional)}</span></td>
                    <td>${this._tmd(p && t ? p.tmdPotencialTecnico - t.group.tmdReal : null)}</td>
                </tr>`;
            }).join('');

            // Ganho potencial total
            const ganhoTotal = grupos.reduce((s, { t, p }) => {
                const g = p && t ? (p.tmdPotencialTecnico - t.group.tmdReal) * t.group.nEquip : 0;
                return s + Math.max(0, g);
            }, 0);

            container.innerHTML = `
            <div class="oee-tab-wrapper">
                <div class="oee-header-bar">
                    <h2><i class="fas fa-balance-scale"></i> Comparativo OEE — Executivo</h2>
                </div>

                <!-- Ganho potencial destaque -->
                <div class="ganho-destaque glass-card">
                    <div class="ganho-icone">🚀</div>
                    <div class="ganho-texto">
                        <strong>Ganho Potencial Total Estimado</strong>
                        <span class="ganho-valor">${this._ton(ganhoTotal * nDias)}</span>
                        <span class="ganho-sub">no período de ${nDias} dia(s), se todas as frotas atingirem o benchmark p90</span>
                    </div>
                </div>

                <!-- Tabela executiva -->
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>Matriz Comparativa Completa</h3></div>
                    <div class="table-responsive-oee">
                        <table class="oee-table comparativo-table">
                            <thead>
                                <tr>
                                    <th>Grupo</th>
                                    <th>Equip.</th>
                                    <th>Ton Total</th>
                                    <th>TMD Real</th>
                                    <th>TMD Potencial</th>
                                    <th>TMD Aj. OEE</th>
                                    <th>Disp.</th>
                                    <th>Perf.</th>
                                    <th>OEE Op.</th>
                                    <th>Gap/Equip</th>
                                </tr>
                            </thead>
                            <tbody>${tabelaRows}</tbody>
                        </table>
                    </div>
                </div>

                <!-- Gráfico comparativo -->
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>OEE Comparativo — Própria vs Terceira</h3></div>
                    <div style="height:300px; position:relative">
                        <canvas id="oeeComparativoChart"></canvas>
                    </div>
                </div>

                <!-- Insights executivos -->
                ${this._renderInsights(diagnostico)}
            </div>`;

            setTimeout(() => this._renderComparativoChart(grupos), 100);
        }

        // ── ABA GARGALOS ─────────────────────────────────────────

        renderAbaGargalos(oeeAnalysis) {
            const container = document.getElementById('tab-gargalos');
            if (!container) return;

            const { gargalos, diagnostico, hasTpl } = oeeAnalysis;

            const rowsCriticos = (gargalos.top10Criticos || []).map((item, i) => `
            <tr>
                <td><strong>${i + 1}</strong></td>
                <td><strong>${item.id}</strong></td>
                <td><span class="badge-cat">${this._catLabel(item.categoria)}</span></td>
                <td>${this._tmd(item.tmdReal)}</td>
                <td>${this._pct(item.oee)}</td>
                <td>${this._pct(item.disponibilidade)}</td>
                <td class="td-causa" title="${item.topCausa}">${item.topCausa.slice(0, 30)}</td>
                <td><span class="prioridade-${item.prioridade}">${item.prioridade}</span></td>
            </tr>`).join('');

            const rowsPerdas = (gargalos.topPerdas || []).map((p, i) => `
            <tr>
                <td><strong>${i + 1}</strong></td>
                <td>${p.descOperacao}</td>
                <td><span class="badge-cat-op badge-${p.categoria}">${p.categoria.replace('_',' ')}</span></td>
                <td>${this._h(p.horasTotais)}</td>
                <td>${p.impactoEstimado}</td>
            </tr>`).join('');

            container.innerHTML = `
            <div class="oee-tab-wrapper">
                <div class="oee-header-bar">
                    <h2><i class="fas fa-exclamation-triangle"></i> Diagnóstico de Gargalos</h2>
                    <div class="oee-modelo-badge">${hasTpl ? '✅ TPL disponível' : '⚠️ Sem TPL — gargalos estimados'}</div>
                </div>

                <!-- Top 10 máquinas críticas -->
                <div class="analytics-card glass-card">
                    <div class="card-header">
                        <h3><i class="fas fa-times-circle" style="color:var(--danger)"></i> Top 10 Equipamentos Críticos (menor OEE)</h3>
                    </div>
                    ${hasTpl && gargalos.top10Criticos?.length > 0 ? `
                    <div class="table-responsive-oee">
                        <table class="oee-table">
                            <thead><tr><th>#</th><th>Equip.</th><th>Tipo</th><th>TMD Real</th><th>OEE</th><th>Disp.</th><th>Principal Causa</th><th>Prioridade</th></tr></thead>
                            <tbody>${rowsCriticos}</tbody>
                        </table>
                    </div>` : `<div class="empty-state">Carregue o TPL para análise de gargalos por equipamento.</div>`}
                </div>

                <!-- Top 10 perdas operacionais -->
                <div class="analytics-card glass-card">
                    <div class="card-header">
                        <h3><i class="fas fa-clock" style="color:var(--warning)"></i> Top 10 Operações Que Mais Consomem Horas Improdutivas</h3>
                    </div>
                    ${hasTpl && gargalos.topPerdas?.length > 0 ? `
                    <div class="table-responsive-oee">
                        <table class="oee-table">
                            <thead><tr><th>#</th><th>Operação</th><th>Categoria</th><th>Horas Totais</th><th>Impacto Estimado</th></tr></thead>
                            <tbody>${rowsPerdas}</tbody>
                        </table>
                    </div>` : `<div class="empty-state">Carregue o TPL para análise de perdas operacionais.</div>`}
                </div>

                <!-- Gráfico de perdas -->
                ${hasTpl && gargalos.topPerdas?.length > 0 ? `
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>Pareto de Horas Improdutivas</h3></div>
                    <div style="height:300px; position:relative">
                        <canvas id="gargalosChart"></canvas>
                    </div>
                </div>` : ''}

                <!-- Diagnóstico -->
                ${this._renderInsights(diagnostico)}
            </div>`;

            if (hasTpl && gargalos.topPerdas?.length > 0) {
                setTimeout(() => this._renderParetoChart(gargalos.topPerdas), 100);
            }
        }

        // ── ABA EFICIÊNCIA OPERACIONAL ───────────────────────────

        renderAbaEficiencia(oeeAnalysis) {
            const container = document.getElementById('tab-eficiencia-operacional');
            if (!container) return;

            const { oeeByEquip, oeeGroups, hasTpl, nDias } = oeeAnalysis;

            // Agrega horas por categoria para todos os equipamentos com TPL
            const agg = { hrsProdutivas: 0, hrsParadaOp: 0, hrsParadaMec: 0, hrsImprodutivo: 0, hrsDeslocamento: 0 };
            let temDados = false;

            const cats = ['colh_propria','colh_terceira','cam_proprio','cam_terceiro'];
            cats.forEach(cat => {
                (oeeByEquip[cat] || []).forEach(eq => {
                    if (eq.hrsProdutivas != null) {
                        agg.hrsProdutivas   += eq.hrsProdutivas   || 0;
                        agg.hrsParadaOp     += eq.hrsParadaOp     || 0;
                        agg.hrsParadaMec    += eq.hrsParadaMec    || 0;
                        agg.hrsImprodutivo  += eq.hrsImprodutivo  || 0;
                        agg.hrsDeslocamento += eq.hrsDeslocamento || 0;
                        temDados = true;
                    }
                });
            });

            const total = Object.values(agg).reduce((s, v) => s + v, 0);
            const pct = (v) => total > 0 ? (v / total * 100).toFixed(1) + '%' : '—';

            container.innerHTML = `
            <div class="oee-tab-wrapper">
                <div class="oee-header-bar">
                    <h2><i class="fas fa-tachometer-alt"></i> Eficiência Operacional</h2>
                    <div class="oee-modelo-badge">${hasTpl ? '✅ TPL disponível' : '⚠️ Sem TPL'}</div>
                </div>

                <!-- Distribuição de horas -->
                <div class="analytics-row">
                    <div class="analytics-card glass-card" style="flex:1">
                        <div class="card-header"><h3>Distribuição de Horas — Toda a Frota</h3></div>
                        ${temDados ? `
                        <div class="hora-dist-grid">
                            ${this._horaBar('Produtivas',    agg.hrsProdutivas,   total, '#40800c')}
                            ${this._horaBar('Parada Op.',    agg.hrsParadaOp,     total, '#FFB800')}
                            ${this._horaBar('Manutenção',    agg.hrsParadaMec,    total, '#FF2E63')}
                            ${this._horaBar('Improdutivo',   agg.hrsImprodutivo,  total, '#666')}
                            ${this._horaBar('Deslocamento',  agg.hrsDeslocamento, total, '#7B61FF')}
                        </div>` : `<div class="empty-state">Carregue o TPL para análise de eficiência.</div>`}
                    </div>
                    <div style="flex:1; min-width:280px; height:300px; position:relative">
                        <canvas id="eficienciaDonutChart"></canvas>
                    </div>
                </div>

                <!-- Por grupo -->
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>Eficiência por Grupo</h3></div>
                    <div class="efic-grupos-grid">
                        ${cats.map(cat => this._renderEficGrupo(cat, oeeByEquip[cat] || [])).join('')}
                    </div>
                </div>

                <!-- Correlações textuais -->
                <div class="analytics-card glass-card">
                    <div class="card-header"><h3>Correlações Operacionais</h3></div>
                    <div class="correlacoes-list">
                        ${this._renderCorrelacoes(oeeAnalysis)}
                    </div>
                </div>
            </div>`;

            if (temDados) {
                setTimeout(() => this._renderEficDonut(agg), 100);
            }
        }

        // ── HELPERS DE RENDERIZAÇÃO ──────────────────────────────

        _horaBar(label, horas, total, color) {
            const pct = total > 0 ? (horas / total * 100) : 0;
            return `
            <div class="hora-bar-item">
                <div class="hora-bar-label">
                    <span>${label}</span>
                    <span>${horas.toFixed(1)}h (${pct.toFixed(1)}%)</span>
                </div>
                <div class="hora-bar-track">
                    <div class="hora-bar-fill" style="width:${pct}%; background:${color}"></div>
                </div>
            </div>`;
        }

        _renderEficGrupo(cat, equips) {
            const temTpl = equips.some(e => e.hrsProdutivas != null);
            const agg = { p: 0, po: 0, pm: 0, i: 0 };
            if (temTpl) {
                equips.forEach(e => {
                    agg.p  += e.hrsProdutivas   || 0;
                    agg.po += e.hrsParadaOp     || 0;
                    agg.pm += e.hrsParadaMec    || 0;
                    agg.i  += e.hrsImprodutivo  || 0;
                });
            }
            const tot = agg.p + agg.po + agg.pm + agg.i;

            return `
            <div class="efic-grupo-card" style="border-top: 3px solid ${this._catColor(cat)}">
                <div class="efic-grupo-title">${this._catLabel(cat)}</div>
                <div class="efic-grupo-equips">${equips.length} máquinas</div>
                ${temTpl && tot > 0 ? `
                    <div class="efic-mini-bars">
                        <div title="Produtivas: ${agg.p.toFixed(1)}h" style="flex:${agg.p}; background:#40800c; min-width:2px"></div>
                        <div title="Parada Op.: ${agg.po.toFixed(1)}h" style="flex:${agg.po}; background:#FFB800; min-width:2px"></div>
                        <div title="Manutenção: ${agg.pm.toFixed(1)}h" style="flex:${agg.pm}; background:#FF2E63; min-width:2px"></div>
                        <div title="Improdutivo: ${agg.i.toFixed(1)}h" style="flex:${agg.i}; background:#666; min-width:2px"></div>
                    </div>
                    <div class="efic-grupo-pct">${tot > 0 ? (agg.p/tot*100).toFixed(0) : 0}% produtivo</div>
                ` : '<div class="proxy-badge">Sem TPL</div>'}
            </div>`;
        }

        _renderCorrelacoes(oeeAnalysis) {
            const { oeeGroups, tmd } = oeeAnalysis;
            const items = [];

            const cp = oeeGroups.colh_propria;
            const ct = oeeGroups.colh_terceira;

            if (cp.disponibilidade != null && cp.performance != null) {
                const corrDispTMD = cp.disponibilidade > 0.8 && cp.performance > 0.75
                    ? 'Alta disponibilidade acompanhada de alta performance — operação equilibrada.'
                    : cp.disponibilidade > 0.8 && cp.performance < 0.5
                    ? 'Alta disponibilidade mas baixa performance — verificar velocidade de colheita e ciclo de caminhão.'
                    : cp.disponibilidade < 0.6 && cp.performance > 0.75
                    ? 'Baixa disponibilidade limita o TMD mesmo com boa performance unitária.'
                    : 'Disponibilidade e performance abaixo do ideal — foco em manutenção e logística.';
                items.push({ texto: `[Colh. Própria] ${corrDispTMD}`, tipo: 'insight' });
            }

            const camprop = tmd.cam_proprio;
            const camterc = tmd.cam_terceiro;
            if (camprop.tmdReal > 0 && camterc.tmdReal > 0) {
                const totalViagProp = camprop.ranking.reduce((s, r) => s + (r.nViagens || 0), 0);
                const totalViagTerc = camterc.ranking.reduce((s, r) => s + (r.nViagens || 0), 0);
                const ratio = totalViagProp && totalViagTerc
                    ? (camprop.group.tmdReal / camprop.group.nEquip) / (camterc.group.tmdReal / camterc.group.nEquip) : 1;
                items.push({
                    texto: `[Caminhões] Caminhão próprio faz em média ${camprop.group.tmdReal.toFixed(0)} t/dia vs ${camterc.group.tmdReal.toFixed(0)} t/dia do terceiro.`,
                    tipo: 'dado'
                });
            }

            if (items.length === 0) {
                return '<div class="empty-state">Carregue TPL e dados de produção para correlações.</div>';
            }

            return items.map(i => `
            <div class="correlacao-item correlacao-${i.tipo}">
                <i class="fas fa-${i.tipo === 'insight' ? 'lightbulb' : 'chart-line'}"></i>
                ${i.texto}
            </div>`).join('');
        }

        _renderInsights(insights) {
            if (!insights || insights.length === 0) return '';
            return `
            <div class="analytics-card glass-card insights-card">
                <div class="card-header"><h3><i class="fas fa-robot"></i> Diagnóstico Automático</h3></div>
                <div class="insights-list">
                    ${insights.map(i => `
                    <div class="insight-item insight-${i.tipo}">
                        <span class="insight-icone">${i.icone}</span>
                        <span class="insight-texto">${i.texto}</span>
                    </div>`).join('')}
                </div>
            </div>`;
        }

        _calcCaminhaoStats(tmd) {
            const prop = tmd.cam_proprio;
            const terc = tmd.cam_terceiro;
            const viagDia = (ranking, nDias) => {
                if (!ranking || ranking.length === 0 || !nDias) return '—';
                const totalViag = ranking.reduce((s, r) => s + r.nViagens, 0);
                return (totalViag / ranking.length / nDias).toFixed(1);
            };
            return {
                proprio:  { viagDia: viagDia(prop.ranking, prop.group.nDias) },
                terceiro: { viagDia: viagDia(terc.ranking, terc.group.nDias) }
            };
        }

        // ── GRÁFICOS ─────────────────────────────────────────────

        _renderOEEBarChart(canvasId, equips, cats) {
            const canvas = document.getElementById(canvasId);
            if (!canvas || typeof Chart === 'undefined') return;
            if (this.visualizer.charts[canvasId]) this.visualizer.charts[canvasId].destroy();

            const comOEE = equips.filter(e => e.oeeOperacional != null);
            if (comOEE.length === 0) return;

            const labels = comOEE.map(e => e.id);
            const dataOEE = comOEE.map(e => parseFloat((e.oeeOperacional * 100).toFixed(1)));
            const dataTMD = comOEE.map(e => parseFloat(e.tmdReal.toFixed(0)));
            const colors  = comOEE.map(e =>
                e.oeeOperacional >= 0.65 ? '#40800c' :
                e.oeeOperacional >= 0.45 ? '#FFB800' : '#FF2E63'
            );

            const theme = this.visualizer.getThemeConfig ? this.visualizer.getThemeConfig() : {};

            this.visualizer.charts[canvasId] = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'OEE Operacional (%)',
                            data: dataOEE,
                            backgroundColor: colors,
                            yAxisID: 'y'
                        },
                        {
                            label: 'TMD Real (t/dia)',
                            data: dataTMD,
                            type: 'line',
                            borderColor: '#00D4FF',
                            backgroundColor: 'transparent',
                            tension: 0.3,
                            pointRadius: 4,
                            yAxisID: 'y2'
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { color: theme.fontColor || '#ccc' } },
                        tooltip: { mode: 'index' }
                    },
                    scales: {
                        x: { ticks: { color: theme.fontColor || '#ccc', maxRotation: 60 } },
                        y: {
                            type: 'linear', position: 'left',
                            min: 0, max: 100,
                            title: { display: true, text: 'OEE (%)', color: theme.fontColor || '#ccc' },
                            ticks: { color: theme.fontColor || '#ccc' },
                            grid: { color: theme.gridColor || 'rgba(255,255,255,0.1)' }
                        },
                        y2: {
                            type: 'linear', position: 'right',
                            title: { display: true, text: 'TMD (t/dia)', color: '#00D4FF' },
                            ticks: { color: '#00D4FF' },
                            grid: { drawOnChartArea: false }
                        }
                    }
                }
            });
        }

        _renderComparativoChart(grupos) {
            const canvas = document.getElementById('oeeComparativoChart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (this.visualizer.charts.oeeComparativoChart) this.visualizer.charts.oeeComparativoChart.destroy();

            const theme = this.visualizer.getThemeConfig ? this.visualizer.getThemeConfig() : {};
            const labels = grupos.map(g => g.label);

            this.visualizer.charts.oeeComparativoChart = new Chart(canvas.getContext('2d'), {
                type: 'radar',
                data: {
                    labels: ['OEE Op. (%)', 'Disp. (%)', 'Perf. (%)', 'TMD Real (÷10)', 'Equip.'],
                    datasets: grupos.map(({ cat, label, g, t }) => ({
                        label,
                        data: [
                            g?.oeeOperacional != null ? +(g.oeeOperacional * 100).toFixed(1) : 0,
                            g?.disponibilidade != null ? +(g.disponibilidade * 100).toFixed(1) : 0,
                            g?.performance != null ? +(g.performance * 100).toFixed(1) : 0,
                            t?.group?.tmdReal ? +(t.group.tmdReal / 10).toFixed(1) : 0,
                            t?.group?.nEquip || 0
                        ],
                        borderColor: this._catColor(cat),
                        backgroundColor: this._catColor(cat) + '33',
                        pointBackgroundColor: this._catColor(cat)
                    }))
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: theme.fontColor || '#ccc' } } },
                    scales: {
                        r: {
                            ticks: { color: theme.fontColor || '#ccc', backdropColor: 'transparent' },
                            grid: { color: theme.gridColor || 'rgba(255,255,255,0.15)' },
                            pointLabels: { color: theme.fontColor || '#ccc' }
                        }
                    }
                }
            });
        }

        _renderParetoChart(topPerdas) {
            const canvas = document.getElementById('gargalosChart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (this.visualizer.charts.gargalosChart) this.visualizer.charts.gargalosChart.destroy();

            const theme = this.visualizer.getThemeConfig ? this.visualizer.getThemeConfig() : {};
            const labels = topPerdas.map(p => p.descOperacao.slice(0, 25));
            const horas  = topPerdas.map(p => +p.horasTotais.toFixed(1));
            const total  = horas.reduce((s, v) => s + v, 0);
            let acum = 0;
            const acumPct = horas.map(h => { acum += h; return +(acum / total * 100).toFixed(1); });

            this.visualizer.charts.gargalosChart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Horas Improdutivas', data: horas, backgroundColor: '#FF2E63', yAxisID: 'y' },
                        { label: 'Acumulado (%)', data: acumPct, type: 'line', borderColor: '#FFB800', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, yAxisID: 'y2' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: theme.fontColor || '#ccc' } } },
                    scales: {
                        x: { ticks: { color: theme.fontColor || '#ccc', maxRotation: 45 } },
                        y: { title: { display: true, text: 'Horas', color: theme.fontColor || '#ccc' }, ticks: { color: theme.fontColor || '#ccc' }, grid: { color: theme.gridColor || 'rgba(255,255,255,0.1)' } },
                        y2: { type: 'linear', position: 'right', min: 0, max: 100, title: { display: true, text: 'Acumulado %', color: '#FFB800' }, ticks: { color: '#FFB800' }, grid: { drawOnChartArea: false } }
                    }
                }
            });
        }

        _renderEficDonut(agg) {
            const canvas = document.getElementById('eficienciaDonutChart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (this.visualizer.charts.eficienciaDonutChart) this.visualizer.charts.eficienciaDonutChart.destroy();

            const theme = this.visualizer.getThemeConfig ? this.visualizer.getThemeConfig() : {};

            this.visualizer.charts.eficienciaDonutChart = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Produtivas', 'Parada Op.', 'Manutenção', 'Improdutivo', 'Deslocamento'],
                    datasets: [{
                        data: [agg.hrsProdutivas, agg.hrsParadaOp, agg.hrsParadaMec, agg.hrsImprodutivo, agg.hrsDeslocamento].map(v => +v.toFixed(1)),
                        backgroundColor: ['#40800c', '#FFB800', '#FF2E63', '#666', '#7B61FF'],
                        borderColor: 'transparent'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: { legend: { position: 'right', labels: { color: theme.fontColor || '#ccc' } } }
                }
            });
        }
    }

    window.VisualizerOEE = VisualizerOEE;
    console.log('[VisualizerOEE] Registrado.');
}