// visualizer-oee-unified.js
// ============================================================
// ENTREGÁVEL 5 — ADAPTADOR / RENDERIZADOR OEE UNIFICADO
//
// RESPONSABILIDADE:
//   1. Aceita o output do OEEAnalyzer (data-analyzer-oee.js, simples,
//      baseado em grupos) E o output do Oee_analyzer.js (legacy,
//      com oeeByEquip / tmdPotencial completos).
//   2. Normaliza os dois contratos num objeto canônico unificado
//      chamado `OEEUnifiedResult`.
//   3. Delega a renderização das abas ao VisualizerOEE existente,
//      completando os campos que faltam no contrato legacy quando
//      apenas o novo OEEAnalyzer estiver disponível.
//
// PRINCÍPIO DE ZERO QUEBRA:
//   • Se o VisualizerOEE já estiver carregado e o Oee_analyzer
//     produzir o contrato completo, este módulo é transparente.
//   • Se apenas o novo OEEAnalyzer estiver disponível, este módulo
//     preenche os campos ausentes com valores estimados + badges
//     "PROXY" visíveis ao usuário.
// ============================================================

if (typeof OEEUnifiedVisualizer === 'undefined') {

class OEEUnifiedVisualizer {

    constructor(visualizer) {
        this.visualizer = visualizer;
        this.baseColors = visualizer?.baseColors || {};
    }

    // ────────────────────────────────────────────────────────
    //  DETECÇÃO DO CONTRATO
    // ────────────────────────────────────────────────────────

    /**
     * Retorna true se o objeto recebido é o contrato LEGACY
     * (Oee_analyzer.js): possui oeeByEquip, tmdPotencial e diagnostico.
     */
    _isLegacyContract(analysis) {
        return analysis &&
            typeof analysis.oeeByEquip   === 'object' &&
            typeof analysis.tmdPotencial === 'object' &&
            Array.isArray(analysis.diagnostico);
    }

    /**
     * Retorna true se é o contrato NOVO (data-analyzer-oee.js):
     * possui oeeGroups mas NÃO possui oeeByEquip.
     */
    _isNewContract(analysis) {
        return analysis &&
            typeof analysis.oeeGroups === 'object' &&
            !analysis.oeeByEquip;
    }

    // ────────────────────────────────────────────────────────
    //  ADAPTADOR: NOVO → LEGACY
    //  Converte o output do OEEAnalyzer (simples, por grupo)
    //  para o contrato esperado pelo VisualizerOEE.
    // ────────────────────────────────────────────────────────

    _adaptNewToLegacy(newAnalysis) {
        const g = newAnalysis.oeeGroups;
        const nDias = newAnalysis.nDias || 1;

        // ── oeeByEquip: por grupo, sem detalhamento por equipamento ──
        // O novo analyzer não tem dados por máquina individualmente.
        // Criamos um "super-equip" representando o grupo inteiro.
        const oeeByEquip = {};
        const cats = ['colh_propria', 'colh_terceira', 'cam_proprio', 'cam_terceiro'];

        cats.forEach(cat => {
            const gr = g[cat];
            if (!gr || gr.ton === 0) {
                oeeByEquip[cat] = [];
                return;
            }
            // Representa o grupo como 1 "equipamento" agregado
            oeeByEquip[cat] = [{
                rank            : 1,
                id              : this._catShortLabel(cat) + ' (grupo)',
                ton             : gr.ton,
                tmdReal         : gr.tmdReal,
                disponibilidade : gr.disponibilidade,
                dispIsProxy     : gr.proxyD,
                performance     : gr.performance,
                oeeOperacional  : gr.oeeOperacional,
                nViagens        : 0,
                hrsProdutivas   : gr.horasProd || null,
                hrsParadaOp     : null,
                hrsParadaMec    : null,
                hrsImprodutivo  : null,
                hrsDeslocamento : null,
                topOps          : []
            }];
        });

        // ── tmdPotencial: usa os dados do grupo ──────────────────────
        const tmdPotencial = {};
        cats.forEach(cat => {
            const gr = g[cat] || {};
            tmdPotencial[cat] = {
                tmdPotencialTecnico : gr.tmdRef  || 0,
                tmdAjustadoOEE      : gr.tmdAjustado || null,
                formula             : `TMD_Ref(P90) × OEE = ${(gr.tmdRef||0).toFixed(0)} × ${gr.oeeOperacional !== null ? (gr.oeeOperacional*100).toFixed(0)+'%' : 'N/D'}`
            };
        });

        // ── tmd (ranking vazio para evitar .length undefined) ───────
        const tmd = {};
        cats.forEach(cat => {
            const gr = g[cat] || {};
            tmd[cat] = {
                group   : { ...gr, nDias, nEquip: gr.nEquip || 0 },
                ranking : [],
                tmdReal : gr.tmdReal || 0,
                tmdRef  : gr.tmdRef  || 0,
                tmdAdj  : gr.tmdAjustado || null,
                formula : `Ton(${(gr.ton||0).toFixed(0)}) / ${gr.nEquip||0} equip / ${nDias} dias`
            };
        });

        // ── diagnostico: converte gargalos do novo formato ───────────
        const diagnostico = (newAnalysis.gargalos || []).map((gar, i) => {
            const tipoMap = {
                'OEE Crítico'         : { tipo: 'alerta',       icone: '⚠️' },
                'Parada Operacional'  : { tipo: 'alerta',       icone: '⏸' },
                'Manutenção Mecânica' : { tipo: 'aviso',        icone: '🔧' },
                'Baixo TMD'           : { tipo: 'oportunidade', icone: '📉' }
            };
            const meta = tipoMap[gar.tipo] || { tipo: 'comparativo', icone: 'ℹ️' };
            return {
                id     : `gargalo_${i}`,
                tipo   : meta.tipo,
                icone  : meta.icone,
                texto  : `[${gar.categoria}] ${gar.descricao} — Valor: ${gar.valor}`
            };
        });

        // Se não há diagnóstico, adiciona nota de modelo
        if (diagnostico.length === 0 && !newAnalysis.hasTpl) {
            diagnostico.push({
                id    : 'sem_tpl',
                tipo  : 'comparativo',
                icone : 'ℹ️',
                texto : 'TPL não carregado. Disponibilidade calculada como PROXY=100%. Carregue o TPL.csv para análise completa.'
            });
        }

        // ── gargalos (formato legacy) ────────────────────────────────
        const gargalosLegacy = {
            top10Criticos : [],   // Vazio: não há dados por equipamento sem TPL+granular
            topPerdas     : []    // Vazio: requer TPL com horas por operação
        };

        // ── metadados ────────────────────────────────────────────────
        const meta = newAnalysis.metadados || {};
        const metadados = {
            modeloOEE          : meta.modeloOEE || 'OEE Operacional',
            disponibilidadeNota: newAnalysis.hasTpl
                ? 'D = Horas Produtivas / Motor Ligado (TPL)'
                : 'D = PROXY 1,0 (sem TPL)',
            performanceNota    : 'P = TMD Real / TMD Referência (P90 do período)',
            qualidadeNota      : 'Q = PROXY 1,0 (sem dado de perdas/rejeição)',
            dataCalculo        : new Date().toLocaleString('pt-BR'),
            nDias
        };

        return {
            ...newAnalysis,
            oeeByEquip,
            tmdPotencial,
            tmd,
            diagnostico,
            gargalos    : gargalosLegacy,
            nDias,
            metadados,
            _adaptedFromNew: true
        };
    }

    _catShortLabel(cat) {
        return { colh_propria: 'Colh.Prop', colh_terceira: 'Colh.Terc',
                 cam_proprio: 'Cam.Prop', cam_terceiro: 'Cam.Terc' }[cat] || cat;
    }

    // ────────────────────────────────────────────────────────
    //  RENDERIZAÇÃO STANDALONE (fallback se VisualizerOEE falhar)
    //  Renderiza cards simples diretamente sem depender do
    //  contrato complexo do VisualizerOEE.
    // ────────────────────────────────────────────────────────

    _renderFallbackGroup(cat, gr, label, iconColor) {
        if (!gr) return '';
        const oeeStr  = gr.oeeOperacional !== null
            ? `<span style="color:${gr.oeeOperacional >= 0.65 ? '#40800c' : gr.oeeOperacional >= 0.45 ? '#FFB800' : '#FF2E63'}; font-size:2rem; font-weight:900;">${(gr.oeeOperacional*100).toFixed(1)}%</span>`
            : '<span style="color:#888; font-size:1.2rem;">N/D (sem TPL)</span>';

        const dispStr = gr.disponibilidade !== null
            ? `${(gr.disponibilidade*100).toFixed(1)}%${gr.proxyD ? ' <small style="color:#FFB800">(proxy)</small>' : ''}`
            : 'N/D';

        const perfStr = gr.performance !== null
            ? `${(gr.performance*100).toFixed(1)}%`
            : 'N/D';

        return `
        <div class="oee-triple-card glass-card" style="border-top:3px solid ${iconColor}">
            <div class="oee-triple-header">${label}</div>
            <div class="oee-main-value">${oeeStr}</div>
            <div class="oee-triple-grid">
                <div class="oee-component">
                    <span class="oee-comp-label">Disponib.</span>
                    <span class="oee-comp-val">${dispStr}</span>
                </div>
                <div class="oee-component">
                    <span class="oee-comp-label">Performance</span>
                    <span class="oee-comp-val">${perfStr}</span>
                </div>
                <div class="oee-component">
                    <span class="oee-comp-label">Qualidade</span>
                    <span class="oee-comp-val">100% <small style="color:#FFB800">(proxy)</small></span>
                </div>
            </div>
            <div class="oee-nota">
                ${gr.nEquip} equip. · ${gr.ton > 0 ? gr.ton.toLocaleString('pt-BR',{maximumFractionDigits:0})+' t' : '—'}
                · TMD: ${gr.tmdReal > 0 ? gr.tmdReal.toFixed(0)+' t/maq/dia' : '—'}
            </div>
        </div>`;
    }

    _renderFallbackGargalos(gargalos) {
        if (!gargalos || gargalos.length === 0) {
            return `<div class="empty-state">
                <span class="empty-icon">✅</span>
                Nenhum gargalo crítico detectado nos dados disponíveis.
            </div>`;
        }

        const prioColor = { 'CRÍTICA': '#FF2E63', 'ALTA': '#FFB800', 'MÉDIA': '#00D4FF' };
        const rows = gargalos.map((g, i) => `
        <tr>
            <td><strong>${i+1}</strong></td>
            <td><span style="color:${prioColor[g.prioridade] || '#888'}; font-weight:700;">${g.prioridade}</span></td>
            <td><strong>${g.tipo}</strong></td>
            <td>${g.categoria}</td>
            <td>${g.valor}</td>
            <td style="max-width:300px; font-size:0.82rem; color:var(--text-secondary,#94a3b8)">${g.descricao}</td>
        </tr>`).join('');

        return `
        <div class="table-responsive-oee">
            <table class="oee-table">
                <thead>
                    <tr>
                        <th>#</th><th>Prioridade</th><th>Tipo</th>
                        <th>Categoria</th><th>Valor</th><th>Diagnóstico</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    _renderComparativoFallback(oeeGroups, nDias) {
        const cats = [
            { cat: 'colh_propria',  label: 'Colh. Própria',  cor: '#40800c' },
            { cat: 'colh_terceira', label: 'Colh. Terceira', cor: '#FF8C00' },
            { cat: 'cam_proprio',   label: 'Cam. Próprio',   cor: '#00D4FF' },
            { cat: 'cam_terceiro',  label: 'Cam. Terceiro',  cor: '#7B61FF' }
        ];

        const fmtOee = (v) => v !== null ? `${(v*100).toFixed(1)}%` : '—';
        const fmtTmd = (v) => v > 0 ? `${v.toFixed(0)} t` : '—';

        const rows = cats.map(({ cat, label, cor }) => {
            const g = oeeGroups[cat] || {};
            const sem = g.oeeOperacional !== null
                ? (g.oeeOperacional >= 0.65 ? 'success' : g.oeeOperacional >= 0.45 ? 'warning' : 'danger')
                : 'sem-dado';
            return `
            <tr>
                <td><span style="color:${cor}; font-weight:700;">●</span> ${label}</td>
                <td>${g.nEquip || 0}</td>
                <td>${g.ton > 0 ? g.ton.toLocaleString('pt-BR',{maximumFractionDigits:0})+' t' : '—'}</td>
                <td>${fmtTmd(g.tmdReal)}</td>
                <td>${fmtTmd(g.tmdRef)}</td>
                <td>${fmtTmd(g.tmdAjustado)}</td>
                <td>${g.disponibilidade !== null ? fmtOee(g.disponibilidade) + (g.proxyD ? ' ⚠' : '') : '—'}</td>
                <td>${fmtOee(g.performance)}</td>
                <td><span class="badge-oee badge-${sem}">${fmtOee(g.oeeOperacional)}</span></td>
            </tr>`;
        }).join('');

        return `
        <div class="table-responsive-oee">
            <table class="oee-table comparativo-table">
                <thead>
                    <tr>
                        <th>Grupo</th><th>Equip.</th><th>Ton Total</th>
                        <th>TMD Real</th><th>TMD Ref (P90)</th><th>TMD Aj. OEE</th>
                        <th>Disp.</th><th>Perf.</th><th>OEE Op.</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    // ────────────────────────────────────────────────────────
    //  RENDERIZAÇÃO POR ABA (fallback standalone)
    //  Usada quando VisualizerOEE não está disponível OU
    //  quando _adaptedFromNew = true (dados simplificados)
    // ────────────────────────────────────────────────────────

    _renderAbaColhedorasFallback(analysis) {
        const container = document.getElementById('tab-oee-colhedoras');
        if (!container) return;
        const g  = analysis.oeeGroups;
        const md = analysis.metadados || {};
        container.innerHTML = `
        <div class="oee-tab-wrapper">
            <div class="oee-header-bar">
                <h2><i class="fas fa-tractor"></i> OEE Colhedoras</h2>
                <div class="oee-modelo-badge">
                    ${analysis.hasTpl ? '✅ TPL Carregado' : '⚠️ Sem TPL — D = PROXY 1,0'}
                    · Modelo: OEE Operacional (D×P, Q=proxy)
                    · Período: ${analysis.nDias} dia(s)
                </div>
            </div>
            <div class="analytics-row">
                ${this._renderFallbackGroup('colh_propria',  g.colh_propria,  '🟢 Colhedoras Próprias (80x)',  '#40800c')}
                ${this._renderFallbackGroup('colh_terceira', g.colh_terceira, '🟠 Colhedoras Terceiras (93x)', '#FF8C00')}
            </div>
            <div class="section-title"><i class="fas fa-table"></i> Resumo por Grupo</div>
            ${this._renderComparativoFallback({ colh_propria: g.colh_propria, colh_terceira: g.colh_terceira }, analysis.nDias)}
            <div class="audit-note">
                <i class="fas fa-info-circle"></i>
                <strong>Auditoria:</strong> ${md.disponibilidadeNota || 'D=proxy'} |
                ${md.performanceNota || 'P=TMD/Ref'} |
                ${md.qualidadeNota   || 'Q=proxy'} |
                Calculado em: ${md.dataCalculo || new Date().toLocaleString('pt-BR')}
            </div>
        </div>`;
    }

    _renderAbaCaminhoesFallback(analysis) {
        const container = document.getElementById('tab-oee-caminhoes');
        if (!container) return;
        const g  = analysis.oeeGroups;
        const md = analysis.metadados || {};
        container.innerHTML = `
        <div class="oee-tab-wrapper">
            <div class="oee-header-bar">
                <h2><i class="fas fa-truck"></i> OEE Caminhões</h2>
                <div class="oee-modelo-badge">
                    ${analysis.hasTpl ? '✅ TPL Carregado' : '⚠️ Sem TPL — D = PROXY 1,0'}
                    · Modelo: OEE Operacional · Período: ${analysis.nDias} dia(s)
                </div>
            </div>
            <div class="analytics-row">
                ${this._renderFallbackGroup('cam_proprio',  g.cam_proprio,  '🔵 Caminhões Próprios (31x/32x)', '#00D4FF')}
                ${this._renderFallbackGroup('cam_terceiro', g.cam_terceiro, '🟣 Caminhões Terceiros (91x)',    '#7B61FF')}
            </div>
            <div class="section-title"><i class="fas fa-table"></i> Resumo por Grupo</div>
            ${this._renderComparativoFallback({ cam_proprio: g.cam_proprio, cam_terceiro: g.cam_terceiro }, analysis.nDias)}
            <div class="audit-note">
                <i class="fas fa-info-circle"></i>
                <strong>Auditoria:</strong> ${md.disponibilidadeNota || 'D=proxy'} |
                ${md.qualidadeNota || 'Q=proxy'} |
                Calculado em: ${md.dataCalculo || new Date().toLocaleString('pt-BR')}
            </div>
        </div>`;
    }

    _renderAbaComparativoFallback(analysis) {
        const container = document.getElementById('tab-comparativo-oee');
        if (!container) return;
        const g = analysis.oeeGroups;

        const ganhoTotal = Object.values(g).reduce((s, gr) => {
            const gap = ((gr.tmdRef || 0) - (gr.tmdReal || 0)) * (gr.nEquip || 0) * analysis.nDias;
            return s + Math.max(0, gap);
        }, 0);

        container.innerHTML = `
        <div class="oee-tab-wrapper">
            <div class="oee-header-bar">
                <h2><i class="fas fa-balance-scale"></i> Comparativo OEE — Executivo</h2>
            </div>
            <div class="ganho-destaque glass-card">
                <div class="ganho-icone">🚀</div>
                <div class="ganho-texto">
                    <strong>Ganho Potencial Estimado no Período</strong>
                    <span class="ganho-valor">${ganhoTotal > 0 ? ganhoTotal.toLocaleString('pt-BR',{maximumFractionDigits:0})+' t' : 'Calcule com TPL para resultado preciso'}</span>
                    <span class="ganho-sub">em ${analysis.nDias} dia(s), se todas as frotas atingirem o benchmark P90</span>
                </div>
            </div>
            <div class="analytics-card glass-card">
                <div class="card-header"><h3>Matriz Comparativa Completa</h3></div>
                ${this._renderComparativoFallback(g, analysis.nDias)}
            </div>
        </div>`;
    }

    _renderAbaGargalosFallback(analysis) {
        const container = document.getElementById('tab-gargalos');
        if (!container) return;
        container.innerHTML = `
        <div class="oee-tab-wrapper">
            <div class="oee-header-bar">
                <h2><i class="fas fa-exclamation-triangle"></i> Diagnóstico de Gargalos</h2>
                <div class="oee-modelo-badge">
                    ${analysis.hasTpl ? '✅ TPL disponível' : '⚠️ Gargalos estimados sem TPL — carregue TPL.csv para análise detalhada'}
                </div>
            </div>
            <div class="analytics-card glass-card">
                <div class="card-header">
                    <h3><i class="fas fa-times-circle" style="color:var(--danger,#FF2E63)"></i> Gargalos Detectados</h3>
                </div>
                ${this._renderFallbackGargalos(analysis.gargalos)}
            </div>
            ${!analysis.hasTpl ? `
            <div class="audit-note">
                <i class="fas fa-lightbulb" style="color:#FFB800"></i>
                <strong>Para gargalos detalhados por equipamento:</strong> carregue o arquivo TPL.csv
                (separador ponto-e-vírgula, coluna COD. EQUIPAMENTO obrigatória) na aba Gerenciar.
            </div>` : ''}
        </div>`;
    }

    _renderAbaEficFallback(analysis) {
        const container = document.getElementById('tab-eficiencia-operacional');
        if (!container) return;
        container.innerHTML = `
        <div class="oee-tab-wrapper">
            <div class="oee-header-bar">
                <h2><i class="fas fa-tachometer-alt"></i> Eficiência Operacional</h2>
                <div class="oee-modelo-badge">${analysis.hasTpl ? '✅ TPL disponível' : '⚠️ Sem TPL — dados limitados'}</div>
            </div>
            <div class="analytics-card glass-card">
                <div class="card-header"><h3>Resumo de Eficiência por Grupo</h3></div>
                ${this._renderComparativoFallback(analysis.oeeGroups, analysis.nDias)}
            </div>
            <div class="audit-note">
                <i class="fas fa-info-circle"></i>
                Análise detalhada de horas por categoria (Produtivo, Parada Op., Manutenção) requer TPL.csv.
                Valores acima baseados em TMD Real e Referência do período selecionado.
            </div>
        </div>`;
    }

    // ────────────────────────────────────────────────────────
    //  ENTRY POINT — renderAll
    //  Chamado pelo _runOEEAnalysis() no app.js como substituto
    //  ou complemento do VisualizerOEE existente.
    // ────────────────────────────────────────────────────────

    /**
     * Renderiza todas as 5 abas OEE.
     * Detecta automaticamente o contrato e delega adequadamente.
     *
     * @param {object} rawAnalysis - resultado direto do OEEAnalyzer.analyzeAll()
     *                               OU do Oee_analyzer.analyzeAll()
     */
    renderAll(rawAnalysis) {
        if (!rawAnalysis) {
            console.warn('[OEEUnifiedVisualizer] Análise vazia — abas OEE não renderizadas.');
            return;
        }

        try {
            // Tenta delegar ao VisualizerOEE existente (contrato completo)
            if (this._isLegacyContract(rawAnalysis) && typeof VisualizerOEE !== 'undefined') {
                // Já no formato esperado — VisualizerOEE renderiza diretamente.
                // O app.js já chama visualizerOEE.renderAbaOEE* etc.
                // Não precisa fazer nada aqui.
                console.log('[OEEUnifiedVisualizer] Contrato legacy detectado — delegando ao VisualizerOEE.');
                return;
            }

            // Contrato novo (OEEAnalyzer) — adapta e renderiza
            if (this._isNewContract(rawAnalysis)) {
                const adapted = this._adaptNewToLegacy(rawAnalysis);

                // Tenta usar VisualizerOEE com o contrato adaptado
                if (typeof VisualizerOEE !== 'undefined' && this.visualizer) {
                    const oeeRenderer = new VisualizerOEE(this.visualizer);
                    try {
                        oeeRenderer.renderAbaOEEColhedoras(adapted);
                        oeeRenderer.renderAbaOEECaminhoes(adapted);
                        oeeRenderer.renderAbaComparativoOEE(adapted);
                        oeeRenderer.renderAbaEficiencia(adapted);
                        oeeRenderer.renderAbaGargalos(adapted);
                        console.log('[OEEUnifiedVisualizer] Renderizado via VisualizerOEE (contrato adaptado).');
                        return;
                    } catch (e) {
                        console.warn('[OEEUnifiedVisualizer] VisualizerOEE falhou no contrato adaptado — usando fallback:', e.message);
                    }
                }

                // Fallback: renderização standalone
                this._renderAbaColhedorasFallback(rawAnalysis);
                this._renderAbaCaminhoesFallback(rawAnalysis);
                this._renderAbaComparativoFallback(rawAnalysis);
                this._renderAbaGargalosFallback(rawAnalysis);
                this._renderAbaEficFallback(rawAnalysis);
                console.log('[OEEUnifiedVisualizer] Renderizado via fallback standalone.');
                return;
            }

            console.warn('[OEEUnifiedVisualizer] Contrato de dados não reconhecido.', rawAnalysis);

        } catch (err) {
            console.error('[OEEUnifiedVisualizer] Erro na renderização:', err);
        }
    }
}

window.OEEUnifiedVisualizer = OEEUnifiedVisualizer;
console.log('[OEEUnifiedVisualizer] Registrado. Aceita contratos legacy (Oee_analyzer.js) e novo (data-analyzer-oee.js).');

} // end if typeof OEEUnifiedVisualizer === 'undefined'