/**
 * OEE_tpl_analyzer.js — v3.0 AgroAnalytics
 * Wrapper leve sobre OEE_TPL_Analysis.analyze()
 * Expõe window.OEE_TPL_Analyzer para compatibilidade com código legado.
 *
 * REGRAS APLICADAS (PROMPT MESTRE v3.0):
 *   - Fonte de horas: HRS OPERACIONAIS(SEC)/3600 (primário)
 *   - Filtro de frota: prefixos 80–85, 93–95, 31–32, 91, 92
 *   - Filtro de grupo: whitelist obrigatória, descarta grupo 40, fertirrigação, etc.
 *   - Data: DATA/HORA LOCAL apenas (sem UTC, sem horário 00:00:00)
 *   - Consumo: Σlitros/ΣhrsMotor (ponderado) — NUNCA ColConAcm bruto
 *   - Validação: OEE ∈ [0,1], sem NaN, sem negativos
 */
(function (global) {
    'use strict';

    /* ─── parser seguro (mantido para compatibilidade interna) ─────────────── */
    function _toNum(v) {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        let s = String(v).trim().replace(/[^\d,.\-]/g, '');
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
        s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    /* ─── localiza coluna por candidatos ──────────────────────────────────── */
    function _col(row, candidates) {
        for (const c of candidates) {
            const k = Object.keys(row).find(k => k.trim().toUpperCase() === c.toUpperCase());
            if (k !== undefined && row[k] !== undefined && row[k] !== '') return row[k];
        }
        return null;
    }

    /* ─── classificação de linha TPL (espelha OEE_TPL_Analysis v3) ──────────
     * Precedência: MECANICO > PREVENTIVO > PRODUTIVO > IMPRODUTIVO > CLIMATICO > INDET
     */
    function _classificar(row) {
        const grupo = String(_col(row, ['DESC.GRUPO OPERAC.', 'DESC GRUPO OPERAC', 'GRUPO OPERAC']) || '').toLowerCase().trim();
        const op    = String(_col(row, ['DESC.OPERAÇÃO', 'DESC.OPERACAO', 'DESC OPERACAO', 'DESC OPERAÇÃO',
                                        "DESC.OPERAÃƒâ€¡ÃƒÆ'O", 'DESC.OPERAÃ‡ÃO',
                                        'DESC.OPERAÃÂ¡ÃÂO', 'DESCRICAO OPERACAO']) || '').toLowerCase().trim();

        if (/manuten|quebra|oficina|mecan|borrachar|lavagem|lubri|aguard.*mecanic/i.test(op)) return 'MECANICO';
        if (/preventiv/i.test(op))                                                             return 'PREVENTIVO';
        if (/produtiv/i.test(grupo) && !/improdutiv/i.test(grupo))                            return 'PRODUTIVO';
        if (/improdutiv/i.test(grupo))                                                         return 'IMPRODUTIVO';
        if (/clim/i.test(grupo))                                                               return 'CLIMATICO';
        if (/manut|mecani/i.test(grupo))                                                       return 'MECANICO';
        if (/prev/i.test(grupo))                                                               return 'PREVENTIVO';
        return 'INDETERMINADO';
    }

    /* ─── classificação de propriedade por prefixo ─────────────────────────── */
    function _ownership(codEquip) {
        const s = String(codEquip || '').trim();
        if (/^(80|81|82|83|84|85)/.test(s)) return 'propria';
        if (/^(93|94|95)/.test(s))          return 'terceiro';
        if (/^(31|32)/.test(s))             return 'proprio';
        if (/^91/.test(s))                  return 'terceiro';
        if (/^92/.test(s))                  return 'transbordo';
        return 'outros';
    }

    /* ─── filtro de grupo (rejeita grupo 40, fertirrigação, etc.) ─────────── */
    const _GRUPOS_PROIBIDOS = [
        /fertilirrig/i, /fertirreg/i, /fertirriga/i,
        /tratos\s*cultur/i, /^tratos$/i,
        /herbicida/i, /linha\s*amarela/i,
        /preparo\s*de?\s*solo/i, /aduba/i,
        /grupo\s*40/i, /^40\b/,
    ];

    function _grupoAceito(grpEquip) {
        if (!grpEquip) return true;  // sem grupo → não rejeita aqui (OEE_TPL_Analysis cuida)
        for (const re of _GRUPOS_PROIBIDOS) {
            if (re.test(grpEquip)) return false;
        }
        return true;
    }

    /* ─── validação final ──────────────────────────────────────────────────── */
    function _validar(r) {
        const t   = r.tempos;
        const soma = t.produtivo + t.improdutivo + t.mecanico + t.climatico + t.preventivo + t.indeterminado;
        r._validacao = {
            somaOkBool : Math.abs(soma - r._tempoTotal) <= 1,
            soma,
            total      : r._tempoTotal,
            oeeValido  : r.oee.oee >= 0 && r.oee.oee <= 1,
            semNaN     : !Object.values(r.oee).some(v => typeof v === 'number' && isNaN(v)) &&
                         !Object.values(r.tempos).some(v => typeof v === 'number' && isNaN(v)),
            semNegativo: Object.values(r.tempos).every(v => typeof v !== 'number' || v >= 0),
        };
        return r;
    }

    /* ─── função principal ─────────────────────────────────────────────────── */
    function analisarTPL(tplRows) {
        if (!Array.isArray(tplRows) || tplRows.length === 0) {
            return _validar(_estruturaVazia());
        }

        // Se OEE_TPL_Analysis v3 estiver disponível, delega para ele (fonte única)
        if (global.OEE_TPL_Analysis && typeof global.OEE_TPL_Analysis.analyze === 'function') {
            const full = global.OEE_TPL_Analysis.analyze(tplRows);
            // Adapta contrato completo → contrato legado deste wrapper
            return _validar({
                oee: {
                    disponibilidade : full.oee.disponibilidade,
                    performance     : full.oee.performance,
                    qualidade       : full.oee.qualidade,
                    oee             : full.oee.oee,
                },
                tempos: {
                    produtivo     : full.tempos.produtivo,
                    improdutivo   : full.tempos.improdutivo,
                    mecanico      : full.tempos.manutencao,   // alias
                    climatico     : full.tempos.climatico,
                    preventivo    : full.tempos.preventivo,
                    indeterminado : full.tempos.indeterminado,
                },
                gargalos: {
                    porOperacao    : (full.gargalos.todos || []).slice(0, 5).map(g => ({
                        operacao  : (g.codOperacao ? g.codOperacao + ' - ' : '') + g.descOperacao,
                        tempoSeg  : g.hrsTotal * 3600,
                    })),
                    porEquipamento : (full.gargalos.improdutivos || []).slice(0, 5).map(g => ({
                        equipamento: g.frente || g.tipo || '—',
                        tempoSeg   : g.hrsTotal * 3600,
                    })),
                },
                comparativo: {
                    proprias : _adaptGrupo(full.grupos.colh_propria),
                    terceiros: _adaptGrupo(full.grupos.colh_terceira),
                },
                consumo: full.consumo || {},
                _tempoTotal       : full.tempos.total,
                _linhasProcessadas: full.meta.nEquipamentos,
                _fullAnalysis     : full,   // referência ao contrato completo
            });
        }

        // ── Fallback: cálculo autônomo (quando OEE_TPL_Analysis não carregou) ──
        let tempos = { produtivo: 0, improdutivo: 0, mecanico: 0, climatico: 0, preventivo: 0, indeterminado: 0 };
        let hrsMotorTotal = 0, hrsCorteTotal = 0, hrsImplTotal = 0;

        const improdByOp    = {};
        const improdByEquip = {};
        const grupos = {
            propria  : { tempos: { ...tempos }, hrsMotor: 0, hrsCorteBas: 0, hrsImpl: 0, equips: {} },
            terceiro : { tempos: { ...tempos }, hrsMotor: 0, hrsCorteBas: 0, hrsImpl: 0, equips: {} },
        };

        for (const row of tplRows) {
            const cod       = String(_col(row, ['COD. EQUIPAMENTO', 'COD.EQUIPAMENTO', 'COD EQUIPAMENTO']) || '').trim();
            if (!cod) continue;

            // Filtro de grupo proibido
            const grpEquip = String(_col(row, ['GRUPO EQUIPAMENTO', 'GRUPO EQUIP']) || '').trim();
            if (!_grupoAceito(grpEquip)) continue;

            // Horas: PRIMÁRIO SEC, FALLBACK HH:MM:SS
            let hrsSec = 0;
            const secVal = _col(row, ['HRS OPERACIONAIS(SEC)', 'HRS OPERACIONAIS SEC', 'OPERACIONAIS SEC']);
            if (secVal) {
                const s = _toNum(secVal);
                if (s > 0) hrsSec = s / 3600;
            }
            if (hrsSec === 0) {
                const hmsVal = _col(row, ['HRS OPERACIONAIS', 'HRS. OPERACIONAIS', 'HORAS OPERACIONAIS']);
                if (hmsVal) {
                    const s = String(hmsVal).trim();
                    let m = s.match(/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+(\d{1,3}):(\d{2})(?::(\d{2}))?/);
                    if (m) hrsSec = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;
                    else {
                        m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
                        if (m) hrsSec = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;
                        else hrsSec = Math.max(0, _toNum(hmsVal));
                    }
                }
            }

            const hrsMotor     = _toNum(_col(row, ['HRS MOTOR LIGADO', 'HRS. MOTOR LIGADO']));
            const hrsImpl      = _toNum(_col(row, ['HRS IMPLEMENTO LIGADO', 'HRS. IMPLEMENTO LIGADO']));
            const hrsCorteBas  = _toNum(_col(row, ['HRS CORTE BASE AUT LIGADO', 'HRS. CORTE BASE AUT LIGADO']));

            const cls   = _classificar(row);
            const owner = _ownership(cod);
            const op    = String(_col(row, ['DESC.OPERAÇÃO', 'DESC.OPERACAO', 'DESC OPERACAO']) || '').trim();

            // Acumula tempos globais
            switch (cls) {
                case 'PRODUTIVO':    tempos.produtivo    += hrsSec; break;
                case 'IMPRODUTIVO':  tempos.improdutivo  += hrsSec; break;
                case 'MECANICO':     tempos.mecanico     += hrsSec; break;
                case 'CLIMATICO':    tempos.climatico    += hrsSec; break;
                case 'PREVENTIVO':   tempos.preventivo   += hrsSec; break;
                default:             tempos.indeterminado+= hrsSec;
            }

            hrsMotorTotal += hrsMotor;
            hrsCorteTotal += hrsCorteBas;
            hrsImplTotal  += hrsImpl;

            if (cls === 'IMPRODUTIVO') {
                const opKey = op || 'Sem descrição';
                improdByOp[opKey]    = (improdByOp[opKey]    || 0) + hrsSec;
                improdByEquip[cod]   = (improdByEquip[cod]   || 0) + hrsSec;
            }

            if (owner === 'propria' || owner === 'terceiro') {
                const g = grupos[owner];
                switch (cls) {
                    case 'PRODUTIVO':    g.tempos.produtivo    += hrsSec; break;
                    case 'IMPRODUTIVO':  g.tempos.improdutivo  += hrsSec; break;
                    case 'MECANICO':     g.tempos.mecanico     += hrsSec; break;
                    case 'CLIMATICO':    g.tempos.climatico    += hrsSec; break;
                    case 'PREVENTIVO':   g.tempos.preventivo   += hrsSec; break;
                    default:             g.tempos.indeterminado+= hrsSec;
                }
                g.hrsMotor    += hrsMotor;
                g.hrsCorteBas += hrsCorteBas;
                g.hrsImpl     += hrsImpl;

                if (!g.equips[cod]) {
                    g.equips[cod] = { tempos: { produtivo:0,improdutivo:0,mecanico:0,climatico:0,preventivo:0,indeterminado:0 }, hrsMotor:0, hrsCorteBas:0, hrsImpl:0 };
                }
                const e = g.equips[cod];
                switch (cls) {
                    case 'PRODUTIVO':    e.tempos.produtivo    += hrsSec; break;
                    case 'IMPRODUTIVO':  e.tempos.improdutivo  += hrsSec; break;
                    case 'MECANICO':     e.tempos.mecanico     += hrsSec; break;
                    case 'CLIMATICO':    e.tempos.climatico    += hrsSec; break;
                    case 'PREVENTIVO':   e.tempos.preventivo   += hrsSec; break;
                    default:             e.tempos.indeterminado+= hrsSec;
                }
                e.hrsMotor    += hrsMotor;
                e.hrsCorteBas += hrsCorteBas;
                e.hrsImpl     += hrsImpl;
            }
        }

        const tempoTotal      = Object.values(tempos).reduce((a, b) => a + b, 0);
        const disponibilidade = tempoTotal > 0 ? tempos.produtivo / tempoTotal : 0;
        const performance     = hrsMotorTotal > 0 ? Math.min(1, hrsCorteTotal / hrsMotorTotal) : 0;
        const qualidade       = hrsMotorTotal > 0 ? Math.min(1, hrsImplTotal  / hrsMotorTotal) : 0;
        const oee             = disponibilidade * performance * qualidade;

        const _oeeGrupo = (g) => {
            const tot = Object.values(g.tempos).reduce((a, b) => a + b, 0);
            const d   = tot > 0 ? g.tempos.produtivo / tot : 0;
            const p   = g.hrsMotor > 0 ? Math.min(1, g.hrsCorteBas / g.hrsMotor) : 0;
            const q   = g.hrsMotor > 0 ? Math.min(1, g.hrsImpl     / g.hrsMotor) : 0;
            return { disponibilidade: d, performance: p, qualidade: q, oee: d * p * q, tempoTotal: tot, tempos: g.tempos };
        };

        const _rankEquips = (equips) =>
            Object.entries(equips).map(([cod, e]) => {
                const tot = Object.values(e.tempos).reduce((a, b) => a + b, 0);
                const d   = tot > 0 ? e.tempos.produtivo / tot : 0;
                const p   = e.hrsMotor > 0 ? Math.min(1, e.hrsCorteBas / e.hrsMotor) : 0;
                const q   = e.hrsMotor > 0 ? Math.min(1, e.hrsImpl     / e.hrsMotor) : 0;
                return { cod, oee: d * p * q, disponibilidade: d, performance: p, qualidade: q,
                         tempoProdutivo: e.tempos.produtivo, tempoImprodutivo: e.tempos.improdutivo, tempoTotal: tot };
            }).sort((a, b) => b.oee - a.oee);

        const gargalosOp    = Object.entries(improdByOp).map(([op, seg]) => ({ operacao: op, tempoSeg: seg })).sort((a, b) => b.tempoSeg - a.tempoSeg).slice(0, 5);
        const gargalosEquip = Object.entries(improdByEquip).map(([cod, seg]) => ({ equipamento: cod, tempoSeg: seg })).sort((a, b) => b.tempoSeg - a.tempoSeg).slice(0, 5);

        return _validar({
            oee: {
                disponibilidade: Math.max(0, Math.min(1, disponibilidade)),
                performance    : Math.max(0, Math.min(1, performance)),
                qualidade      : Math.max(0, Math.min(1, qualidade)),
                oee            : Math.max(0, Math.min(1, oee)),
            },
            tempos: {
                produtivo     : Math.max(0, tempos.produtivo),
                improdutivo   : Math.max(0, tempos.improdutivo),
                mecanico      : Math.max(0, tempos.mecanico),
                climatico     : Math.max(0, tempos.climatico),
                preventivo    : Math.max(0, tempos.preventivo),
                indeterminado : Math.max(0, tempos.indeterminado),
            },
            gargalos: {
                porOperacao   : gargalosOp,
                porEquipamento: gargalosEquip,
            },
            comparativo: {
                proprias  : { ..._oeeGrupo(grupos.propria),  ranking: _rankEquips(grupos.propria.equips)  },
                terceiros : { ..._oeeGrupo(grupos.terceiro), ranking: _rankEquips(grupos.terceiro.equips) },
            },
            _tempoTotal        : tempoTotal,
            _linhasProcessadas : tplRows.length,
        });
    }

    /* ─── adaptador de grupo (contrato completo → legado) ───────────────────── */
    function _adaptGrupo(g) {
        if (!g) return { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0, tempos: {}, ranking: [] };
        return {
            disponibilidade : g.disp,
            performance     : g.perf,
            qualidade       : g.qual,
            oee             : g.oee,
            tempoTotal      : g.tempoTotal,
            tempos          : g.tempos,
            ranking         : (g.ranking || []).map(e => ({
                cod              : e.cod,
                oee              : e.oee,
                disponibilidade  : e.disp,
                performance      : e.perf,
                qualidade        : e.qual,
                tempoProdutivo   : e.tempos.PRODUTIVO,
                tempoImprodutivo : e.tempos.IMPRODUTIVO,
                tempoTotal       : Object.values(e.tempos).reduce((a, b) => a + b, 0),
            })),
        };
    }

    /* ─── estrutura vazia ───────────────────────────────────────────────────── */
    function _estruturaVazia() {
        const z = { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0 };
        const t = { produtivo: 0, improdutivo: 0, mecanico: 0, climatico: 0, preventivo: 0, indeterminado: 0 };
        return {
            oee: z, tempos: t,
            gargalos     : { porOperacao: [], porEquipamento: [] },
            comparativo  : {
                proprias : { ...z, tempos: t, ranking: [] },
                terceiros: { ...z, tempos: t, ranking: [] },
            },
            _tempoTotal        : 0,
            _linhasProcessadas : 0,
        };
    }

    global.OEE_TPL_Analyzer = { analisar: analisarTPL };
    console.log('[OEE_TPL_Analyzer v3] Módulo registrado.');

})(window);