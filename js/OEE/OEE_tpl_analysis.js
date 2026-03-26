// OEE_tpl_analysis.js — v3.0 AgroAnalytics
// Motor analítico OEE/TPL — FONTE ÚNICA DE VERDADE
// Regras: PROMPT MESTRE v3.0 — aplicadas integralmente
//
// Prefixos válidos:
//   80–85 = Colhedora Própria  | 93–95 = Colhedora Terceira
//   31–32 = Caminhão Próprio   | 91    = Caminhão Terceiro
//   92    = Transbordo Terceiro
//
// Fonte de horas: HRS OPERACIONAIS(SEC)/3600 (primário) → HRS OPERACIONAIS (fallback)
// Data: DATA/HORA LOCAL apenas — horário 00:00:00 ignorado
// Consumo: Σlitros / ΣhrsMotor (ponderado) — NUNCA ColConAcm bruto

(function () {
    'use strict';

    // ── Whitelist de GRUPO EQUIPAMENTO ────────────────────────────────────────
    const GRUPOS_VALIDOS = new Set([
        'COLHEDORA RESERVA', 'OFICINA',
        'FRENTE 08', 'FRENTE 10', 'FRENTE 11', 'FRENTE 13', 'FRENTE 14', 'FRENTE 15',
        'FRENTE 30', 'FRENTE 33', 'FRENTE 34', 'FRENTE 36', 'FRENTE 120',
        'CAMINHOES TERCEIROS', 'CAMINHÕES TERCEIROS',
        'CAMINHOES PROPRIOS', 'CAMINHÕES PROPRIOS',
        'CANAVIEIROS',
        'TRANSBORDOS - TERCEIROS', 'TRANSBORDOS TERCEIROS', 'TRANSBORDO',
        // variantes numéricas históricas
        'FRENTE 8', 'FRENTE 9', 'FRENTE 12', 'FRENTE 16', 'FRENTE 17',
        'FRENTE 18', 'FRENTE 19', 'FRENTE 20', 'FRENTE 37',
    ]);

    // ── Palavras que descartam a linha (grupos proibidos) ─────────────────────
    const GRUPOS_PROIBIDOS = [
        /fertilirrig/i, /fertirreg/i, /fertirriga/i,
        /tratos\s*cultur/i, /^tratos$/i,
        /herbicida/i,
        /linha\s*amarela/i,
        /preparo\s*de\s*solo/i, /preparo\s*solo/i,
        /aduba/i,
        /grupo\s*40/i, /^40\b/,
    ];

    function _normalizeGrupo(g) {
        return String(g || '').toUpperCase().trim()
            .replace(/[ÀÁÂÃÄ]/g, 'A').replace(/[ÈÉÊË]/g, 'E')
            .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÕÖ]/g, 'O')
            .replace(/[ÚÙÛÜ]/g, 'U').replace(/Ç/g, 'C');
    }

    function _isGrupoValido(grupoRaw) {
        if (!grupoRaw) return false;
        const raw = String(grupoRaw).trim();

        // Descarte imediato por padrões proibidos
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

    // ── Prefixos de propriedade ───────────────────────────────────────────────
    function _classifyEquip(cod) {
        const s = String(cod || '').trim();
        if (/^(80|81|82|83|84|85)/.test(s)) return { tipo: 'colhedora', owner: 'propria'  };
        if (/^(93|94|95)/.test(s))          return { tipo: 'colhedora', owner: 'terceiro' };
        if (/^(31|32)/.test(s))             return { tipo: 'caminhao',  owner: 'proprio'  };
        if (/^91/.test(s))                  return { tipo: 'caminhao',  owner: 'terceiro' };
        if (/^92/.test(s))                  return { tipo: 'transbordo',owner: 'terceiro' };
        return { tipo: 'outro', owner: 'outro' };
    }

    // ── Parser numérico seguro (BR e US) ─────────────────────────────────────
    function _toNum(v) {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        let s = String(v).trim().replace(/[^\d,.\-]/g, '');
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
        s = s.replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // ── Parser de horas — ordem de tentativa conforme spec ───────────────────
    // 1. HH:MM:SS puro
    // 2. 30/12/1899 HH:MM:SS (Excel/Sheets)
    // 3. Número: se > 3600 → segundos; se > 24 → minutos; senão → horas
    function _parseHMS(val) {
        if (!val && val !== 0) return 0;
        if (typeof val === 'number') {
            if (isNaN(val)) return 0;
            if (val > 3600) return val / 3600;   // segundos
            if (val > 24)   return val / 60;      // minutos
            return Math.max(0, val);              // horas
        }
        const s = String(val).trim();
        if (!s) return 0;

        // Formato Excel: "30/12/1899 HH:MM:SS" ou "1899-12-30 HH:MM:SS"
        let m = s.match(/\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+(\d{1,3}):(\d{2})(?::(\d{2}))?/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;

        // HH:MM:SS ou HH:MM puro
        m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
        if (m) return parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || 0) / 3600;

        // Numérico puro
        const n = _toNum(val);
        if (n > 3600) return n / 3600;
        if (n > 24)   return n / 60;
        return Math.max(0, n);
    }

    // ── Extração de data de DATA/HORA LOCAL ───────────────────────────────────
    // Ignora completamente a parte de hora (00:00:00)
    function _extractDate(v) {
        if (!v) return null;
        const s = String(v).trim();
        // DD/MM/YYYY ... (ignora tudo após espaço)
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        // ISO YYYY-MM-DD
        m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        return null;
    }

    // ── Classificação operacional ─────────────────────────────────────────────
    // Precedência: MECANICO > PREVENTIVO > PRODUTIVO > IMPRODUTIVO > CLIMATICO > INDET
    function _classifyOp(grupoOperac, descOp) {
        const op  = String(descOp     || '').toLowerCase().trim();
        const grp = String(grupoOperac|| '').toLowerCase().trim();

        // 1. Manutenção / mecânico (vence tudo)
        if (/manuten|quebra|oficina|mecan|borrachar|lavagem|lubri|aguard.*mecanic/i.test(op)) return 'MANUTENCAO';
        // 2. Preventivo
        if (/preventiv/i.test(op)) return 'PREVENTIVO';
        // 3–7. Pelo grupo operacional
        if (/produtiv/i.test(grp) && !/improdutiv/i.test(grp)) return 'PRODUTIVO';
        if (/improdutiv/i.test(grp))                            return 'IMPRODUTIVO';
        if (/clim/i.test(grp))                                  return 'CLIMATICO';
        if (/manut|mecani/i.test(grp))                          return 'MANUTENCAO';
        if (/prev/i.test(grp))                                  return 'PREVENTIVO';
        return 'INDETERMINADO';
    }

    // ── Rótulo de frente ──────────────────────────────────────────────────────
    function _extractFrente(grupoEquip) {
        if (!grupoEquip) return '';
        const g = String(grupoEquip).toUpperCase().trim();
        const m = g.match(/FRENTE\s+(\d+)/);
        if (m) return 'F' + parseInt(m[1]);            // F8, F10, F120
        if (/CAMINHOES\s+PROPRIOS|CAMINHÕES\s+PROPRIOS/i.test(g)) return 'CAM';
        if (/CAMINHOES|CAMINHÕES|CAMINH/i.test(g))    return 'CAM3';
        if (/CANAVIER/i.test(g))                       return 'CAM3';
        if (/TRANSBORDO/i.test(g))                     return 'TRB';
        if (/COLHED.*RESERV/i.test(g))                 return 'RESERVA';
        if (/OFICINA/i.test(g))                        return 'OFICINA';
        return g.slice(0, 8);
    }

    // ── Localiza coluna por candidatos (case-insensitive + parcial) ───────────
    function _makeColFinder(keys) {
        return function _col(...cands) {
            for (const c of cands) {
                const cu = c.toUpperCase().trim();
                const found = keys.find(k => k.toUpperCase().trim() === cu);
                if (found) return found;
            }
            // Fallback parcial normalizado
            for (const c of cands) {
                const cu = c.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
                const found = keys.find(k => k.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim().includes(cu));
                if (found) return found;
            }
            return null;
        };
    }

    // ── Filtro de período ─────────────────────────────────────────────────────
    function _filterByPeriod(rows, colData, inicio, fim) {
        if (!inicio && !fim) return rows;
        return rows.filter(row => {
            const d = _extractDate(row[colData]);
            if (!d) return false;
            if (inicio && d < inicio) return false;
            if (fim    && d > fim   ) return false;
            return true;
        });
    }

    // ── Alerta de anomalia de frente ──────────────────────────────────────────
    // Retorna true se hrs > 1,5× média das frentes para aquele indicador
    function _anomalia(porFrente) {
        const vals = Object.values(porFrente).filter(v => v > 0);
        if (vals.length < 2) return {};
        const media = vals.reduce((a, b) => a + b, 0) / vals.length;
        const result = {};
        for (const [f, v] of Object.entries(porFrente)) {
            result[f] = v > media * 1.5;
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  FUNÇÃO PRINCIPAL
    // ─────────────────────────────────────────────────────────────────────────
    function analyzeTpl(tplRows, options) {
        options = options || {};
        const { inicio, fim } = options;

        if (!Array.isArray(tplRows) || tplRows.length === 0) return _empty();

        const firstRow = tplRows[0];
        const keys = Object.keys(firstRow);
        const _col = _makeColFinder(keys);

        // ── Mapeamento de colunas ─────────────────────────────────────────────
        const C = {
            cod       : _col('COD. EQUIPAMENTO', 'COD.EQUIPAMENTO', 'COD EQUIPAMENTO', 'EQUIPAMENTO'),
            grpEquip  : _col('GRUPO EQUIPAMENTO', 'GRUPO EQUIP'),
            grpOperac : _col('DESC.GRUPO OPERAC.', 'DESC GRUPO OPERAC', 'GRUPO OPERAC', 'DESC.GRUPO OPERACIONAL'),
            // DESC.OPERAÇÃO — múltiplos aliases incluindo variantes garbled
            descOp    : _col('DESC.OPERAÇÃO', 'DESC.OPERACAO', 'DESC OPERACAO', 'DESC OPERAÇÃO',
                             'DESC.OPERAÃƒâ€¡ÃƒÆ\'O', 'DESC.OPERAÃ‡ÃO', 'DESC.OPERAÃÂ¡ÃÂO',
                             'DESC.OPERAÃÂ‡ÃÂLO', 'DESCRICAO OPERACAO', 'DESCRICAO_OPERACAO'),
            codOp     : _col('COD. OPERACAO', 'COD.OPERACAO', 'COD OPERACAO', 'COD. OPERAÇÃO'),
            dataHora  : _col('DATA/HORA LOCAL', 'DATA HORA LOCAL', 'DATA APONTAMENTO'),
            // Horas — primário é SEC, fallback HH:MM:SS
            hrsOpSec  : _col('HRS OPERACIONAIS(SEC)', 'HRS. OPERACIONAIS(SEC)', 'OPERACIONAIS SEC', 'HRS OPERACIONAIS SEC'),
            hrsOp     : _col('HRS OPERACIONAIS', 'HRS. OPERACIONAIS', 'HORAS OPERACIONAIS'),
            hrsMot    : _col('HRS MOTOR LIGADO', 'HRS. MOTOR LIGADO', 'HORAS MOTOR LIGADO', 'HORAS MOTOR'),
            hrsImpl   : _col('HRS IMPLEMENTO LIGADO', 'HRS. IMPLEMENTO LIGADO', 'IMPLEMENTO LIGADO'),
            hrsEst    : _col('HRS ESTEIRA LIGADA', 'HRS. ESTEIRA LIGADA', 'ESTEIRA LIGADA'),
            hrsCBA    : _col('HRS CORTE BASE AUT LIGADO', 'HRS. CORTE BASE AUT LIGADO', 'CORTE BASE AUT', 'HRS CORTE BASE'),
            hrsRTK    : _col('HRS RTK_LIGADO', 'HRS. RTK LIGADO', 'RTK LIGADO', 'PILOTO', 'HRS RTK'),
            area      : _col('AREA TRABALHADA ANALITICA', 'AREA TRABALHADA', 'HECTARES', 'AREA_TRABALHADA'),
            velMedia  : _col('VELOCIDADE MEDIA', 'VELOCIDADE', 'VEL. MEDIA'),
            descEquip : _col('DESC.EQUIPAMENTO', 'DESC EQUIPAMENTO', 'DESCRICAO EQUIPAMENTO'),
            // Consumo (pode estar na TPL ou ser cruzado com ColConAcm)
            consumoL  : _col('LITROS CONSUMIDOS', 'LITROS', 'CONSUMO LITROS', 'LITROS TOTAL'),
        };

        if (!C.cod) {
            console.warn('[OEE_TPL_Analysis v3] ERRO: COD.EQUIPAMENTO não encontrado.',
                'Colunas disponíveis:', keys.slice(0, 8).join(' | '));
            return _empty();
        }

        // ── Filtro de período ─────────────────────────────────────────────────
        let rows = tplRows;
        if ((inicio || fim) && C.dataHora) {
            rows = _filterByPeriod(rows, C.dataHora, inicio, fim);
        }

        // ── Acumuladores globais ──────────────────────────────────────────────
        const gTempos = { PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, CLIMATICO: 0, PREVENTIVO: 0, INDETERMINADO: 0 };
        let g_hrsMot = 0, g_hrsImpl = 0, g_hrsCBA = 0, g_hrsRTK = 0, g_hrsEst = 0, g_area = 0;
        let g_litros = 0;  // para consumo ponderado

        // ── Mapas de acumulação ───────────────────────────────────────────────
        const byEquip  = new Map();  // cod → dados por equipamento
        const byFrente = new Map();  // frente → dados por frente
        const byOp     = new Map();  // chave composta → gargalo detalhado
        const datas    = new Set();  // datas únicas para contar dias

        // ── Contagem de linhas descartadas ────────────────────────────────────
        let linhasDescartadas = 0;

        for (const row of rows) {
            const cod = String(row[C.cod] || '').trim();
            if (!cod || cod === '0') { linhasDescartadas++; continue; }

            // 1. Classifica equipamento — rejeita 'outro'
            const clf = _classifyEquip(cod);
            if (clf.tipo === 'outro') { linhasDescartadas++; continue; }

            // 2. Filtra por GRUPO EQUIPAMENTO (whitelist obrigatória)
            const grupoEquip = String(row[C.grpEquip] || '').trim();
            if (grupoEquip && !_isGrupoValido(grupoEquip)) { linhasDescartadas++; continue; }

            // 3. Extrai dados da linha
            const grupoOperac = String(row[C.grpOperac] || '').trim();
            const descOp      = String(row[C.descOp]    || '').trim();
            const codOp       = String(row[C.codOp]     || '').trim();
            const descEquip   = String(row[C.descEquip] || '').trim();
            const data        = C.dataHora ? _extractDate(row[C.dataHora]) : null;
            const frente      = _extractFrente(grupoEquip);

            if (data) datas.add(data);

            // 4. Horas operacionais — PRIMÁRIO: SEC; FALLBACK: HH:MM:SS
            let hrsOp = 0;
            if (C.hrsOpSec) {
                const sec = _toNum(row[C.hrsOpSec]);
                if (sec > 0) hrsOp = sec / 3600;
            }
            if (hrsOp === 0 && C.hrsOp) hrsOp = _parseHMS(row[C.hrsOp]);

            const hrsMot  = C.hrsMot  ? _parseHMS(row[C.hrsMot])  : 0;
            const hrsImpl = C.hrsImpl ? _parseHMS(row[C.hrsImpl]) : 0;
            const hrsCBA  = C.hrsCBA  ? _parseHMS(row[C.hrsCBA])  : 0;
            const hrsRTK  = C.hrsRTK  ? _parseHMS(row[C.hrsRTK]) : 0;
            const hrsEst  = C.hrsEst  ? _parseHMS(row[C.hrsEst]) : 0;
            const area    = C.area    ? _toNum(row[C.area])       : 0;
            const litros  = C.consumoL? _toNum(row[C.consumoL])   : 0;

            // 5. Classifica operação
            const cat = _classifyOp(grupoOperac, descOp);

            // ── Globais ───────────────────────────────────────────────────────
            gTempos[cat] = (gTempos[cat] || 0) + hrsOp;
            g_hrsMot  += hrsMot;
            g_hrsImpl += hrsImpl;
            g_hrsCBA  += hrsCBA;
            g_hrsRTK  += hrsRTK;
            g_hrsEst  += hrsEst;
            g_area    += area;
            g_litros  += litros;

            // ── Por equipamento ───────────────────────────────────────────────
            if (!byEquip.has(cod)) {
                byEquip.set(cod, {
                    cod, tipo: clf.tipo, owner: clf.owner, frente, descEquip,
                    tempos : { PRODUTIVO:0, IMPRODUTIVO:0, MANUTENCAO:0, CLIMATICO:0, PREVENTIVO:0, INDETERMINADO:0 },
                    hrsMot : 0, hrsImpl: 0, hrsCBA: 0, hrsRTK: 0, hrsEst: 0, area: 0, litros: 0,
                    ops    : new Map(),
                    datas  : new Set(),
                });
            }
            const eq = byEquip.get(cod);
            eq.tempos[cat] = (eq.tempos[cat] || 0) + hrsOp;
            eq.hrsMot  += hrsMot;
            eq.hrsImpl += hrsImpl;
            eq.hrsCBA  += hrsCBA;
            eq.hrsRTK  += hrsRTK;
            eq.hrsEst  += hrsEst;
            eq.area    += area;
            eq.litros  += litros;
            if (data) eq.datas.add(data);
            if (codOp || descOp) {
                const opKey = (codOp || '') + ' - ' + descOp;
                eq.ops.set(opKey, (eq.ops.get(opKey) || 0) + hrsOp);
            }

            // ── Por frente ────────────────────────────────────────────────────
            if (frente) {
                if (!byFrente.has(frente)) {
                    byFrente.set(frente, {
                        frente,
                        tempos : { PRODUTIVO:0, IMPRODUTIVO:0, MANUTENCAO:0, CLIMATICO:0, PREVENTIVO:0, INDETERMINADO:0 },
                        equips : new Set(),
                        hrsMot : 0, hrsCBA: 0, hrsRTK: 0, hrsEst: 0, area: 0,
                        gargalos: new Map(), // op → hrs (para encontrar gargalo dominante)
                    });
                }
                const fr = byFrente.get(frente);
                fr.tempos[cat] = (fr.tempos[cat] || 0) + hrsOp;
                fr.equips.add(cod);
                fr.hrsMot += hrsMot;
                fr.hrsCBA += hrsCBA;
                fr.hrsRTK += hrsRTK;
                fr.hrsEst += hrsEst;
                fr.area   += area;
                if (cat === 'IMPRODUTIVO' && (descOp || codOp)) {
                    const gk = (codOp ? codOp + ' - ' : '') + (descOp || 'Sem descrição');
                    fr.gargalos.set(gk, (fr.gargalos.get(gk) || 0) + hrsOp);
                }
            }

            // ── Gargalos por operação (chave: codOp||tipo||owner||frente) ─────
            const opLabel   = (codOp ? codOp + ' - ' : '') + (descOp || grupoOperac || 'Desconhecido');
            const opGrupoKey = opLabel + '||' + clf.tipo + '||' + clf.owner + '||' + (frente || '');
            if (!byOp.has(opGrupoKey)) {
                byOp.set(opGrupoKey, {
                    descOperacao : descOp || grupoOperac,
                    codOperacao  : codOp,
                    categoria    : cat,
                    grupoOperac  : grupoOperac,
                    tipo         : clf.tipo,
                    owner        : clf.owner,
                    frente       : frente,
                    hrsTotal     : 0,
                    nLinhas      : 0,
                    equips       : new Set(),
                });
            }
            const og = byOp.get(opGrupoKey);
            og.hrsTotal += hrsOp;
            og.nLinhas++;
            og.equips.add(cod);
        }

        // ── Log de descarte ───────────────────────────────────────────────────
        if (linhasDescartadas > 0) {
            console.warn(`[OEE ALERTA] ${linhasDescartadas} linhas descartadas (prefixo inválido ou grupo fora da whitelist)`);
        }

        // ── Totais e OEE global ───────────────────────────────────────────────
        const tempoTotal = Object.values(gTempos).reduce((a, b) => a + b, 0);
        const disp = tempoTotal > 0 ? Math.min(1, gTempos.PRODUTIVO / tempoTotal) : 0;
        const perf = g_hrsMot  > 0 ? Math.min(1, g_hrsCBA  / g_hrsMot) : 0;
        const qual = g_hrsMot  > 0 ? Math.min(1, g_hrsImpl / g_hrsMot) : 0;
        const oee  = disp * perf * qual;

        // ── Consumo ponderado real — Σlitros / ΣhrsMotor ────────────────────
        // NUNCA usar ColConAcm['Litros/Hr'] diretamente
        const consumoLhReal = g_hrsMot > 0 && g_litros > 0 ? g_litros / g_hrsMot : null;

        // ── Grupos de equipamento ─────────────────────────────────────────────
        const grupos = {
            colh_propria  : _emptyGrupo(),
            colh_terceira : _emptyGrupo(),
            cam_proprio   : _emptyGrupo(),
            cam_terceiro  : _emptyGrupo(),
            transbordo    : _emptyGrupo(),
        };

        byEquip.forEach(eq => {
            const gKey =
                eq.tipo === 'colhedora' && eq.owner === 'propria'  ? 'colh_propria'  :
                eq.tipo === 'colhedora' && eq.owner === 'terceiro' ? 'colh_terceira' :
                eq.tipo === 'caminhao'  && eq.owner === 'proprio'  ? 'cam_proprio'   :
                eq.tipo === 'caminhao'  && eq.owner === 'terceiro' ? 'cam_terceiro'  :
                eq.tipo === 'transbordo'                           ? 'transbordo'    : null;
            if (!gKey) return;

            const g = grupos[gKey];
            for (const k of Object.keys(eq.tempos)) g.tempos[k] += eq.tempos[k];
            g.hrsMot  += eq.hrsMot;
            g.hrsCBA  += eq.hrsCBA;
            g.hrsImpl += eq.hrsImpl;
            g.hrsRTK  += eq.hrsRTK;
            g.hrsEst  += eq.hrsEst;
            g.area    += eq.area;
            g.litros  += eq.litros;

            const totE = Object.values(eq.tempos).reduce((a, b) => a + b, 0);
            const dE   = totE  > 0 ? Math.min(1, eq.tempos.PRODUTIVO / totE)   : 0;
            const pE   = eq.hrsMot > 0 ? Math.min(1, eq.hrsCBA / eq.hrsMot)   : 0;
            const qE   = eq.hrsMot > 0 ? Math.min(1, eq.hrsImpl / eq.hrsMot)  : 0;

            // TCH: requer cruzamento com PRODUCAO — aqui é 0, preenchido externamente
            const topOps = Array.from(eq.ops.entries())
                .sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([desc, hrs]) => ({ desc, hrs }));

            g.equips.push({
                cod       : eq.cod,
                descEquip : eq.descEquip,
                frente    : eq.frente,
                tipo      : eq.tipo,
                owner     : eq.owner,
                disp      : dE,
                perf      : pE,
                qual      : qE,
                oee       : dE * pE * qE,
                tempos    : { ...eq.tempos },
                hrsMot    : eq.hrsMot,
                hrsCBA    : eq.hrsCBA,
                hrsImpl   : eq.hrsImpl,
                hrsRTK    : eq.hrsRTK,
                hrsEst    : eq.hrsEst,
                area      : eq.area,
                litros    : eq.litros,
                dias      : eq.datas.size || 1,
                topOps,
                // consumo por equip (L/h ponderado)
                consumoLh : eq.hrsMot > 0 && eq.litros > 0 ? eq.litros / eq.hrsMot : null,
            });
        });

        // ── OEE por grupo ─────────────────────────────────────────────────────
        const _oeeGrupo = (g) => {
            const tot = Object.values(g.tempos).reduce((a, b) => a + b, 0);
            const d   = tot  > 0 ? Math.min(1, g.tempos.PRODUTIVO / tot) : 0;
            const p   = g.hrsMot > 0 ? Math.min(1, g.hrsCBA / g.hrsMot) : 0;
            const q   = g.hrsMot > 0 ? Math.min(1, g.hrsImpl / g.hrsMot) : 0;
            return {
                disp: d, perf: p, qual: q, oee: d * p * q,
                tempos   : g.tempos,
                tempoTotal: tot,
                hrsMot   : g.hrsMot, hrsCBA: g.hrsCBA, hrsImpl: g.hrsImpl,
                hrsRTK   : g.hrsRTK, hrsEst: g.hrsEst, area: g.area,
                consumoLh: g.hrsMot > 0 && g.litros > 0 ? g.litros / g.hrsMot : null,
                nEquips  : g.equips.length,
                // Ranking: ordenado por OEE desc
                ranking  : [...g.equips].sort((a, b) => b.oee - a.oee),
            };
        };

        // ── Gargalos consolidados ─────────────────────────────────────────────
        const gargalosAll = Array.from(byOp.values())
            .map(g => ({ ...g, nEquips: g.equips.size }))
            .sort((a, b) => b.hrsTotal - a.hrsTotal);

        const _top = (cat, n = 10) => gargalosAll.filter(g => g.categoria === cat).slice(0, n);

        // ── Análise por frente ────────────────────────────────────────────────
        const frenteStats = Array.from(byFrente.values()).map(f => {
            const tot = Object.values(f.tempos).reduce((a, b) => a + b, 0);
            const d   = tot > 0 ? f.tempos.PRODUTIVO / tot : 0;
            // Gargalo dominante da frente (maior tempo improdutivo)
            const topGargalo = Array.from(f.gargalos.entries())
                .sort((a, b) => b[1] - a[1])[0];
            return {
                frente    : f.frente,
                tempos    : f.tempos,
                tempoTotal: tot,
                disp      : d,
                nEquips   : f.equips.size,
                hrsMot    : f.hrsMot,
                hrsCBA    : f.hrsCBA,
                hrsRTK    : f.hrsRTK,
                hrsEst    : f.hrsEst,
                area      : f.area,
                gargalo   : topGargalo ? { desc: topGargalo[0], hrs: topGargalo[1] } : null,
            };
        }).sort((a, b) => b.disp - a.disp);

        // ── Indicadores especiais (11 gargalos operacionais) ─────────────────
        const indicadores = _buildIndicadores(byOp, byEquip);

        // ── Nº de dias únicos ─────────────────────────────────────────────────
        const nDias = datas.size || 1;

        // ── Validação ─────────────────────────────────────────────────────────
        const somaTempos = Object.values(gTempos).reduce((a, b) => a + b, 0);
        const validacao  = {
            somaTemposIgualTotal : Math.abs(somaTempos - tempoTotal) < 0.01,
            oeeLeUm              : oee <= 1,
            oeeNaoNegativo       : oee >= 0,
            semNaN               : !isNaN(oee) && !isNaN(disp) && !isNaN(perf) && !isNaN(qual),
            semNegativo          : Object.values(gTempos).every(v => v >= 0),
            linhasDescartadas,
        };

        console.log(
            `[OEE_TPL_Analysis v3] OEE:${(oee * 100).toFixed(1)}%`,
            `D:${(disp * 100).toFixed(1)}%`,
            `P:${(perf * 100).toFixed(1)}%`,
            `Q:${(qual * 100).toFixed(1)}%`,
            `| Equip:${byEquip.size} | Dias:${nDias}`,
            `| Descartadas:${linhasDescartadas}`,
            `| Consumo L/h:${consumoLhReal ? consumoLhReal.toFixed(1) : 'N/D'}`,
            `| Validação:`, validacao
        );

        return {
            oee: {
                disponibilidade : Math.max(0, Math.min(1, disp)),
                performance     : Math.max(0, Math.min(1, perf)),
                qualidade       : Math.max(0, Math.min(1, qual)),
                oee             : Math.max(0, Math.min(1, oee)),
                qualProxy       : true,  // badge PROXY obrigatório no renderer
            },
            tempos: {
                produtivo     : Math.max(0, gTempos.PRODUTIVO),
                improdutivo   : Math.max(0, gTempos.IMPRODUTIVO),
                manutencao    : Math.max(0, gTempos.MANUTENCAO),
                climatico     : Math.max(0, gTempos.CLIMATICO),
                preventivo    : Math.max(0, gTempos.PREVENTIVO),
                indeterminado : Math.max(0, gTempos.INDETERMINADO),
                total         : tempoTotal,
            },
            grupos: {
                colh_propria  : _oeeGrupo(grupos.colh_propria),
                colh_terceira : _oeeGrupo(grupos.colh_terceira),
                cam_proprio   : _oeeGrupo(grupos.cam_proprio),
                cam_terceiro  : _oeeGrupo(grupos.cam_terceiro),
                transbordo    : _oeeGrupo(grupos.transbordo),
            },
            gargalos: {
                todos        : gargalosAll.slice(0, 20),
                improdutivos : _top('IMPRODUTIVO'),
                manutencao   : _top('MANUTENCAO'),
                climaticos   : _top('CLIMATICO'),
            },
            frentes    : frenteStats,
            indicadores,
            consumo: {
                litrosTotal   : g_litros,
                hrsMotorTotal : g_hrsMot,
                // Consumo médio REAL ponderado — Σlitros/ΣhrsMotor
                consumoLhReal,
                // Meta para comparação (configurável)
                metaLh        : 36,
                acimaDaMeta   : consumoLhReal != null ? consumoLhReal > 36 : null,
            },
            meta: {
                nEquipamentos : byEquip.size,
                nDias,
                hrsMotorTotal : g_hrsMot,
                hrsImplTotal  : g_hrsImpl,
                hrsCBATotal   : g_hrsCBA,
                hrsRTKTotal   : g_hrsRTK,
                hrsEstTotal   : g_hrsEst,
                areaTotal     : g_area,
                aderenciaRTK  : g_hrsMot > 0 ? g_hrsRTK / g_hrsMot : 0,
                periodo       : {
                    inicio : [...datas].sort()[0]    || null,
                    fim    : [...datas].sort().pop() || null,
                },
                validacao,
            },
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INDICADORES ESPECIAIS (11 gargalos operacionais)
    // ─────────────────────────────────────────────────────────────────────────
    function _buildIndicadores(byOp, byEquip) {
        const r = {};

        byOp.forEach((v) => {
            const cod = v.codOperacao;
            const desc = v.descOperacao || '';

            // helper de acumulação
            const acc = (key, init) => {
                if (!r[key]) r[key] = init();
                return r[key];
            };

            // 3038 — Sem Apontamento (todos os prefixos)
            if (cod === '3038' || /sem\s*apontamento/i.test(desc)) {
                const x = acc('semApontamento', () => ({ hrsTotal: 0, equips: new Set(), porFrente: {} }));
                x.hrsTotal += v.hrsTotal;
                v.equips.forEach(e => x.equips.add(e));
                if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
            }

            // 3010 — Lavagem/Lubrificação (80, 93 — colhedoras)
            if (cod === '3010' || /lavagem|lubri/i.test(desc)) {
                if (v.tipo === 'colhedora') {
                    const x = acc('lavagemLubrificacao', () => ({ hrsTotal: 0, equips: new Set(), porFrente: {} }));
                    x.hrsTotal += v.hrsTotal;
                    v.equips.forEach(e => x.equips.add(e));
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 3070 — Catando Cana (92 — transbordos)
            if (cod === '3070' || /catand[oa]?\s*cana|cata\s*cana/i.test(desc)) {
                if (v.tipo === 'transbordo') {
                    const x = acc('catandoCana', () => ({ hrsTotal: 0, porFrente: {}, anomalias: {} }));
                    x.hrsTotal += v.hrsTotal;
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 3061 — Aguardando Colhedora (92 — transbordos)
            if (cod === '3061' || /aguard.*colhed/i.test(desc)) {
                if (v.tipo === 'transbordo') {
                    const x = acc('aguardandoColhedora', () => ({ hrsTotal: 0, porFrente: {}, maiorFrente: null, anomalias: {} }));
                    x.hrsTotal += v.hrsTotal;
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 3056 — Engate/Desengate de Reboque (91, 31 — caminhões)
            if (cod === '3056' || /engate|desengate/i.test(desc)) {
                if (v.tipo === 'caminhao') {
                    const x = acc('engateDesengate', () => ({ hrsTotal: 0, equips: new Set(), porFrente: {} }));
                    x.hrsTotal += v.hrsTotal;
                    v.equips.forEach(e => x.equips.add(e));
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 4014 — Fila Única de Transbordo (92)
            if (cod === '4014' || /fila.*transbordo|transbordo.*fila/i.test(desc)) {
                if (v.tipo === 'transbordo') {
                    const x = acc('filaTransbordo', () => ({ hrsTotal: 0, porFrente: {}, anomalias: {} }));
                    x.hrsTotal += v.hrsTotal;
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 3059 — Batendo Pneus (91, 31 — caminhões) — ALERTA se > 10 min (0.1667h)
            if (cod === '3059' || /batend.*pneu|pneu.*baten/i.test(desc)) {
                if (v.tipo === 'caminhao') {
                    const x = acc('batendoPneus', () => ({ hrsTotal: 0, alertas: [], porFrente: {} }));
                    x.hrsTotal += v.hrsTotal;
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                    if (v.hrsTotal > 10 / 60) {
                        v.equips.forEach(e => {
                            if (!x.alertas.find(a => a.cod === e)) {
                                x.alertas.push({ cod: e, hrs: v.hrsTotal, frente: v.frente });
                            }
                        });
                    }
                }
            }

            // 3047 — Aguardando Manobra Transbordo
            if (cod === '3047' || /aguard.*manobrа.*transbordo|aguard.*transbordo.*manobrа|aguard.*manobra/i.test(desc)) {
                const x = acc('aguardManobraTransbordo', () => ({ hrsTotal: 0, porFrente: {} }));
                x.hrsTotal += v.hrsTotal;
                if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
            }

            // 3021 — Aguardando Transbordo (todos)
            if (cod === '3021' || /aguard.*transbordo$/i.test(desc)) {
                const x = acc('aguardandoTransbordo', () => ({ hrsTotal: 0, porFrente: {}, anomalias: {} }));
                x.hrsTotal += v.hrsTotal;
                if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
            }

            // 3051 — Caminhão Carregando (31, 91)
            if (cod === '3051' || /caminh.*carregand/i.test(desc)) {
                if (v.tipo === 'caminhao') {
                    const x = acc('caminhaoCarregando', () => ({ hrsTotal: 0, porFrente: {} }));
                    x.hrsTotal += v.hrsTotal;
                    if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
                }
            }

            // 3027 — Manutenção Mecânica (todos)
            if (cod === '3027' || /manutenc.*mecan|mecani.*manutenc|manutencao\s*mecan/i.test(desc)) {
                const x = acc('manutencaoMecanica', () => ({ hrsTotal: 0, equips: new Set(), porFrente: {} }));
                x.hrsTotal += v.hrsTotal;
                v.equips.forEach(e => x.equips.add(e));
                if (v.frente) x.porFrente[v.frente] = (x.porFrente[v.frente] || 0) + v.hrsTotal;
            }
        });

        // ── Pós-processamento: frente com maior tempo + anomalias ────────────
        const comFrente = [
            'aguardandoColhedora', 'catandoCana', 'filaTransbordo',
            'aguardandoTransbordo', 'aguardManobraTransbordo',
        ];
        for (const key of comFrente) {
            if (!r[key]) continue;
            const pf  = r[key].porFrente;
            const entries = Object.entries(pf).sort((a, b) => b[1] - a[1]);
            r[key].maiorFrente = entries[0] ? { frente: entries[0][0], hrs: entries[0][1] } : null;
            r[key].anomalias   = _anomalia(pf);
        }

        // Converte Sets para contagens
        for (const key of ['semApontamento', 'lavagemLubrificacao', 'engateDesengate', 'manutencaoMecanica']) {
            if (r[key] && r[key].equips) r[key].nEquips = r[key].equips.size;
        }

        return r;
    }

    // ── Estrutura vazia de grupo ──────────────────────────────────────────────
    function _emptyGrupo() {
        return {
            tempos : { PRODUTIVO:0, IMPRODUTIVO:0, MANUTENCAO:0, CLIMATICO:0, PREVENTIVO:0, INDETERMINADO:0 },
            hrsMot : 0, hrsCBA: 0, hrsImpl: 0, hrsRTK: 0, hrsEst: 0, area: 0, litros: 0,
            equips : [],
        };
    }

    // ── Estrutura de retorno vazia ────────────────────────────────────────────
    function _empty() {
        const t = { PRODUTIVO:0, IMPRODUTIVO:0, MANUTENCAO:0, CLIMATICO:0, PREVENTIVO:0, INDETERMINADO:0 };
        const g = {
            disp:0, perf:0, qual:0, oee:0,
            tempos:{...t}, tempoTotal:0,
            hrsMot:0, hrsCBA:0, hrsImpl:0, hrsRTK:0, hrsEst:0, area:0, consumoLh:null,
            nEquips:0, ranking:[],
        };
        return {
            oee        : { disponibilidade:0, performance:0, qualidade:0, oee:0, qualProxy:true },
            tempos     : { produtivo:0, improdutivo:0, manutencao:0, climatico:0, preventivo:0, indeterminado:0, total:0 },
            grupos     : { colh_propria:{...g}, colh_terceira:{...g}, cam_proprio:{...g}, cam_terceiro:{...g}, transbordo:{...g} },
            gargalos   : { todos:[], improdutivos:[], manutencao:[], climaticos:[] },
            frentes    : [],
            indicadores: {},
            consumo    : { litrosTotal:0, hrsMotorTotal:0, consumoLhReal:null, metaLh:36, acimaDaMeta:null },
            meta       : { nEquipamentos:0, nDias:0, hrsMotorTotal:0, hrsImplTotal:0, hrsCBATotal:0, hrsRTKTotal:0, hrsEstTotal:0, areaTotal:0, aderenciaRTK:0, periodo:{inicio:null, fim:null}, validacao:{} },
        };
    }

    // ── Exposição global ──────────────────────────────────────────────────────
    window.OEE_TPL_Analysis = {
        analyze        : analyzeTpl,
        classifyEquip  : _classifyEquip,
        isGrupoValido  : _isGrupoValido,
        extractDate    : _extractDate,
        classifyOp     : _classifyOp,
    };
    console.log('[OEE_TPL_Analysis v3] Módulo registrado.');

})();