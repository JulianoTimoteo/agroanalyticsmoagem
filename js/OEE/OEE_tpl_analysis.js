// OEE_tpl_analysis.js — Motor analítico OEE baseado exclusivamente em /snapshots/tpl
// Spec: README técnico v6.9.5
// REGRA ABSOLUTA: todos os cálculos saem EXCLUSIVAMENTE da tabela /snapshots/tpl

(function () {
    'use strict';

    // ── Parser obrigatório conforme spec ────────────────────────────────
    function _toNum(v) {
        let s = String(v).trim().replace(/[^\d,.-]/g, '');
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
        s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // ── Classificação de categorias ─────────────────────────────────────
    function _classifyRow(row) {
        const grupo = String(row['DESC.GRUPO OPERAC.'] || row['DESC.GRUPO OPERAC'] || row['desc_grupo_operac'] || '').trim();
        const op    = String(row['DESC.OPERAÇÃO'] || row['DESC.OPERACAO'] || row['desc_operacao'] || row['DESC.OPERAÃƒO'] || '').trim().toLowerCase();

        // Mecânico — refina primeiro (prioridade sobre grupo)
        if (/manuten|quebra|oficina/i.test(op)) return 'mecanico';
        // Preventiva
        if (/preventiva/i.test(op)) return 'preventivo';

        // Grupo operacional
        const g = grupo.toLowerCase();
        if (/produtiva/i.test(g) && !/improdutiva/i.test(g)) return 'produtivo';
        if (/improdutiva/i.test(g)) return 'improdutivo';
        if (/clim/i.test(g) || /lim/i.test(g)) return 'climatico';
        if (/manuten|mecani/i.test(g)) return 'mecanico';
        if (/prev/i.test(g)) return 'preventivo';

        return 'indeterminado';
    }

    // ── Prefixos por propriedade ────────────────────────────────────────
    const PROPRIA_PREFIXES  = ['80','81','82','83','84','85','31','32'];
    const TERCEIRO_PREFIXES = ['91','93','94','95'];

    function _ownerOf(cod) {
        const c = String(cod || '').trim();
        if (PROPRIA_PREFIXES.some(p => c.startsWith(p)))  return 'propria';
        if (TERCEIRO_PREFIXES.some(p => c.startsWith(p))) return 'terceiro';
        return 'outro';
    }

    // ── Análise principal ────────────────────────────────────────────────
    function analyzeTpl(tplRows) {
        if (!Array.isArray(tplRows) || tplRows.length === 0) {
            return _emptyResult();
        }

        // Detecta colunas
        const firstRow = tplRows[0];
        const keys     = Object.keys(firstRow);
        const _col = (...cands) => {
            for (const c of cands) {
                const cu = c.toUpperCase().trim();
                const f  = keys.find(k => k.toUpperCase().trim() === cu ||
                                         k.toUpperCase().trim().includes(cu) ||
                                         cu.includes(k.toUpperCase().trim()));
                if (f) return f;
            }
            return null;
        };

        const COL_COD    = _col('COD. EQUIPAMENTO','COD EQUIPAMENTO','COD.EQUIPAMENTO','EQUIPAMENTO');
        const COL_HRSOP  = _col('HRS OPERACIONAIS','HRS. OPERACIONAIS','HORAS OPERACIONAIS');
        const COL_HRSMOT = _col('HRS MOTOR LIGADO','HRS. MOTOR LIGADO','MOTOR LIGADO');
        const COL_HRSIMPL= _col('HRS IMPLEMENTO LIGADO','HRS. IMPLEMENTO LIGADO','IMPLEMENTO LIGADO');
        const COL_HRSCBA = _col('HRS CORTE BASE AUT LIGADO','CORTE BASE AUT','HRS CORTE BASE');
        const COL_HRSOPSEC = _col('HRS OPERACIONAIS(SEC)','HRS OPERACIONAIS SEC','OPERACIONAIS SEC');

        if (!COL_COD) {
            console.warn('[OEE_tpl_analysis] Coluna COD. EQUIPAMENTO não encontrada. Colunas:', keys.join(' | '));
            return _emptyResult();
        }

        // Acumuladores globais
        const tempos = { produtivo: 0, improdutivo: 0, mecanico: 0, climatico: 0, preventivo: 0, indeterminado: 0 };
        let   hrsMotorTotal = 0, hrsImplTotal = 0, hrsCBATotal = 0;

        // Por equipamento (para OEE médio e comparativo)
        const byEquip    = new Map();
        // Gargalos: improdutivos por operação
        const gargalosMap = new Map();

        tplRows.forEach(row => {
            const cod = String(row[COL_COD] || '').trim();
            if (!cod || cod === '0') return;

            // Tempo operacional em horas
            let hrsOp = 0;
            if (COL_HRSOPSEC) {
                const sec = _toNum(row[COL_HRSOPSEC]);
                if (sec > 0) hrsOp = sec / 3600;
            }
            if (hrsOp === 0 && COL_HRSOP) {
                hrsOp = _parseHMS(row[COL_HRSOP]);
            }

            const hrsMot  = COL_HRSMOT ? _parseHMS(row[COL_HRSMOT]) : 0;
            const hrsImpl = COL_HRSIMPL ? _parseHMS(row[COL_HRSIMPL]) : 0;
            const hrsCBA  = COL_HRSCBA  ? _parseHMS(row[COL_HRSCBA])  : 0;

            const cat   = _classifyRow(row);
            const owner = _ownerOf(cod);

            // Acumula tempos globais
            tempos[cat] = (tempos[cat] || 0) + hrsOp;
            hrsMotorTotal += hrsMot;
            hrsImplTotal  += hrsImpl;
            hrsCBATotal   += hrsCBA;

            // Por equipamento
            if (!byEquip.has(cod)) {
                byEquip.set(cod, {
                    cod, owner,
                    hrsOp: 0, hrsMot: 0, hrsImpl: 0, hrsCBA: 0,
                    cats: { produtivo:0, improdutivo:0, mecanico:0, climatico:0, preventivo:0, indeterminado:0 }
                });
            }
            const e = byEquip.get(cod);
            e.hrsOp   += hrsOp;
            e.hrsMot  += hrsMot;
            e.hrsImpl += hrsImpl;
            e.hrsCBA  += hrsCBA;
            e.cats[cat] = (e.cats[cat] || 0) + hrsOp;

            // Gargalos: acumula tempos improdutivos por DESC.OPERAÇÃO
            if (cat === 'improdutivo' || cat === 'mecanico' || cat === 'climatico') {
                const opDesc = String(row['DESC.OPERAÇÃO'] || row['DESC.OPERACAO'] || row['desc_operacao'] || 'Desconhecido').trim();
                const frente = String(row['GRUPO EQUIPAMENTO'] || row['grupo_equipamento'] || '').trim();
                const gKey   = opDesc + '||' + cod;
                if (!gargalosMap.has(gKey)) {
                    gargalosMap.set(gKey, { descOperacao: opDesc, equipamento: cod, frente, categoria: cat, hrsTotal: 0 });
                }
                gargalosMap.get(gKey).hrsTotal += hrsOp;
            }
        });

        // ── OEE ─────────────────────────────────────────────────────────
        const tempoTotal   = Object.values(tempos).reduce((a, b) => a + b, 0);
        const tempoProdutivo = tempos.produtivo || 0;

        // Disponibilidade = Produtivo / Total
        const disponibilidade = tempoTotal > 0 ? Math.min(1, tempoProdutivo / tempoTotal) : 0;
        // Performance = HRS CORTE BASE AUT / HRS MOTOR LIGADO
        const performance     = hrsMotorTotal > 0 ? Math.min(1, hrsCBATotal / hrsMotorTotal) : 0;
        // Qualidade proxy = HRS IMPLEMENTO LIGADO / HRS MOTOR LIGADO
        const qualidade       = hrsMotorTotal > 0 ? Math.min(1, hrsImplTotal / hrsMotorTotal) : 0;
        // OEE = D × P × Q
        const oee = disponibilidade * performance * qualidade;

        // Validação obrigatória
        const validated = {
            disponibilidade : _clamp(disponibilidade),
            performance     : _clamp(performance),
            qualidade       : _clamp(qualidade),
            oee             : _clamp(oee)
        };

        // ── Gargalos (top 5 improdutivos) ───────────────────────────────
        const gargalos = Array.from(gargalosMap.values())
            .sort((a, b) => b.hrsTotal - a.hrsTotal)
            .slice(0, 5)
            .map(g => ({ ...g }));

        // ── Comparativo Próprias vs Terceiros ────────────────────────────
        const proprias  = _buildComparativo([...byEquip.values()].filter(e => e.owner === 'propria'));
        const terceiros = _buildComparativo([...byEquip.values()].filter(e => e.owner === 'terceiro'));

        // Validação soma dos tempos
        const somaTempos = Object.values(tempos).reduce((a, b) => a + b, 0);
        if (Math.abs(somaTempos - tempoTotal) > 0.001) {
            console.warn('[OEE_tpl_analysis] Divergência na soma dos tempos:', somaTempos, '!=', tempoTotal);
        }

        return {
            oee: validated,
            tempos: {
                produtivo    : _nn(tempos.produtivo),
                improdutivo  : _nn(tempos.improdutivo),
                mecanico     : _nn(tempos.mecanico),
                climatico    : _nn(tempos.climatico),
                preventivo   : _nn(tempos.preventivo),
                indeterminado: _nn(tempos.indeterminado),
                total        : _nn(tempoTotal)
            },
            gargalos,
            comparativo: { proprias, terceiros },
            _meta: {
                equipamentos   : byEquip.size,
                hrsMotorTotal  : _nn(hrsMotorTotal),
                hrsImplTotal   : _nn(hrsImplTotal),
                hrsCBATotal    : _nn(hrsCBATotal),
                validacao: {
                    somaTemposIgualTotal : Math.abs(somaTempos - tempoTotal) < 0.01,
                    oeeLeUm             : oee <= 1,
                    semNaN              : !Object.values(validated).some(isNaN),
                    semNegativo         : !Object.values(validated).some(v => v < 0)
                }
            }
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _buildComparativo(equips) {
        if (!equips.length) return { oeeMedia: 0, tempoImprodutivo: 0, ranking: [] };
        let tempoImpTotal = 0;
        const oees = [];
        equips.forEach(e => {
            const tot  = e.hrsOp;
            const prod = e.cats.produtivo || 0;
            const mec  = e.cats.mecanico  || 0;
            const d    = tot > 0 ? Math.min(1, prod / tot) : 0;
            const p    = e.hrsMot > 0 ? Math.min(1, e.hrsCBA / e.hrsMot) : 0;
            const q    = e.hrsMot > 0 ? Math.min(1, e.hrsImpl / e.hrsMot) : 0;
            const oee  = d * p * q;
            oees.push({ cod: e.cod, oee: _clamp(oee), disp: _clamp(d), hrsOp: tot });
            tempoImpTotal += (e.cats.improdutivo || 0) + mec;
        });
        const oeeMedia = oees.length ? oees.reduce((s, e) => s + e.oee, 0) / oees.length : 0;
        const ranking  = [...oees].sort((a, b) => b.oee - a.oee);
        return { oeeMedia: _clamp(oeeMedia), tempoImprodutivo: _nn(tempoImpTotal), ranking };
    }

    function _parseHMS(val) {
        if (!val) return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
        const s = String(val).trim();
        // HH:MM:SS
        let m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / 60 + (parseInt(m[3] || 0)) / 3600;
        // Datetime with time part
        m = s.match(/\s(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / 60 + (parseInt(m[3] || 0)) / 3600;
        // Seconds
        const n = _toNum(val);
        if (n > 3600) return n / 3600;
        if (n > 24)   return n / 60;
        return Math.max(0, n);
    }

    function _clamp(v) { return isNaN(v) || v < 0 ? 0 : Math.min(1, v); }
    function _nn(v)    { return isNaN(v) || v < 0 ? 0 : v; }

    function _emptyResult() {
        return {
            oee: { disponibilidade: 0, performance: 0, qualidade: 0, oee: 0 },
            tempos: { produtivo:0, improdutivo:0, mecanico:0, climatico:0, preventivo:0, indeterminado:0, total:0 },
            gargalos: [],
            comparativo: {
                proprias : { oeeMedia:0, tempoImprodutivo:0, ranking:[] },
                terceiros: { oeeMedia:0, tempoImprodutivo:0, ranking:[] }
            },
            _meta: { equipamentos:0 }
        };
    }

    // ── Exportação ───────────────────────────────────────────────────────
    window.OEE_TPL_Analysis = { analyze: analyzeTpl };
    console.log('[OEE_TPL_Analysis] Módulo registrado.');

})();
