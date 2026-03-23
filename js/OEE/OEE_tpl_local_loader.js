// =============================================================================
// OEE_tpl_local_loader.js  —  v1.0  (AgroAnalytics)
// =============================================================================
// RESPONSABILIDADE:
//   1. Ler um arquivo TPL.csv local (separador ";") via FileReader.
//   2. Parsear e normalizar as colunas para o formato canônico do OEEAnalyzer.
//   3. Filtrar apenas os GRUPOS DE EQUIPAMENTO relevantes ao relatório.
//   4. Classificar equipamentos por propriedade (próprio/terceiro) e tipo
//      usando os prefixos definidos pelo cliente.
//   5. Alimentar this.tplData no dashboard e disparar o pipeline OEE completo
//      (OEE_TPL_Analyzer → OEE_TPL_Analysis → OEE_TPL renderização).
//
// USO:
//   Instanciar uma vez e chamar attachToButton(dashboard, buttonId, inputId).
//   O módulo cria o <input type="file"> invisível e abre o seletor quando o
//   botão for clicado.
//
// PREFIXOS DE PROPRIEDADE (conforme especificação do cliente):
//   Frota motriz:       31 = próprio   |  91 = terceiro
//   Carreg./Colhedora:  80 = própria   |  93 = terceira
//   Trat. Transbordo:   92 = (somente terceiro conforme prefixo)
//
// GRUPOS RELEVANTES (filtro obrigatório — demais descartados):
//   COLHEDORA RESERVA, OFICINA,
//   FRENTE 08, FRENTE 10, FRENTE 11, FRENTE 13, FRENTE 14,
//   FRENTE 15, FRENTE 120, FRENTE 30, FRENTE 33, FRENTE 34, FRENTE 36,
//   CAMINHOES TERCEIROS, CANAVIEIROS, TRANSBORDOS - TERCEIROS
// =============================================================================

(function (global) {
    'use strict';

    // ── Grupos aceitos (normalizado para uppercase sem acentos) ──────────────
    const GRUPOS_VALIDOS = new Set([
        'COLHEDORA RESERVA', 'OFICINA',
        'FRENTE 08', 'FRENTE 10', 'FRENTE 11', 'FRENTE 13',
        'FRENTE 14', 'FRENTE 15', 'FRENTE 120',
        'FRENTE 30', 'FRENTE 33', 'FRENTE 34', 'FRENTE 36',
        'CAMINHOES TERCEIROS', 'CANAVIEIROS', 'TRANSBORDOS - TERCEIROS'
    ]);

    // ── Classificação de propriedade por prefixo ─────────────────────────────
    const PREFIX_MAP = [
        { prefixos: ['80','81','82','83','84','85'], tipo: 'colhedora', ownership: 'propria'   },
        { prefixos: ['93','94','95'],                tipo: 'colhedora', ownership: 'terceiro'  },
        { prefixos: ['31','32'],                     tipo: 'caminhao',  ownership: 'proprio'   },
        { prefixos: ['91'],                          tipo: 'caminhao',  ownership: 'terceiro'  },
        { prefixos: ['92'],                          tipo: 'transbordo',ownership: 'terceiro'  },
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

    // ── Parser de número seguro ──────────────────────────────────────────────
    function _toNum(v) {
        let s = String(v == null ? '' : v).trim().replace(/[^\d,.\-]/g,'');
        if ((s.match(/\./g)||[]).length > 1) s = s.replace(/\./g,'');
        s = s.replace(',','.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // ── Parser HH:MM:SS → decimal horas ─────────────────────────────────────
    function _parseHMS(val) {
        if (!val) return 0;
        const s = String(val).trim();
        const m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;
        return _toNum(val);
    }

    // ── Parser CSV com separador ponto-e-vírgula ─────────────────────────────
    // Suporta campos entre aspas contendo ";" ou quebras de linha.
    function _parseCsvSemicolon(text) {
        const lines = [];
        let cur = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') { inQ = !inQ; }
            else if (c === '\n' && !inQ) { lines.push(cur); cur = ''; }
            else if (c === '\r' && !inQ) { /* skip CR */ }
            else { cur += c; }
        }
        if (cur) lines.push(cur);

        if (lines.length === 0) return [];

        // cabeçalho
        const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,''));

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const vals = line.split(';').map(v => v.trim().replace(/^"|"$/g,''));
            const row = {};
            headers.forEach((h, j) => { row[h] = vals[j] !== undefined ? vals[j] : ''; });
            rows.push(row);
        }
        return rows;
    }

    // ── Normalização de nome de coluna ───────────────────────────────────────
    // O TPL.csv da Pitangueiras tem nomes canônicos exatos (conforme cabeçalho
    // compartilhado pelo cliente). Fazemos apenas fixação de encoding garbled.
    const ALIAS_MAP = {
        // Garbled encoding do DESC.OPERAÇÃO que aparece no arquivo
        'DESC.OPERAÃÂ¡ÃÂO'         : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃÂ‡ÃÂLO'        : 'DESC.OPERAÇÃO',
        'DESC.OPERAÇÃO'             : 'DESC.OPERAÇÃO', // forma correta
        'DESC.OPERACAO'             : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃƒâ€¡ÃƒÆ\'O'   : 'DESC.OPERAÇÃO',
        'DESC.OPERAÃ‡ÃO'            : 'DESC.OPERAÇÃO',
        // HRS OPERACIONAIS(SEC) pode vir com parênteses
        'HRS OPERACIONAIS(SEC)'     : 'HRS OPERACIONAIS(SEC)',
    };

    function _fixHeader(h) {
        const upper = h.toUpperCase().trim();
        return ALIAS_MAP[upper] || ALIAS_MAP[h] || h;
    }

    // ── Normalização da linha completa ───────────────────────────────────────
    function _normalizeRow(row) {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            out[_fixHeader(k)] = v;
        }
        return out;
    }

    // ── Filtro de GRUPO EQUIPAMENTO ──────────────────────────────────────────
    function _grupoValido(grupo) {
        if (!grupo) return false;
        const g = grupo.trim().toUpperCase();
        return GRUPOS_VALIDOS.has(g);
    }

    // ── Colunas de data: remove " 00:00:00" que é irrelevante ───────────────
    function _fixDate(v) {
        if (!v) return v;
        return String(v).replace(/\s00:00:00$/, '').trim();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CLASSE PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────────
    class OEE_TPL_LocalLoader {

        constructor() {
            this._dashboard = null;
            this._onLoad    = null;   // callback opcional
        }

        // ── API pública ──────────────────────────────────────────────────────

        /**
         * Vincula o loader ao dashboard e a um botão existente no HTML.
         *
         * @param {object} dashboard  - instância do AgriculturalDashboard (this em app.js)
         * @param {string} buttonId   - id do botão que abre o seletor de arquivo
         * @param {Function} [onLoad] - callback(tplRows) chamado após carregamento
         */
        attachToButton(dashboard, buttonId, onLoad) {
            this._dashboard = dashboard;
            this._onLoad    = onLoad || null;

            const btn = document.getElementById(buttonId);
            if (!btn) {
                console.warn('[TPL_Loader] Botão #' + buttonId + ' não encontrado.');
                return;
            }

            // Cria input file invisível
            let input = document.getElementById('_tplFileInput');
            if (!input) {
                input = document.createElement('input');
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
                input.value = ''; // permite re-selecionar o mesmo arquivo
            });

            console.log('[TPL_Loader] Vinculado ao botão #' + buttonId);
        }

        /**
         * Carrega um File (ou Blob) TPL.csv diretamente (drag-and-drop ou programático).
         */
        loadFile(file) {
            console.log('[TPL_Loader] Lendo arquivo:', file.name, '(' + (file.size / 1024).toFixed(0) + ' KB)');
            this._showToast('Lendo ' + file.name + '...', 'info', '📂 TPL');

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const rows = this._processText(e.target.result, file.name);
                    this._applyToSystem(rows);
                } catch (err) {
                    console.error('[TPL_Loader] Erro ao processar arquivo:', err);
                    this._showToast('Erro ao ler TPL: ' + err.message, 'error', 'TPL ❌');
                }
            };
            reader.onerror = () => {
                this._showToast('Não foi possível ler o arquivo.', 'error', 'TPL ❌');
            };
            reader.readAsText(file, 'UTF-8');
        }

        // ── Processamento interno ─────────────────────────────────────────────

        _processText(text, filename) {
            // 1. Parse CSV com separador ";"
            const rawRows = _parseCsvSemicolon(text);
            if (!rawRows.length) throw new Error('Arquivo vazio ou sem cabeçalho válido.');

            console.log('[TPL_Loader] ' + rawRows.length + ' linhas brutas | Colunas: ' +
                Object.keys(rawRows[0]).slice(0, 6).join(' | '));

            // 2. Normaliza encoding dos headers (DESC.OPERAÇÃO garbled, etc.)
            const normalized = rawRows.map(_normalizeRow);

            // 3. Filtra por GRUPO EQUIPAMENTO relevantes + equipamento válido
            let filtered = normalized.filter(row => {
                const cod   = String(row['COD. EQUIPAMENTO'] || '').trim();
                const grupo = String(row['GRUPO EQUIPAMENTO'] || '').trim();

                if (!cod || cod === '0') return false;
                // DATA/HORA LOCAL: desconsidera o horário 00:00:00 (é sempre meia-noite)
                row['DATA/HORA LOCAL'] = _fixDate(row['DATA/HORA LOCAL']);

                return _grupoValido(grupo);
            });

            // 4. Adiciona campo derivado _ownership e _tipo para facilitar análises
            filtered = filtered.map(row => {
                const cod  = String(row['COD. EQUIPAMENTO'] || '').trim();
                const cls  = _classifyEquip(cod);
                row._ownership = cls.ownership;
                row._tipo      = cls.tipo;
                return row;
            });

            console.log('[TPL_Loader] ' + filtered.length + ' linhas após filtro de GRUPO. ' +
                (rawRows.length - filtered.length) + ' descartadas.');

            // 5. Log de amostra
            if (filtered.length > 0) {
                this._logSummary(filtered);
            }

            return filtered;
        }

        _logSummary(rows) {
            const grupos    = new Map();
            const equips    = new Set();
            const ownership = { propria: 0, terceiro: 0, proprio: 0, outro: 0 };

            rows.forEach(r => {
                const g = String(r['GRUPO EQUIPAMENTO'] || '').trim();
                grupos.set(g, (grupos.get(g) || 0) + 1);
                equips.add(String(r['COD. EQUIPAMENTO'] || '').trim());
                const ow = r._ownership || 'outro';
                ownership[ow] = (ownership[ow] || 0) + 1;
            });

            console.log('[TPL_Loader] Resumo:');
            console.log('  Equipamentos únicos:', equips.size);
            console.log('  Propriedade:', JSON.stringify(ownership));
            console.log('  Grupos:', [...grupos.entries()]
                .sort((a,b) => b[1]-a[1])
                .map(([g,n]) => g + '(' + n + ')').join(', '));
        }

        _applyToSystem(rows) {
            const dash = this._dashboard;

            if (!dash) {
                console.error('[TPL_Loader] Dashboard não vinculado. Chame attachToButton() primeiro.');
                return;
            }

            // Armazena no dashboard
            dash.tplData = rows;

            this._showToast(
                rows.length + ' registros TPL carregados · ' +
                new Set(rows.map(r => r['COD. EQUIPAMENTO'])).size + ' equipamentos únicos',
                'success', 'TPL ✅'
            );

            // ── Dispara pipeline OEE ────────────────────────────────────────

            // A) Motor analítico leve (OEE_TPL_Analyzer — spec v6.9.5)
            if (global.OEE_TPL_Analyzer) {
                try {
                    const result = global.OEE_TPL_Analyzer.analisar(rows);
                    console.log('[TPL_Loader] OEE_TPL_Analyzer →',
                        'OEE:'  + (result.oee.oee  * 100).toFixed(1) + '%',
                        '| D:'  + (result.oee.disponibilidade * 100).toFixed(1) + '%',
                        '| P:'  + (result.oee.performance     * 100).toFixed(1) + '%',
                        '| Q:'  + (result.oee.qualidade       * 100).toFixed(1) + '%',
                        '| Validação:', JSON.stringify(result._validacao)
                    );
                    // Armazena para uso posterior (ex: tab Moagem)
                    dash._tplOeeResult = result;
                } catch(e) {
                    console.warn('[TPL_Loader] OEE_TPL_Analyzer falhou:', e.message);
                }
            }

            // B) Motor analítico completo (OEE_TPL_Analysis — spec exclusiva TPL)
            if (global.OEE_TPL_Analysis) {
                try {
                    const analysis = global.OEE_TPL_Analysis.analyze(rows);
                    console.log('[TPL_Loader] OEE_TPL_Analysis →',
                        'OEE:'  + (analysis.oee.oee  * 100).toFixed(1) + '%',
                        '| Equip:' + analysis._meta.equipamentos,
                        '| Validação:', JSON.stringify(analysis._meta.validacao)
                    );
                    if (dash.analysisResult) dash.analysisResult.tplAnalysis = analysis;
                } catch(e) {
                    console.warn('[TPL_Loader] OEE_TPL_Analysis falhou:', e.message);
                }
            }

            // C) Renderização das abas OEE (OEE_TPL_Renderer)
            if (global.OEE_TPL) {
                try {
                    global.OEE_TPL.renderColhedoras(rows);
                    global.OEE_TPL.renderCaminhoes(rows);
                    global.OEE_TPL.renderComparativo(rows);
                    global.OEE_TPL.renderGargalos(rows);
                    console.log('[TPL_Loader] Abas OEE renderizadas com sucesso.');
                } catch(e) {
                    console.warn('[TPL_Loader] OEE_TPL render falhou:', e.message);
                }
            }

            // D) Dispara análise OEE unificada (se OEEAnalyzer do dashboard estiver disponível)
            if (dash._runOEEAnalysis) {
                try {
                    dash._runOEEAnalysis();
                } catch(e) {
                    console.warn('[TPL_Loader] _runOEEAnalysis falhou:', e.message);
                }
            }

            // E) Callback externo (se fornecido)
            if (this._onLoad) {
                try { this._onLoad(rows, dash._tplOeeResult); } catch(e) {}
            }
        }

        // ── Toast helper ─────────────────────────────────────────────────────
        _showToast(msg, type, title) {
            const dash = this._dashboard;
            if (dash && dash._showToastSafe) {
                dash._showToastSafe(msg, type, title);
            } else {
                console.log('[TPL_Loader]', title, '—', msg);
            }
        }
    }

    // ── API pública estática de conveniência ─────────────────────────────────
    // Permite parsear um CSV sem instanciar a classe (útil para testes unitários).
    OEE_TPL_LocalLoader.parseRaw = function(csvText) {
        return _parseCsvSemicolon(csvText)
            .map(_normalizeRow)
            .filter(row => {
                const cod   = String(row['COD. EQUIPAMENTO'] || '').trim();
                const grupo = String(row['GRUPO EQUIPAMENTO'] || '').trim();
                if (!cod || cod === '0') return false;
                row['DATA/HORA LOCAL'] = _fixDate(row['DATA/HORA LOCAL']);
                return _grupoValido(grupo);
            })
            .map(row => {
                const cls = _classifyEquip(String(row['COD. EQUIPAMENTO'] || '').trim());
                row._ownership = cls.ownership;
                row._tipo      = cls.tipo;
                return row;
            });
    };

    OEE_TPL_LocalLoader.GRUPOS_VALIDOS  = GRUPOS_VALIDOS;
    OEE_TPL_LocalLoader.classifyEquip   = _classifyEquip;

    global.OEE_TPL_LocalLoader = OEE_TPL_LocalLoader;
    console.log('[OEE_TPL_LocalLoader] Módulo registrado.');

})(window);