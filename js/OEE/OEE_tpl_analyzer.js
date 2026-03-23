/**
 * OEE_tpl_analyzer.js — v6.9.5
 * Analisa /snapshots/tpl e retorna estrutura OEE completa.
 * FONTE ÚNICA: tabela tpl. Nenhum hardcode. Nenhum fallback inventado.
 */
(function (global) {
    'use strict';

    /* ─── parser seguro (obrigatório conforme spec) ─── */
    function _toNum(v) {
        let s = String(v == null ? '' : v).trim().replace(/[^\d,.\-]/g, '');
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
        s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    /* ─── normaliza nome de coluna ─── */
    function _col(row, candidates) {
        for (const c of candidates) {
            const k = Object.keys(row).find(k => k.trim().toUpperCase() === c.toUpperCase());
            if (k !== undefined && row[k] !== undefined && row[k] !== '') return row[k];
        }
        return null;
    }

    /* ─── classificação de linha TPL ─── */
    function _classificar(row) {
        const grupo = String(_col(row, ['DESC.GRUPO OPERAC.', 'DESC GRUPO OPERAC', 'GRUPO OPERAC']) || '').toUpperCase().trim();
        const op    = String(_col(row, ['DESC.OPERAÇÃO', 'DESC.OPERACAO', 'DESC OPERACAO', 'DESC OPERAÇÃO', 'OPERACAO', 'OPERAÇÃO']) || '').toLowerCase().trim();

        if (/manuten|quebra|oficina/i.test(op))  return 'MECANICO';
        if (/preventiv/i.test(op))               return 'PREVENTIVO';
        if (/produtiv/i.test(grupo))             return 'PRODUTIVO';
        if (/improdu/i.test(grupo))              return 'IMPRODUTIVO';
        if (/clim/i.test(grupo))                 return 'CLIMATICO';
        return 'INDETERMINADO';
    }

    /* ─── prefixo do equipamento ─── */
    function _ownership(codEquip) {
        const s = String(codEquip || '').trim().replace(/\D/g, '');
        if (/^(31|32|80)/.test(s)) return 'propria';
        if (/^91/.test(s))         return 'terceiro';
        return 'outros';
    }

    /* ─── validação final ─── */
    function _validar(r) {
        const tempos = r.tempos;
        const soma = tempos.produtivo + tempos.improdutivo + tempos.mecanico +
                     tempos.climatico + tempos.preventivo + tempos.indeterminado;
        // Soma deve bater com total (tolerância de 1s por arredondamento)
        r._validacao = {
            somaOkBool: Math.abs(soma - r._tempoTotal) <= 1,
            soma,
            total: r._tempoTotal,
            oeeValido: r.oee.oee >= 0 && r.oee.oee <= 1,
            semNaN: !Object.values(r.oee).some(isNaN) && !Object.values(r.tempos).some(isNaN),
            semNegativo: Object.values(r.tempos).every(v => v >= 0)
        };
        return r;
    }

    /* ─── função principal ─── */
    function analisarTPL(tplRows) {
        if (!Array.isArray(tplRows) || tplRows.length === 0) {
            return _estruturaVazia();
        }

        /* acumuladores globais */
        let tempos = { produtivo: 0, improdutivo: 0, mecanico: 0, climatico: 0, preventivo: 0, indeterminado: 0 };
        let hrsMotorTotal = 0, hrsCorteTotal = 0, hrsImplTotal = 0;

        /* para gargalos */
        const improdByOp    = {};
        const improdByEquip = {};

        /* para comparativo */
        const grupos = {
            propria:  { tempos: {...tempos}, hrsMotor: 0, hrsCorteBas: 0, hrsImpl: 0, equips: {} },
            terceiro: { tempos: {...tempos}, hrsMotor: 0, hrsCorteBas: 0, hrsImpl: 0, equips: {} },
        };

        for (const row of tplRows) {
            const cod    = String(_col(row, ['COD. EQUIPAMENTO', 'COD.EQUIPAMENTO', 'COD EQUIPAMENTO', 'EQUIPAMENTO']) || '').trim();
            if (!cod) continue;

            const hrsSec    = _toNum(_col(row, ['HRS OPERACIONAIS', 'HRS. OPERACIONAIS', 'HORAS OPERACIONAIS']));
            const hrsMotor  = _toNum(_col(row, ['HRS MOTOR LIGADO', 'HRS. MOTOR LIGADO', 'HORAS MOTOR LIGADO']));
            const hrsImpl   = _toNum(_col(row, ['HRS IMPLEMENTO LIGADO', 'HRS. IMPLEMENTO LIGADO', 'HORAS IMPLEMENTO LIGADO']));
            const hrsCorteBas = _toNum(_col(row, ['HRS CORTE BASE AUT LIGADO', 'HRS. CORTE BASE AUT LIGADO', 'CORTE BASE AUT']));

            const cls   = _classificar(row);
            const owner = _ownership(cod);
            const op    = String(_col(row, ['DESC.OPERAÇÃO', 'DESC.OPERACAO', 'DESC OPERACAO', 'DESC OPERAÇÃO']) || '').trim();

            /* acumula tempos globais */
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

            /* gargalos: improdutivos por operação e equipamento */
            if (cls === 'IMPRODUTIVO') {
                const opKey = op || 'Sem descrição';
                improdByOp[opKey]    = (improdByOp[opKey] || 0) + hrsSec;
                improdByEquip[cod]   = (improdByEquip[cod] || 0) + hrsSec;
            }

            /* comparativo próprias vs terceiros */
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

                /* ranking de equipamentos */
                if (!g.equips[cod]) g.equips[cod] = { tempos: {produtivo:0,improdutivo:0,mecanico:0,climatico:0,preventivo:0,indeterminado:0}, hrsMotor:0, hrsCorteBas:0, hrsImpl:0 };
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

        /* ─── tempo total ─── */
        const tempoTotal = tempos.produtivo + tempos.improdutivo + tempos.mecanico +
                           tempos.climatico + tempos.preventivo  + tempos.indeterminado;

        /* ─── OEE global ─── */
        const disponibilidade = tempoTotal > 0 ? tempos.produtivo / tempoTotal : 0;
        const performance     = hrsMotorTotal > 0 ? Math.min(1, hrsCorteTotal / hrsMotorTotal) : 0;
        const qualidade       = hrsMotorTotal > 0 ? Math.min(1, hrsImplTotal  / hrsMotorTotal) : 0;
        const oee             = disponibilidade * performance * qualidade;

        /* ─── OEE por grupo ─── */
        const _oeeGrupo = (g) => {
            const tot = g.tempos.produtivo + g.tempos.improdutivo + g.tempos.mecanico +
                        g.tempos.climatico + g.tempos.preventivo  + g.tempos.indeterminado;
            const d   = tot > 0 ? g.tempos.produtivo / tot : 0;
            const p   = g.hrsMotor > 0 ? Math.min(1, g.hrsCorteBas / g.hrsMotor) : 0;
            const q   = g.hrsMotor > 0 ? Math.min(1, g.hrsImpl     / g.hrsMotor) : 0;
            return { disponibilidade: d, performance: p, qualidade: q, oee: d * p * q, tempoTotal: tot, tempos: g.tempos };
        };

        /* ─── ranking de equipamentos ─── */
        const _rankEquips = (equips) =>
            Object.entries(equips)
                .map(([cod, e]) => {
                    const tot = e.tempos.produtivo + e.tempos.improdutivo + e.tempos.mecanico +
                                e.tempos.climatico + e.tempos.preventivo  + e.tempos.indeterminado;
                    const d   = tot > 0 ? e.tempos.produtivo / tot : 0;
                    const p   = e.hrsMotor > 0 ? Math.min(1, e.hrsCorteBas / e.hrsMotor) : 0;
                    const q   = e.hrsMotor > 0 ? Math.min(1, e.hrsImpl     / e.hrsMotor) : 0;
                    return { cod, oee: d * p * q, disponibilidade: d, performance: p, qualidade: q, tempoProdutivo: e.tempos.produtivo, tempoImprodutivo: e.tempos.improdutivo, tempoTotal: tot };
                })
                .sort((a, b) => b.oee - a.oee);

        /* ─── top 5 gargalos por operação ─── */
        const gargalosOp = Object.entries(improdByOp)
            .map(([op, seg]) => ({ operacao: op, tempoSeg: seg }))
            .sort((a, b) => b.tempoSeg - a.tempoSeg)
            .slice(0, 5);

        const gargalosEquip = Object.entries(improdByEquip)
            .map(([cod, seg]) => ({ equipamento: cod, tempoSeg: seg }))
            .sort((a, b) => b.tempoSeg - a.tempoSeg)
            .slice(0, 5);

        /* ─── resultado final ─── */
        const result = {
            oee: {
                disponibilidade: Math.max(0, Math.min(1, disponibilidade)),
                performance:     Math.max(0, Math.min(1, performance)),
                qualidade:       Math.max(0, Math.min(1, qualidade)),
                oee:             Math.max(0, Math.min(1, oee))
            },
            tempos: {
                produtivo:     Math.max(0, tempos.produtivo),
                improdutivo:   Math.max(0, tempos.improdutivo),
                mecanico:      Math.max(0, tempos.mecanico),
                climatico:     Math.max(0, tempos.climatico),
                preventivo:    Math.max(0, tempos.preventivo),
                indeterminado: Math.max(0, tempos.indeterminado)
            },
            gargalos: {
                porOperacao:   gargalosOp,
                porEquipamento: gargalosEquip
            },
            comparativo: {
                proprias:  { ..._oeeGrupo(grupos.propria),  ranking: _rankEquips(grupos.propria.equips)  },
                terceiros: { ..._oeeGrupo(grupos.terceiro), ranking: _rankEquips(grupos.terceiro.equips) }
            },
            _tempoTotal: tempoTotal,
            _linhasProcessadas: tplRows.length
        };

        return _validar(result);
    }

    function _estruturaVazia() {
        const z = { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0 };
        const t = { produtivo: 0, improdutivo: 0, mecanico: 0, climatico: 0, preventivo: 0, indeterminado: 0 };
        return _validar({
            oee: z, tempos: t,
            gargalos: { porOperacao: [], porEquipamento: [] },
            comparativo: { proprias: { ...z, tempos: t, ranking: [] }, terceiros: { ...z, tempos: t, ranking: [] } },
            _tempoTotal: 0, _linhasProcessadas: 0
        });
    }

    global.OEE_TPL_Analyzer = { analisar: analisarTPL };

})(window);
