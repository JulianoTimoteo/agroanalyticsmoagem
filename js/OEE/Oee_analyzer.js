// oee-analyzer.js
// ============================================================
// MOTOR ANALÍTICO DE OEE E TMD
// Aplica modelo OEE adaptado ao contexto agro-operacional.
//
// MODELO ADOTADO (documentado):
//   OEE = Disponibilidade × Performance × Qualidade
//
//   Disponibilidade (D):
//     Fonte primária (se TPL disponível):
//       D = HRS_PRODUTIVAS / HRS_MOTOR_LIGADO
//     Proxy operacional (sem TPL, usando Producao.xlsx):
//       D = 1.0  → marcado como PROXY, sinalizado no dashboard
//     Nota: HRS_MOTOR_LIGADO = referência de tempo disponível (motor ligado)
//
//   Performance (P):
//     P = TMD_Real / TMD_Referencia
//     TMD_Referencia = percentil 90 da distribuição do grupo no período,
//                      OU meta de TMD da planilha Metas (quando disponível).
//     Unidade: ton/máquina/dia
//
//   Qualidade (Q):
//     Colhedoras: Não há dado de perdas/rejeição nas bases disponíveis.
//                 Q = 1.0 (PROXY EXPLÍCITO) → OEE exibido como "OEE Operacional"
//     Caminhões:  Não há dado de entrega não-conforme.
//                 Q = 1.0 (PROXY EXPLÍCITO) → OEE exibido como "OEE Operacional"
//
//   NOTA: OEE Completo (com Q real) ficará disponível quando a base
//         tiver coluna de perdas/rejeição/divergência de carga.
//
// TMD:
//   TMD_Real      = Ton_período / n_equip_ativos / n_dias
//   TMD_Potencial = TMD_Referencia (benchm. p90) × n_equip_previsto
//   TMD_Ajustado  = TMD_Referencia × OEE_Operacional
// ============================================================

if (typeof OEEAnalyzer === 'undefined') {

    class OEEAnalyzer {

        constructor() {
            this.HORAS_DIA_REFERENCIA = 24; // Horas disponíveis no período base
            this.HORAS_SAFRA_DIA      = 20; // Horas efetivas de operação (desconta intervalo)
        }

        // ── PARSING DE HORAS ────────────────────────────────────

        /**
         * Converte "HH:MM:SS" ou "HH:MM" para horas decimais.
         * Retorna 0 em caso de falha (jamais NaN ou negativo).
         */
        _parseHMS(val) {
            if (!val && val !== 0) return 0;
            if (typeof val === 'number') return Math.max(0, val);
            const s = String(val).trim();
            if (!s || s === '' || s === '-') return 0;

            // Formato Excel/Sheets datetime: "30/12/1899 HH:MM:SS" ou "1899-12-30 HH:MM:SS"
            // O Google Sheets serializa horas puras assim — extraímos só a parte HH:MM:SS
            let m = s.match(/\d{1,4}[\/-]\d{1,2}[\/-]\d{2,4}\s+(\d{1,3}):(\d{2})(?::(\d{2}))?/);
            if (m) {
                const h = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;
                return Math.max(0, h);
            }

            // Formato HH:MM:SS ou HH:MM puro
            m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
            if (m) {
                const h = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;
                return Math.max(0, h);
            }

            // Coluna HRS OPERACIONAIS(SEC) — valor em segundos
            const n = parseFloat(s.replace(',', '.'));
            if (!isNaN(n)) {
                if (n > 3600) return n / 3600;  // segundos → horas
                if (n > 24)   return n / 60;     // minutos → horas
                return Math.max(0, n);
            }

            return 0;
        }

        /**
         * Parse robusto de número BR ou US.
         */
        _num(val, def = 0) {
            if (typeof val === 'number') return isNaN(val) ? def : val;
            if (!val) return def;
            let s = String(val).trim().replace(/\s/g, '');
            if (s.includes(',') && s.includes('.')) {
                s = s.lastIndexOf(',') > s.lastIndexOf('.') ?
                    s.replace(/\./g, '').replace(',', '.') :
                    s.replace(/,/g, '');
            } else if (s.includes(',')) {
                s = s.replace(',', '.');
            }
            const n = parseFloat(s);
            return isNaN(n) ? def : n;
        }

        // ── PROCESSAMENTO DO TPL ─────────────────────────────────

        /**
         * Agrega dados do TPL por equipamento e data.
         * Retorna Map<codEquipamento, { hrsOp, hrsMotor, hrsProdutivas,
         *   hrsParadaOp, hrsParadaMec, hrsImprodutivo, hrsDeslocamento,
         *   dias: Set<string>, ops: Map<descOp, horas> }>
         *
         * @param {Array} tplRows - Linhas já parseadas do TPL (sep ;)
         */
        aggregateTPL(tplRows) {
            if (!tplRows || tplRows.length === 0) return new Map();

            const map = new Map();
            const firstRow = tplRows[0] || {};
            const keys = Object.keys(firstRow);

            // Localiza colunas por candidatos (parcial, case-insensitive)
            const _col = (...cands) => {
                for (const c of cands) {
                    const cu = c.toUpperCase().replace(/[^A-Z0-9]/g,' ').trim();
                    const found = keys.find(k => {
                        const ku = k.toUpperCase().replace(/[^A-Z0-9]/g,' ').trim();
                        return ku === cu || ku.includes(cu) || cu.includes(ku);
                    });
                    if (found) return found;
                }
                return null;
            };

            const COL_COD    = _col('COD. EQUIPAMENTO','COD EQUIPAMENTO','EQUIPAMENTO','EQUIP','COD.EQUIPAMENTO','CODIGO');
            const COL_DATA   = _col('DATA/HORA LOCAL','DATA HORA LOCAL','DATA/HORA','DATA APONTAMENTO','DATA','DT APONTAMENTO');
            const COL_DESCOP = _col('DESC.OPERAÇÃO','DESC OPERAÇÃO','DESC.OPERACAO','DESC OPERACAO','OPERACAO','OPERAÇÃO','DESCRICAO OPERACAO');
            const COL_CODOP  = _col('COD.OPERAÇÃO','COD OPERACAO','COD OPERAÇÃO','CODIGO OPERACAO');
            const COL_HRSOP  = _col('HRS OPERACIONAIS','HRS. OPERACIONAIS','HORAS OPERACIONAIS','HRS.OPERACIONAIS','HORA OPERACIONAL','HORAS');
            const COL_HRSMOT = _col('HRS MOTOR LIGADO','HRS. MOTOR LIGADO','HORAS MOTOR LIGADO','HRS.MOTOR LIGADO','MOTOR LIGADO');
            // Formato consolidado ColConD1: Disp %, Ton. Cana, etc.
            const COL_DISP   = _col('DISP %','DISP%','DISPONIBILIDADE','DISP. %','DISPONIBILIDADE %');
            const COL_TON    = _col('TON. CANA','TON CANA','TONELADAS','PESO','TON.');
            const COL_DIAS   = _col('DIAS TRAB','DIAS TRABALHADOS','QTDE DIAS','QTD DIAS');

            console.log('[OEEAnalyzer] aggregateTPL → colunas detectadas:',
                `COD=${COL_COD} | DATA=${COL_DATA} | DESCOP=${COL_DESCOP} | HRSOP=${COL_HRSOP} | HRSMOT=${COL_HRSMOT} | DISP=${COL_DISP}`);
            console.log('[OEEAnalyzer] Linha de exemplo:', JSON.stringify(firstRow));

            if (!COL_COD) {
                console.warn('[OEEAnalyzer] Coluna de equipamento não encontrada. Colunas:', keys.join(' | '));
                return new Map();
            }

            // Detecta se é formato DETALHADO (por operação) ou CONSOLIDADO (por equipamento)
            const isDetalhado = !!(COL_HRSOP || COL_HRSMOT);
            const isConsolidado = !!(COL_DISP && !isDetalhado);
            console.log(`[OEEAnalyzer] Formato TPL detectado: ${isDetalhado ? 'DETALHADO (apontamento por operação)' : isConsolidado ? 'CONSOLIDADO (disp% direto)' : 'DESCONHECIDO'}`);

            let _dc = 0;

            // ── FILTRO: ignora equipamentos de preparo de solo (prefixo 11xxx) ──
            // Grupos que NÃO são colheita — só aparecem na entressafra
            const GRUPOS_EXCLUIR = ['PREPARO','PREP SOLO','PREPARO DE SOLO','IMPLEMENTO'];
            const COL_GRUPO = _col('GRUPO EQUIPAMENTO','GRUPO EQUIP','GRUPO');

            tplRows.forEach(row => {
                const cod = (row[COL_COD] || '').toString().trim();
                if (!cod || cod === '0') return;

                // Filtra por GRUPO EQUIPAMENTO — exclui preparo de solo
                if (COL_GRUPO) {
                    const grupo = (row[COL_GRUPO] || '').toString().toUpperCase().trim();
                    if (GRUPOS_EXCLUIR.some(g => grupo.includes(g))) return;
                }
                // Fallback: exclui por prefixo de código (11xxx = tratores de preparo)
                // Mantém: 80-85 (colh própria), 92-95 (colh terceira), 31 (cam próprio), 91 (cam terceiro)
                const prefixo = cod.substring(0, 2);
                const prefixoNum = parseInt(prefixo);
                if (!isNaN(prefixoNum) && prefixoNum >= 11 && prefixoNum <= 29) {
                    // 11xxx-29xxx = tratores/implementos de preparo — ignora
                    return;
                }

                if (_dc < 2) {
                    console.log(`[OEEAnalyzer] TPL sample[${_dc}]:`, JSON.stringify(row));
                    _dc++;
                }

                if (!map.has(cod)) {
                    map.set(cod, {
                        cod, hrsOp: 0, hrsMotor: 0,
                        hrsProdutivas: 0, hrsParadaOp: 0, hrsParadaMec: 0,
                        hrsImprodutivo: 0, hrsDeslocamento: 0, hrsOutro: 0,
                        dias: new Set(), ops: new Map(),
                        // Para formato consolidado
                        dispPct: null, tonCana: 0, diasTrab: 0, _isConsolidado: false
                    });
                }

                const entry = map.get(cod);

                if (isDetalhado) {
                    // ── FORMATO DETALHADO: apontamento por operação ──────────────
                    const data    = COL_DATA  ? (row[COL_DATA]  || '').toString().trim().slice(0, 10) : '';
                    const descOp     = COL_DESCOP ? (row[COL_DESCOP] || '').trim() : '';
                    const codOp      = COL_CODOP  ? (row[COL_CODOP]  || '').trim() : '';
                    const descGrupo  = (row['DESC.GRUPO OPERAC.'] || row['GRUPO OPERACAO'] || '').trim();
                    const estado     = (row['ESTADO'] || '').trim().toUpperCase();
                    // Tenta usar a descrição decodificada corretamente (pode ter encoding UTF-8 corrompido)
                    const descOpReal = (row['DESC.OPERAÇÃO'] || row['DESC.OPERAÃ‡ÃO'] || row['DESC.OPERAÃƒO'] || row['DESC.OPERACAO'] || descOp || '').trim();
                    const hrsOp   = COL_HRSOP  ? this._parseHMS(row[COL_HRSOP])  : 0;
                    const hrsMot  = COL_HRSMOT ? this._parseHMS(row[COL_HRSMOT]) : 0;
                    // Usa coluna em segundos como fallback se disponível e hrsOp=0
                    const hrsOpSec = row['HRS OPERACIONAIS(SEC)'] ? parseFloat(row['HRS OPERACIONAIS(SEC)']) / 3600 : 0;
                    const hrsMotSec = row['HRS MOTOR LIGADO(SEC)'] ? parseFloat(row['HRS MOTOR LIGADO(SEC)']) / 3600 : 0;
                    const hrsOpFinal  = hrsOp  > 0 ? hrsOp  : hrsOpSec;
                    const hrsMotFinal = hrsMot > 0 ? hrsMot : hrsMotSec;

                    if (data) entry.dias.add(data);
                    entry.hrsOp    += hrsOpFinal;
                    entry.hrsMotor += hrsMotFinal;

                    // Classifica usando múltiplas fontes em ordem de confiabilidade:
                    // 1. Descrição real da operação (melhor)
                    // 2. Grupo operacional (Produtivas / Improdutivas / Manutenção)
                    // 3. ESTADO (M=manutenção, F=funcional/parado, E=executando)
                    let cat = OEEFleetClassifier.classifyTPLOperation(descOpReal);
                    if (cat === 'outro') {
                        const grp = descGrupo.toUpperCase();
                        if (grp.includes('PRODUTIV')) cat = 'produtivo';
                        else if (grp.includes('IMPRODUTIV') || grp.includes('PARADA OP')) cat = 'parada_operacional';
                        else if (grp.includes('MANUT') || grp.includes('MECANI')) cat = 'parada_mecanica';
                        else if (grp.includes('DESLOC')) cat = 'deslocamento';
                    }
                    if (cat === 'outro' && estado) {
                        if (estado === 'M') cat = 'parada_mecanica';
                        else if (estado === 'E') cat = 'produtivo';
                        else if (estado === 'F') cat = 'improdutivo';
                        else if (estado === 'D') cat = 'deslocamento';
                    }
                    const label = descOpReal || descGrupo || codOp;
                    switch (cat) {
                        case 'produtivo':          entry.hrsProdutivas   += hrsOp; break;
                        case 'parada_operacional': entry.hrsParadaOp     += hrsOp; break;
                        case 'parada_mecanica':    entry.hrsParadaMec    += hrsOp; break;
                        case 'improdutivo':        entry.hrsImprodutivo  += hrsOp; break;
                        case 'deslocamento':       entry.hrsDeslocamento += hrsOp; break;
                        default:                   entry.hrsOutro        += hrsOp;
                    }
                    const prev = entry.ops.get(label) || 0;
                    entry.ops.set(label, prev + hrsOp);

                } else if (isConsolidado || COL_DISP) {
                    // ── FORMATO CONSOLIDADO: uma linha por equipamento com Disp% direto ──
                    entry._isConsolidado = true;
                    const rawDisp = (row[COL_DISP] || '').toString().replace('%','').replace(',','.').trim();
                    const disp = parseFloat(rawDisp);
                    if (!isNaN(disp)) {
                        // Disp% pode vir como 91.52 (percentual) ou 0.9152 (fração)
                        entry.dispPct = disp > 1 ? disp / 100 : disp;
                    }
                    if (COL_TON) {
                        entry.tonCana += this._num(row[COL_TON]);
                    }
                    if (COL_DIAS) {
                        entry.diasTrab += this._num(row[COL_DIAS]);
                    }
                    // Simula hrsMotor para compatibilidade: assume 24h*diasTrab como motor ligado
                    // e hrsParadaMec proporcional a (1 - disp)
                    if (entry.dispPct !== null) {
                        const diasRef = this._num(row[COL_DIAS] || 1);
                        const hrsTotal = diasRef * 24;
                        entry.hrsMotor  += hrsTotal;
                        entry.hrsParadaMec += hrsTotal * (1 - entry.dispPct);
                        entry.hrsProdutivas += hrsTotal * entry.dispPct;
                        entry.hrsOp += hrsTotal;
                    }
                }
            });

            console.log(`[OEEAnalyzer] aggregateTPL: ${map.size} equipamentos agregados (preparo/11xxx filtrados)`);
            if (map.size > 0) {
                const sample = map.values().next().value;
                console.log('[OEEAnalyzer] Sample entry:', JSON.stringify({
                    cod: sample.cod, hrsOp: sample.hrsOp.toFixed(2),
                    hrsMotor: sample.hrsMotor.toFixed(2), dispPct: sample.dispPct,
                    isConsolidado: sample._isConsolidado
                }));
            }

            return map;
        }

        // ── DISPONIBILIDADE ──────────────────────────────────────

        /**
         * Calcula disponibilidade de um equipamento.
         * Hierarquia de confiança:
         *   1. TPL com motor ligado como denominador (mais confiável)
         *   2. TPL sem motor ligado: usa hrsProdutivas / hrsOp
         *   3. Sem TPL: retorna PROXY = null (sinalizado pelo chamador)
         *
         * @param {Object} tplEntry - Entrada do mapa TPL para este equip
         * @returns {{ disp: number|null, isProxy: boolean, formula: string }}
         */
        calcDisponibilidade(tplEntry) {
            if (!tplEntry) {
                return { disp: null, isProxy: true, formula: 'SEM DADO TPL — proxy=N/A' };
            }

            // Formato CONSOLIDADO: dispPct já calculado diretamente
            if (tplEntry._isConsolidado && tplEntry.dispPct !== null) {
                return {
                    disp: tplEntry.dispPct,
                    isProxy: false,
                    formula: `Disp% direto do relatório consolidado: ${(tplEntry.dispPct * 100).toFixed(2)}%`
                };
            }

            const { hrsMotor, hrsProdutivas, hrsOp, hrsParadaMec } = tplEntry;

            // Fonte 1: motor ligado como denominador
            if (hrsMotor > 0) {
                const hrsDisponivel = hrsMotor - hrsParadaMec;
                const d = Math.max(0, Math.min(1, hrsDisponivel / hrsMotor));
                return {
                    disp: d,
                    isProxy: false,
                    formula: `(HrsMotor - HrsParadaMec) / HrsMotor = (${hrsMotor.toFixed(2)} - ${hrsParadaMec.toFixed(2)}) / ${hrsMotor.toFixed(2)}`
                };
            }

            // Fonte 2: hrsOp como denominador
            if (hrsOp > 0) {
                const hrsDisponivel = hrsOp - hrsParadaMec;
                const d = Math.max(0, Math.min(1, hrsDisponivel / hrsOp));
                return {
                    disp: d,
                    isProxy: false,
                    formula: `(HrsOp - HrsParadaMec) / HrsOp = (${hrsOp.toFixed(2)} - ${hrsParadaMec.toFixed(2)}) / ${hrsOp.toFixed(2)}`
                };
            }

            return { disp: null, isProxy: true, formula: 'SEM HRS MOTOR — proxy=N/A' };
        }

        // ── TMD ──────────────────────────────────────────────────

        /**
         * Calcula TMD real por equipamento e por grupo.
         *
         * @param {Array}  prodRows  - Linhas de produção filtradas (sem agregações)
         * @param {number} nDias     - Dias do período
         * @param {string} category  - 'colh_propria' | 'colh_terceira' | 'cam_proprio' | 'cam_terceiro'
         * @returns {Object} { byEquip: Map, group: {tmd, ton, nEquip, nDias}, ranking }
         */
        calcTMD(prodRows, nDias, category) {
            if (!prodRows || prodRows.length === 0 || nDias <= 0) {
                return { byEquip: new Map(), group: this._emptyGroup(nDias), ranking: [] };
            }

            const equipMap = new Map();

            prodRows.forEach(row => {
                const clf = OEEFleetClassifier.classifyProductionRow(row);
                if (clf !== category) return;

                const peso    = this._num(row.peso);
                const viagem  = String(row.viagem || row.idViagem || '').trim();
                const frente  = String(row.frente || '').trim();

                // Detecta identificador principal (colhedora ou caminhão)
                let id = '';
                if (category.startsWith('colh')) {
                    const e1 = String(row.equipamento || (Array.isArray(row.equipamentos) ? row.equipamentos[0] : '') || '').trim();
                    const e2 = String((Array.isArray(row.equipamentos) ? row.equipamentos[1] : '') || '').trim();
                    const e3 = String((Array.isArray(row.equipamentos) ? row.equipamentos[2] : '') || '').trim();
                    // Distribui o peso entre as colhedoras da viagem
                    const equips = [e1, e2, e3].filter(e => OEEFleetClassifier.isColhedora(e));
                    if (equips.length === 0) return;
                    const pesoDistribuido = peso / equips.length;
                    equips.forEach(e => {
                        if (!equipMap.has(e)) equipMap.set(e, { ton: 0, viagens: new Set(), frentes: new Set() });
                        const en = equipMap.get(e);
                        en.ton += pesoDistribuido;
                        en.viagens.add(viagem);
                        en.frentes.add(frente);
                    });
                    return;
                } else {
                    id = String(row.frota || '').trim();
                    if (!id) return;
                    if (!equipMap.has(id)) equipMap.set(id, { ton: 0, viagens: new Set(), frentes: new Set() });
                    const en = equipMap.get(id);
                    en.ton += peso;
                    en.viagens.add(viagem);
                    en.frentes.add(frente);
                }
            });

            // Monta resultado por equipamento
            const byEquip = new Map();
            let totalTon = 0;
            equipMap.forEach((data, id) => {
                const tmd = data.ton / nDias;
                byEquip.set(id, {
                    id,
                    ton: data.ton,
                    nViagens: data.viagens.size,
                    frentes: Array.from(data.frentes),
                    tmdReal: tmd,
                    nDias
                });
                totalTon += data.ton;
            });

            const nEquip = byEquip.size;
            const groupTMD = nEquip > 0 ? totalTon / nEquip / nDias : 0;

            // Ranking
            const ranking = Array.from(byEquip.values())
                .sort((a, b) => b.tmdReal - a.tmdReal)
                .map((item, idx) => ({ ...item, rank: idx + 1 }));

            // Benchmarks
            const tmds = ranking.map(r => r.tmdReal);
            const p90 = this._percentile(tmds, 0.90);
            const p50 = this._percentile(tmds, 0.50);

            return {
                byEquip,
                group: {
                    category,
                    tmdReal: groupTMD,
                    ton: totalTon,
                    nEquip,
                    nDias,
                    p90,
                    p50,
                    formula: `Ton_total(${totalTon.toFixed(0)}t) / n_equip(${nEquip}) / n_dias(${nDias})`
                },
                ranking
            };
        }

        /**
         * Calcula TMD Potencial e TMD Ajustado por OEE para o grupo.
         *
         * @param {Object} tmdGroup     - Saída de calcTMD().group
         * @param {number} oeeGroup     - OEE do grupo (0-1)
         * @param {number} metaTMD      - Meta de TMD da planilha Metas (ou null)
         * @returns {Object} { tmdPotencialTecnico, tmdPotencialMeta, tmdAjustadoOEE }
         */
        calcTMDPotencial(tmdGroup, oeeGroup, metaTMD = null) {
            // Potencial técnico = p90 dos melhores (benchmark interno)
            const tmdPotencialTecnico = tmdGroup.p90 || tmdGroup.tmdReal;

            // Potencial operacional meta = meta da planilha (quando disponível)
            const tmdPotencialMeta = metaTMD && metaTMD > 0 ? metaTMD : tmdPotencialTecnico;

            // Ajustado = Referência × OEE
            const oee = (oeeGroup >= 0 && oeeGroup <= 1) ? oeeGroup : 0;
            const tmdAjustadoOEE = tmdPotencialMeta * oee;

            return {
                tmdPotencialTecnico,
                tmdPotencialMeta,
                tmdAjustadoOEE,
                oeeUsado: oee,
                metaFonte: metaTMD ? 'planilha_metas' : 'benchmark_p90',
                formula: `TMD_Ref(${tmdPotencialMeta.toFixed(0)}) × OEE(${(oee * 100).toFixed(1)}%) = ${tmdAjustadoOEE.toFixed(0)} t/maq/dia`
            };
        }

        // ── OEE POR EQUIPAMENTO ──────────────────────────────────

        /**
         * Calcula OEE individual de um equipamento.
         * Se não há TPL para este equipamento, D é proxy.
         *
         * @param {Object} tplEntry   - Entrada TPL ou null
         * @param {number} tmdReal    - TMD real do equipamento
         * @param {number} tmdRef     - TMD de referência (benchmark)
         * @returns {Object} oeeResult
         */
        calcOEEEquip(tplEntry, tmdReal, tmdRef) {
            const dispResult = this.calcDisponibilidade(tplEntry);
            const disp = dispResult.disp !== null ? dispResult.disp : null;

            // Performance = TMD_Real / TMD_Ref (limitado a 1.0)
            const perf = tmdRef > 0 ? Math.min(1, tmdReal / tmdRef) : null;

            // Qualidade: PROXY = 1.0 (sem dado real de perdas)
            const qual = 1.0;
            const qualProxy = true;

            // OEE Operacional (sem qualidade real)
            let oeeOp = null;
            if (disp !== null && perf !== null) {
                oeeOp = disp * perf * qual;
                oeeOp = Math.max(0, Math.min(1, oeeOp));
            }

            return {
                disponibilidade: disp,
                dispIsProxy: dispResult.isProxy,
                dispFormula: dispResult.formula,

                performance: perf,
                perfFormula: tmdRef > 0 ? `TMD_Real(${tmdReal.toFixed(0)}) / TMD_Ref(${tmdRef.toFixed(0)})` : 'SEM REF',

                qualidade: qual,
                qualIsProxy: qualProxy,
                qualNota: 'PROXY=1.0 — dado de perdas não disponível nas bases atuais',

                oeeOperacional: oeeOp,
                oeeCompleto: null, // Só disponível quando Q for real
                isOEEProxy: dispResult.isProxy || qualProxy,
                tipo: 'OEE Operacional',

                hrsMotor: tplEntry ? tplEntry.hrsMotor : null,
                hrsProdutivas: tplEntry ? tplEntry.hrsProdutivas : null,
                hrsParadaMec: tplEntry ? tplEntry.hrsParadaMec : null,
                hrsParadaOp:  tplEntry ? tplEntry.hrsParadaOp  : null,
                hrsImprodutivo: tplEntry ? tplEntry.hrsImprodutivo : null,

                topOps: tplEntry ? this._topOps(tplEntry.ops, 5) : []
            };
        }

        /**
         * Calcula OEE médio do grupo.
         * @param {Array} equipOEEs - Array de objetos oeeResult por equipamento
         */
        calcOEEGroup(equipOEEs) {
            const validos = equipOEEs.filter(e => e.oeeOperacional !== null);
            if (validos.length === 0) {
                return {
                    oeeOperacional: null, disponibilidade: null, performance: null,
                    qualidade: 1.0, qualIsProxy: true, nEquip: 0,
                    tipo: 'OEE Operacional', isProxy: true
                };
            }

            const avg = key => validos.reduce((s, e) => s + (e[key] || 0), 0) / validos.length;

            return {
                oeeOperacional: avg('oeeOperacional'),
                disponibilidade: avg('disponibilidade'),
                performance: avg('performance'),
                qualidade: 1.0,
                qualIsProxy: true,
                nEquip: validos.length,
                nEquipSemTPL: equipOEEs.length - validos.length,
                tipo: 'OEE Operacional',
                isProxy: validos.some(e => e.isOEEProxy)
            };
        }

        // ── ORQUESTRADOR PRINCIPAL ────────────────────────────────

        /**
         * Ponto de entrada: recebe dados de produção e TPL, retorna
         * análise completa de OEE/TMD para os 4 grupos.
         *
         * @param {Array}  filteredProdRows  - Linhas de produção já filtradas
         * @param {Array}  tplRawRows        - Linhas brutas do TPL (parseadas)
         * @param {number} nDias             - Número de dias do período
         * @param {Map}    metasMap          - Mapa de metas por frente (de DataAnalyzerMetas)
         * @returns {Object} oeeAnalysis
         */
        analyzeAll(filteredProdRows, tplRawRows, nDias, metasMap) {
            const hasTpl = tplRawRows && tplRawRows.length > 0;

            // 1. Agrega TPL
            const tplAgg = hasTpl ? this.aggregateTPL(tplRawRows) : new Map();

            // Diagnóstico e validação de compatibilidade TPL × Produção
            if (hasTpl && tplAgg.size > 0) {
                const tplKeys = Array.from(tplAgg.keys()).slice(0, 8);
                console.log(`[OEEAnalyzer] tplAgg: ${tplAgg.size} equip. Amostra: ${tplKeys.join(', ')}`);

                // Verifica se há interseção entre TPL e produção
                const prodEquips = new Set(filteredProdRows.slice(0, 500).map(r =>
                    String(r.equipamento || r.frota || (Array.isArray(r.equipamentos) ? r.equipamentos[0] : '') || '').trim()
                ).filter(Boolean));
                const intersection = Array.from(tplAgg.keys()).filter(k => prodEquips.has(k));
                if (intersection.length === 0) {
                    console.warn('[OEEAnalyzer] ⚠️ MISMATCH: nenhum equipamento do TPL coincide com a produção!');
                    console.warn(`  TPL equip: ${tplKeys.join(', ')}`);
                    console.warn(`  Prod equip: ${[...prodEquips].slice(0,8).join(', ')}`);
                    console.warn('  → Execute migrarTPL() no GAS para incluir os meses da safra (TPL_08_2025, TPL_09_2025, etc.)');
                    // Adiciona flag no resultado para exibir aviso na UI
                    this._tplMismatch = true;
                } else {
                    this._tplMismatch = false;
                    console.log(`[OEEAnalyzer] ✅ TPL × Prod: ${intersection.length} equipamentos em comum`);
                }
            } else if (hasTpl) {
                console.warn('[OEEAnalyzer] aggregateTPL vazio com', tplRawRows.length, 'linhas.');
            }

            // 2. TMD para os 4 grupos
            const categories = ['colh_propria','colh_terceira','cam_proprio','cam_terceiro'];
            const tmdResults = {};
            categories.forEach(cat => {
                tmdResults[cat] = this.calcTMD(filteredProdRows, nDias, cat);
            });

            // 3. TMD referência: p90 do grupo (benchmark interno)
            const getRef = (cat) => tmdResults[cat].group.p90 || tmdResults[cat].group.tmdReal;

            // 4. OEE por equipamento em cada grupo
            const oeeByEquip = {};
            categories.forEach(cat => {
                const ref = getRef(cat);
                oeeByEquip[cat] = [];

                tmdResults[cat].ranking.forEach(item => {
                    const tplEntry = tplAgg.get(item.id) || null;
                    const oee = this.calcOEEEquip(tplEntry, item.tmdReal, ref);
                    oeeByEquip[cat].push({ ...item, ...oee });
                });
            });

            // 5. OEE de grupo
            const oeeGroups = {};
            categories.forEach(cat => {
                oeeGroups[cat] = this.calcOEEGroup(oeeByEquip[cat]);
            });

            // 6. TMD Potencial e Ajustado
            const tmdPotencial = {};
            categories.forEach(cat => {
                const oee = oeeGroups[cat].oeeOperacional || 0;
                tmdPotencial[cat] = this.calcTMDPotencial(
                    tmdResults[cat].group,
                    oee,
                    null // meta de TMD por frente pode ser integrada futuramente
                );
            });

            // 7. Diagnóstico automático
            const diagnostico = this._generateDiagnostico(oeeGroups, tmdResults, tmdPotencial, hasTpl);

            // 8. Gargalos (top perdas)
            const gargalos = this._extractGargalos(oeeByEquip, tplAgg);

            return {
                tmd: tmdResults,
                oeeByEquip,
                oeeGroups,
                tmdPotencial,
                diagnostico,
                gargalos,
                hasTpl,
                nDias,
                metadados: {
                    dataCalculo: new Date().toLocaleString('pt-BR'),
                    modeloOEE: 'OEE Operacional (D×P×Q_proxy)',
                    qualidadeNota: 'Q=1.0 proxy — dado de perdas não disponível',
                    disponibilidadeNota: hasTpl
                        ? 'D calculado via TPL (HrsMotor - HrsParadaMec) / HrsMotor'
                        : 'D não calculável — TPL não carregado. Exibindo proxy.',
                    performanceNota: 'P = TMD_Real / TMD_Referencia (p90 interno)',
                    prefixosAtivos: {
                        colh_propria: '80', colh_terceira: '93',
                        cam_proprio: '31', cam_terceiro: '91'
                    }
                }
            };
        }

        // ── DIAGNÓSTICO AUTOMÁTICO ───────────────────────────────

        _generateDiagnostico(oeeGroups, tmdResults, tmdPotencial, hasTpl) {
            const insights = [];

            const fmt  = (n) => n != null ? (n * 100).toFixed(1) + '%' : 'N/D';
            const fmtT = (n) => n != null ? n.toFixed(0) + ' t/maq/dia' : 'N/D';

            // Comparativo colhedoras
            const cp = oeeGroups.colh_propria;
            const ct = oeeGroups.colh_terceira;
            const tmdCp = tmdResults.colh_propria.group;
            const tmdCt = tmdResults.colh_terceira.group;

            if (cp.oeeOperacional != null && ct.oeeOperacional != null) {
                const diff = cp.oeeOperacional - ct.oeeOperacional;
                if (Math.abs(diff) > 0.05) {
                    const melhor = diff > 0 ? 'própria' : 'terceira';
                    insights.push({
                        id: 'colh_oee_comp',
                        tipo: 'comparativo',
                        icone: '📊',
                        texto: `A frota ${melhor} de colhedoras apresenta OEE superior (${fmt(Math.max(cp.oeeOperacional,ct.oeeOperacional))} vs ${fmt(Math.min(cp.oeeOperacional,ct.oeeOperacional))}).`
                    });
                }
            }

            if (cp.disponibilidade != null && ct.disponibilidade != null) {
                if (Math.abs(cp.disponibilidade - ct.disponibilidade) > 0.08) {
                    const baixa = cp.disponibilidade < ct.disponibilidade ? 'própria' : 'terceira';
                    insights.push({
                        id: 'colh_disp_gap',
                        tipo: 'alerta',
                        icone: '⚠️',
                        texto: `A frota ${baixa} de colhedoras tem disponibilidade inferior — o gap é principalmente mecânico, não de performance.`
                    });
                }
            }

            if (tmdCp.tmdReal > 0 && tmdCt.tmdReal > 0) {
                const ganho = Math.abs(tmdCp.tmdReal - tmdCt.tmdReal);
                insights.push({
                    id: 'tmd_gap',
                    tipo: 'oportunidade',
                    icone: '🎯',
                    texto: `Gap de TMD entre frota própria (${fmtT(tmdCp.tmdReal)}) e terceira (${fmtT(tmdCt.tmdReal)}): ${fmtT(ganho)} por máquina por dia.`
                });
            }

            // Ganho potencial colhedoras se igualar benchmark
            ['colh_propria','colh_terceira'].forEach(cat => {
                const pot = tmdPotencial[cat];
                const real = tmdResults[cat].group.tmdReal;
                const nEquip = tmdResults[cat].group.nEquip;
                if (pot && real > 0 && pot.tmdPotencialTecnico > real) {
                    const ganhoDia = (pot.tmdPotencialTecnico - real) * nEquip;
                    const label = cat === 'colh_propria' ? 'próprias' : 'terceiras';
                    insights.push({
                        id: `ganho_${cat}`,
                        tipo: 'oportunidade',
                        icone: '🚀',
                        texto: `Se as colhedoras ${label} atingirem o benchmark p90 (${fmtT(pot.tmdPotencialTecnico)}), o ganho potencial é de ${ganhoDia.toFixed(0)} t/dia adicionais.`
                    });
                }
            });

            // Caminhões
            const camprop = tmdResults.cam_proprio.group;
            const camterc = tmdResults.cam_terceiro.group;
            if (camprop.tmdReal > 0 && camterc.tmdReal > 0) {
                const ratio = camprop.tmdReal / camterc.tmdReal;
                if (ratio > 1.2) {
                    insights.push({
                        id: 'cam_prod_gap',
                        tipo: 'comparativo',
                        icone: '🚛',
                        texto: `Caminhões próprios entregam ${((ratio-1)*100).toFixed(0)}% mais toneladas/dia que terceiros. Investigar ciclo e fila dos terceiros.`
                    });
                } else if (ratio < 0.85) {
                    insights.push({
                        id: 'cam_prod_gap',
                        tipo: 'comparativo',
                        icone: '🚛',
                        texto: `Caminhões terceiros entregam mais toneladas/dia que próprios (${((1/ratio - 1)*100).toFixed(0)}% a mais). Avaliar capacidade de carga e raio.`
                    });
                }
            }

            if (!hasTpl) {
                insights.push({
                    id: 'sem_tpl',
                    tipo: 'aviso',
                    icone: '📋',
                    texto: 'Arquivo TPL não carregado. Disponibilidade não calculável — OEE exibido usa proxy D=N/D. Carregue o TPL para análise completa.'
                });
            }

            return insights;
        }

        // ── GARGALOS ─────────────────────────────────────────────

        _extractGargalos(oeeByEquip, tplAgg) {
            const gargalos = [];

            // Top 10 máquinas com menor OEE (com TPL)
            const todasMaquinas = [];
            Object.entries(oeeByEquip).forEach(([cat, equips]) => {
                equips.forEach(e => {
                    if (e.oeeOperacional != null) {
                        todasMaquinas.push({ ...e, categoria: cat });
                    }
                });
            });

            todasMaquinas.sort((a, b) => a.oeeOperacional - b.oeeOperacional);

            const top10Criticos = todasMaquinas.slice(0, 10).map(e => ({
                id: e.id,
                categoria: e.categoria,
                oee: e.oeeOperacional,
                disponibilidade: e.disponibilidade,
                tmdReal: e.tmdReal,
                topCausa: e.topOps[0] ? e.topOps[0].desc : 'N/A',
                horasCausa: e.topOps[0] ? e.topOps[0].horas : 0,
                prioridade: e.oeeOperacional < 0.4 ? 'CRÍTICA' : e.oeeOperacional < 0.6 ? 'ALTA' : 'MÉDIA'
            }));

            // Operações que mais consomem horas improdutivas (de todo o TPL)
            const opTotais = new Map();
            tplAgg.forEach((entry) => {
                entry.ops.forEach((h, desc) => {
                    const cat = OEEFleetClassifier.classifyTPLOperation(desc);
                    if (cat !== 'produtivo') {
                        opTotais.set(desc, (opTotais.get(desc) || 0) + h);
                    }
                });
            });

            const topPerdas = Array.from(opTotais.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([desc, horas]) => ({
                    descOperacao: desc,
                    horasTotais: horas,
                    categoria: OEEFleetClassifier.classifyTPLOperation(desc),
                    impactoEstimado: `${horas.toFixed(1)}h acumuladas no período`
                }));

            return { top10Criticos, topPerdas };
        }

        // ── AUXILIARES ───────────────────────────────────────────

        _percentile(arr, p) {
            if (!arr || arr.length === 0) return 0;
            const sorted = [...arr].filter(v => v > 0).sort((a, b) => a - b);
            if (sorted.length === 0) return 0;
            const idx = Math.floor(sorted.length * p);
            return sorted[Math.min(idx, sorted.length - 1)];
        }

        _topOps(opsMap, n) {
            if (!opsMap) return [];
            return Array.from(opsMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, n)
                .map(([desc, horas]) => ({ desc, horas, categoria: OEEFleetClassifier.classifyTPLOperation(desc) }));
        }

        _emptyGroup(nDias) {
            return { tmdReal: 0, ton: 0, nEquip: 0, nDias, p90: 0, p50: 0, formula: 'SEM DADOS' };
        }
    }

    window.OEEAnalyzer = OEEAnalyzer;
    console.log('[OEEAnalyzer] Registrado.');
}
