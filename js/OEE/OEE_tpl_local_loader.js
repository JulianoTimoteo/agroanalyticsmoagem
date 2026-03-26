// =============================================================================
// OEE_tpl_local_loader.js  —  v3.0  (AgroAnalytics)
// =============================================================================
// RESPONSABILIDADE:
//   1. Ler arquivo TPL.csv local (separador ";") via FileReader.
//   2. Parsear e normalizar colunas — inclusive encoding garbled de DESC.OPERAÇÃO.
//   3. Filtrar por GRUPO EQUIPAMENTO (whitelist obrigatória).
//   4. Rejeitar prefixos inválidos (grupos 40, fertirrigação, herbicida, etc.).
//   5. Limpar DATA/HORA LOCAL — ignorar parte 00:00:00.
//   6. Disparar pipeline OEE completo com opções de filtro temporal.
//
// PREFIXOS VÁLIDOS:
//   80–85 = Colhedora Própria   | 93–95 = Colhedora Terceira
//   31–32 = Caminhão Próprio    | 91    = Caminhão Terceiro
//   92    = Transbordo Terceiro
//
// GRUPOS DESCARTADOS (além da whitelist):
//   Fertirrigação, Tratos Culturais, Herbicida, Linha Amarela,
//   Grupo 40, Preparo de Solo, Adubação — e qualquer não listado.
// =============================================================================

(function (global) {
    'use strict';

    // ── Whitelist de grupos válidos (normalizada — sem acentos, uppercase) ────
    const GRUPOS_VALIDOS = new Set([
        'COLHEDORA RESERVA', 'OFICINA',
        'FRENTE 08', 'FRENTE 10', 'FRENTE 11', 'FRENTE 13', 'FRENTE 14', 'FRENTE 15',
        'FRENTE 30', 'FRENTE 33', 'FRENTE 34', 'FRENTE 36', 'FRENTE 120',
        // variantes sem zero à esquerda e históricas
        'FRENTE 8', 'FRENTE 9', 'FRENTE 12', 'FRENTE 16', 'FRENTE 17',
        'FRENTE 18', 'FRENTE 19', 'FRENTE 20', 'FRENTE 37',
        // caminhões
        'CAMINHOES TERCEIROS', 'CAMINHOES PROPRIOS',
        'CANAVIEIROS',
        // transbordos
        'TRANSBORDOS - TERCEIROS', 'TRANSBORDOS TERCEIROS', 'TRANSBORDO',
    ]);

    // ── Padrões proibidos (descarte imediato) ─────────────────────────────────
    const GRUPOS_PROIBIDOS = [
        /fertilirrig/i, /fertirreg/i, /fertirriga/i,
        /tratos\s*cultur/i, /^tratos$/i,
        /herbicida/i,
        /linha\s*amarela/i,
        /preparo\s*de?\s*solo/i,
        /aduba/i,
        /grupo\s*40/i, /^40\b/,
    ];

    function _normalizeGrupo(g) {
        return String(g || '').toUpperCase().trim()
            .replace(/[ÀÁÂÃÄ]/g, 'A').replace(/[ÈÉÊË]/g, 'E')
            .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÕÖ]/g, 'O')
            .replace(/[ÚÙÛÜ]/g, 'U').replace(/Ç/g, 'C');
    }

    function _grupoValido(grupoRaw) {
        if (!grupoRaw) return false;
        const raw = String(grupoRaw).trim();
        for (const re of GRUPOS_PROIBIDOS) {
            if (re.test(raw)) return false;
        }
        const g = _normalizeGrupo(raw);
        if (GRUPOS_VALIDOS.has(g)) return true;
        if (/^FRENTE\s+\d+$/.test(g)) return true;
        if (/CAMINH(AO|OE)/i.test(g)) return true;
        if (/TRANSBORDO/i.test(g)) return true;
        if (/CANAVIER/i.test(g)) return true;
        return false;
    }

    // ── Classificação de equipamento por prefixo ──────────────────────────────
    const PREFIX_MAP = [
        { prefixos: ['80','81','82','83','84','85'], tipo: 'colhedora',  ownership: 'propria'  },
        { prefixos: ['93','94','95'],                tipo: 'colhedora',  ownership: 'terceiro' },
        { prefixos: ['31','32'],                     tipo: 'caminhao',   ownership: 'proprio'  },
        { prefixos: ['91'],                          tipo: 'caminhao',   ownership: 'terceiro' },
        { prefixos: ['92'],                          tipo: 'transbordo', ownership: 'terceiro' },
    ];

    function _classifyEquip(cod) {
        const s = String(cod || '').trim();
        for (const rule of PREFIX_MAP) {
            if (rule.prefixos.some(p => s.startsWith(p))) {
                return { tipo: rule.tipo, ownership: rule.ownership };
            }
        }
        return { tipo: 'outro', ownership: 'outro' };
    }

    // ── Mapa de aliases de encoding garbled ──────────────────────────────────
    // Cobre todas as variações conhecidas de DESC.OPERAÇÃO corrompidas por
    // diferentes encodings (UTF-8 mal interpretado como Latin-1, etc.)
    const ALIAS_MAP = {
        // Variantes garbled de DESC.OPERAÇÃO
        'DESC.OPERAÃÂ¡ÃÂO'               : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃÂ‡ÃÂLO'              : 'DESC.OPERAÇÃO',
        'DESC.OPERAÇÃO'                   : 'DESC.OPERAÇÃO',
        'DESC.OPERACAO'                   : 'DESC.OPERAÇÃO',
        "DESC.OPERAÃƒâ€¡ÃƒÆ'O"           : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃ‡ÃO'                  : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃÂ‡ÃÂO'               : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃ†Ã'                   : 'DESC.OPERAÇÃO',
        'DESC OPERACAO'                   : 'DESC.OPERAÇÃO',
        'DESC OPERAÇÃO'                   : 'DESC.OPERAÇÃO',
        'DESCRICAO OPERACAO'              : 'DESC.OPERAÇÃO',
        'DESCRICAO_OPERACAO'              : 'DESC.OPERAÇÃO',
        // HRS OPERACIONAIS(SEC) — parênteses às vezes vêm corrompidos
        'HRS OPERACIONAIS(SEC)'           : 'HRS OPERACIONAIS(SEC)',
        'HRS OPERACIONAIS SEC'            : 'HRS OPERACIONAIS(SEC)',
        'HRS. OPERACIONAIS(SEC)'          : 'HRS OPERACIONAIS(SEC)',
        // GRUPO OPERAC variante
        'DESC.GRUPO OPERAC.'              : 'DESC.GRUPO OPERAC.',
        'DESC GRUPO OPERAC'               : 'DESC.GRUPO OPERAC.',
        'DESC.GRUPO OPERACIONAL'          : 'DESC.GRUPO OPERAC.',
    };

    function _fixHeader(h) {
        const trimmed = h.trim();
        // Tentativa exata primeiro
        if (ALIAS_MAP[trimmed])         return ALIAS_MAP[trimmed];
        // Tentativa uppercase
        const upper = trimmed.toUpperCase();
        if (ALIAS_MAP[upper])           return ALIAS_MAP[upper];
        // Tentativa normalizada
        const norm = _normalizeGrupo(trimmed);
        if (ALIAS_MAP[norm])            return ALIAS_MAP[norm];
        return trimmed;
    }

    function _normalizeRow(row) {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            out[_fixHeader(k)] = v;
        }
        return out;
    }

    // ── Limpeza de DATA/HORA LOCAL ────────────────────────────────────────────
    // Regra: ignorar completamente o horário 00:00:00
    // Formato de entrada: "DD/MM/YYYY 00:00:00" → saída: "DD/MM/YYYY"
    function _fixDate(v) {
        if (!v) return v;
        // Remove " 00:00:00" ou " HH:MM:SS" (qualquer horário — o campo é sempre data)
        return String(v).replace(/\s+\d{1,2}:\d{2}:\d{2}$/, '').trim();
    }

    // ── Parser CSV separador ";" com suporte a campos entre aspas ────────────
    function _parseCsvSemicolon(text) {
        const lines = [];
        let cur = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') { inQ = !inQ; }
            else if (c === '\n' && !inQ) { lines.push(cur); cur = ''; }
            else if (c === '\r' && !inQ) { /* ignora CR */ }
            else { cur += c; }
        }
        if (cur.trim()) lines.push(cur);

        if (lines.length === 0) return [];

        const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows    = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const vals = line.split(';').map(v => v.trim().replace(/^"|"$/g, ''));
            const row  = {};
            headers.forEach((h, j) => { row[h] = vals[j] !== undefined ? vals[j] : ''; });
            rows.push(row);
        }
        return rows;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CLASSE PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────────
    class OEE_TPL_LocalLoader {

        constructor() {
            this._dashboard = null;
            this._onLoad    = null;
        }

        /**
         * Vincula o loader a um botão existente no HTML.
         * @param {object}   dashboard  - instância do AgriculturalDashboard
         * @param {string}   buttonId   - id do botão que abre o seletor
         * @param {Function} [onLoad]   - callback(tplRows, oeeResult) após carga
         */
        attachToButton(dashboard, buttonId, onLoad) {
            this._dashboard = dashboard;
            this._onLoad    = onLoad || null;

            const btn = document.getElementById(buttonId);
            if (!btn) {
                console.warn('[TPL_Loader v3] Botão #' + buttonId + ' não encontrado.');
                return;
            }

            let input = document.getElementById('_tplFileInput');
            if (!input) {
                input           = document.createElement('input');
                input.type      = 'file';
                input.id        = '_tplFileInput';
                input.accept    = '.csv,.txt';
                input.style.display = 'none';
                document.body.appendChild(input);
            }

            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) this.loadFile(file);
                input.value = '';
            });

            console.log('[TPL_Loader v3] Vinculado ao botão #' + buttonId);
        }

        /**
         * Carrega File/Blob TPL.csv diretamente.
         */
        loadFile(file) {
            console.log('[TPL_Loader v3] Lendo:', file.name, '(' + (file.size / 1024).toFixed(0) + ' KB)');
            this._showToast('Lendo ' + file.name + '...', 'info', '📂 TPL');

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const rows = this._processText(e.target.result, file.name);
                    this._applyToSystem(rows);
                } catch (err) {
                    console.error('[TPL_Loader v3] Erro ao processar:', err);
                    this._showToast('Erro ao ler TPL: ' + err.message, 'error', 'TPL ❌');
                }
            };
            reader.onerror = () => this._showToast('Não foi possível ler o arquivo.', 'error', 'TPL ❌');
            reader.readAsText(file, 'UTF-8');
        }

        // ── Processamento interno ─────────────────────────────────────────────

        _processText(text, filename) {
            // 1. Parse CSV
            const rawRows = _parseCsvSemicolon(text);
            if (!rawRows.length) throw new Error('Arquivo vazio ou sem cabeçalho válido.');

            console.log('[TPL_Loader v3]', rawRows.length, 'linhas brutas | Colunas:',
                Object.keys(rawRows[0]).slice(0, 8).join(' | '));

            // 2. Normaliza headers (encoding garbled, aliases)
            const normalized = rawRows.map(_normalizeRow);

            // 3. Filtra: GRUPO EQUIPAMENTO válido + COD. EQUIPAMENTO com prefixo aceito
            let totalDescartados = 0;
            const filtered = normalized.filter(row => {
                const cod   = String(row['COD. EQUIPAMENTO'] || '').trim();
                const grupo = String(row['GRUPO EQUIPAMENTO'] || '').trim();

                // Rejeita linha sem código
                if (!cod || cod === '0') { totalDescartados++; return false; }

                // Limpa DATA/HORA LOCAL — remove horário 00:00:00
                if (row['DATA/HORA LOCAL']) {
                    row['DATA/HORA LOCAL'] = _fixDate(row['DATA/HORA LOCAL']);
                }

                // Rejeita grupo fora da whitelist (inclui grupo 40, fertirrigação, etc.)
                if (!_grupoValido(grupo)) { totalDescartados++; return false; }

                // Rejeita prefixo de equipamento desconhecido
                const clf = _classifyEquip(cod);
                if (clf.tipo === 'outro') { totalDescartados++; return false; }

                return true;
            });

            // 4. Adiciona campos derivados _ownership e _tipo
            filtered.forEach(row => {
                const cod  = String(row['COD. EQUIPAMENTO'] || '').trim();
                const cls  = _classifyEquip(cod);
                row._ownership = cls.ownership;
                row._tipo      = cls.tipo;
            });

            console.log(
                `[TPL_Loader v3] ${filtered.length} linhas válidas | ` +
                `${totalDescartados} descartadas (grupo inválido / prefixo desconhecido)`
            );

            if (totalDescartados > 0) {
                console.warn(`[OEE ALERTA] ${totalDescartados} linhas descartadas no loader | arquivo: ${filename}`);
            }

            this._logSummary(filtered);
            return filtered;
        }

        _logSummary(rows) {
            const grupos    = new Map();
            const equips    = new Set();
            const ownership = { propria: 0, terceiro: 0, proprio: 0, outro: 0 };

            rows.forEach(r => {
                const g  = String(r['GRUPO EQUIPAMENTO'] || '').trim();
                const ow = r._ownership || 'outro';
                grupos.set(g, (grupos.get(g) || 0) + 1);
                equips.add(String(r['COD. EQUIPAMENTO'] || '').trim());
                ownership[ow] = (ownership[ow] || 0) + 1;
            });

            console.log('[TPL_Loader v3] Resumo:',
                `Equip. únicos: ${equips.size} |`,
                `Propriedade: ${JSON.stringify(ownership)} |`,
                'Grupos:', [...grupos.entries()].sort((a, b) => b[1] - a[1])
                    .slice(0, 8).map(([g, n]) => `${g}(${n})`).join(', ')
            );
        }

        _applyToSystem(rows) {
            const dash = this._dashboard;
            if (!dash) {
                console.error('[TPL_Loader v3] Dashboard não vinculado. Chame attachToButton() primeiro.');
                return;
            }

            // Armazena no dashboard
            dash.tplData = rows;

            this._showToast(
                `${rows.length} registros TPL · ${new Set(rows.map(r => r['COD. EQUIPAMENTO'])).size} equipamentos`,
                'success', 'TPL ✅'
            );

            // ── A) Motor analítico v3 (OEE_TPL_Analysis — fonte única de verdade) ──
            if (global.OEE_TPL_Analysis) {
                try {
                    const analysis = global.OEE_TPL_Analysis.analyze(rows);
                    console.log('[TPL_Loader v3] OEE_TPL_Analysis →',
                        `OEE:${(analysis.oee.oee * 100).toFixed(1)}%`,
                        `D:${(analysis.oee.disponibilidade * 100).toFixed(1)}%`,
                        `P:${(analysis.oee.performance * 100).toFixed(1)}%`,
                        `Q:${(analysis.oee.qualidade * 100).toFixed(1)}%`,
                        `| Consumo:${analysis.consumo.consumoLhReal ? analysis.consumo.consumoLhReal.toFixed(1) + ' L/h' : 'N/D'}`,
                        `| Validação:`, analysis.meta.validacao
                    );

                    // Armazena para acesso global
                    dash._tplAnalysis  = analysis;
                    if (dash.analysisResult) dash.analysisResult.tplAnalysis = analysis;

                    // ── Renderiza abas OEE ────────────────────────────────────
                    if (global.renderOEEFromTPL) {
                        // Tenta todos os container IDs conhecidos
                        const containers = [
                            'oee-colhedoras-content',
                            'oee-caminhoes-content',
                            'oee-comparativo-content',
                            'oee-gargalos-content',
                            'oee-tpl-content',
                        ];
                        let rendered = false;
                        for (const cid of containers) {
                            if (document.getElementById(cid)) {
                                global.renderOEEFromTPL(cid, analysis, rows);
                                rendered = true;
                                break;
                            }
                        }
                        if (!rendered) {
                            console.warn('[TPL_Loader v3] Nenhum container OEE encontrado.');
                        }
                    }
                } catch (e) {
                    console.warn('[TPL_Loader v3] OEE_TPL_Analysis falhou:', e.message);
                }
            }

            // ── B) Motor analítico leve (OEE_TPL_Analyzer — wrapper v6.9.5) ──
            if (global.OEE_TPL_Analyzer) {
                try {
                    const result = global.OEE_TPL_Analyzer.analisar(rows);
                    console.log('[TPL_Loader v3] OEE_TPL_Analyzer →',
                        `OEE:${(result.oee.oee * 100).toFixed(1)}%`,
                        '| Validação:', JSON.stringify(result._validacao)
                    );
                    dash._tplOeeResult = result;
                } catch (e) {
                    console.warn('[TPL_Loader v3] OEE_TPL_Analyzer falhou:', e.message);
                }
            }

            // ── C) Pipeline legado OEE_TPL (renderColhedoras, etc.) ───────────
            if (global.OEE_TPL) {
                try {
                    global.OEE_TPL.renderColhedoras(rows);
                    global.OEE_TPL.renderCaminhoes(rows);
                    global.OEE_TPL.renderComparativo(rows);
                    global.OEE_TPL.renderGargalos(rows);
                    console.log('[TPL_Loader v3] OEE_TPL legado renderizado.');
                } catch (e) {
                    console.warn('[TPL_Loader v3] OEE_TPL render falhou:', e.message);
                }
            }

            // ── D) Análise OEE unificada do dashboard ─────────────────────────
            if (dash._runOEEAnalysis) {
                try { dash._runOEEAnalysis(); } catch (e) {
                    console.warn('[TPL_Loader v3] _runOEEAnalysis falhou:', e.message);
                }
            }

            // ── E) Callback externo ───────────────────────────────────────────
            if (this._onLoad) {
                try { this._onLoad(rows, dash._tplAnalysis); } catch (e) {}
            }
        }

        _showToast(msg, type, title) {
            const dash = this._dashboard;
            if (dash && dash._showToastSafe) {
                dash._showToastSafe(msg, type, title);
            } else {
                console.log('[TPL_Loader v3]', title, '—', msg);
            }
        }
    }

    // ── API estática de conveniência (parse sem instanciar) ───────────────────
    OEE_TPL_LocalLoader.parseRaw = function (csvText) {
        return _parseCsvSemicolon(csvText)
            .map(_normalizeRow)
            .filter(row => {
                const cod   = String(row['COD. EQUIPAMENTO'] || '').trim();
                const grupo = String(row['GRUPO EQUIPAMENTO'] || '').trim();
                if (!cod || cod === '0') return false;
                if (row['DATA/HORA LOCAL']) row['DATA/HORA LOCAL'] = _fixDate(row['DATA/HORA LOCAL']);
                if (!_grupoValido(grupo)) return false;
                const clf = _classifyEquip(cod);
                return clf.tipo !== 'outro';
            })
            .map(row => {
                const cls = _classifyEquip(String(row['COD. EQUIPAMENTO'] || '').trim());
                row._ownership = cls.ownership;
                row._tipo      = cls.tipo;
                return row;
            });
    };

    OEE_TPL_LocalLoader.GRUPOS_VALIDOS = GRUPOS_VALIDOS;
    OEE_TPL_LocalLoader.classifyEquip  = _classifyEquip;
    OEE_TPL_LocalLoader.grupoValido    = _grupoValido;

    global.OEE_TPL_LocalLoader = OEE_TPL_LocalLoader;
    console.log('[OEE_TPL_LocalLoader v3] Módulo registrado.');

})(window);