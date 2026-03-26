// ============================================================
// visualizer-consumo.js  –  AgroAnalytics  v10.2 (TMD Acumulado Correto)
// Aba de Consumo – Cálculos Blindados & Padrão Visão Global
// 
// FIX v10.1:
//   - Correção do TMD Acumulado (ColConAcm): 
//     * _getTonCana com fallback via Ton/Hr × Horas
//     * _getDiasTrab com fallback via Qtd Dias Periodo
//     * _calcStats agora soma corretamente toneladas e dias
// ============================================================

if (typeof VisualizerConsumo === 'undefined') {
class VisualizerConsumo {
    constructor() {
        console.log('[Consumo] v10.2 (TMD Acumulado Correto) iniciado');
        this.METAS = { TMD: 633, LITROS_HR: 36, LITROS_TON: 1.02, DISP: 85, RENG: 0.98 };
    }

    // ─────────────────────────────────────────────
    // ESTILOS CSS PROFISSIONAIS (IDÊNTICO À VISÃO GLOBAL)
    // ─────────────────────────────────────────────
    _getStyles() {
        return `
        <style id="vc-styles">
        .vc-root { 
            --vc-text: #ffffff; 
            --vc-text-sec: #9ca3af;
            --vc-bg-card: rgba(15, 23, 42, 0.6);
            --vc-bd-card: rgba(255, 255, 255, 0.08);
            --vc-bg-card-hover: rgba(15, 23, 42, 0.8);
            --vc-bg-table-header: rgba(0, 0, 0, 0.2);
            --vc-bg-row-alt: rgba(255, 255, 255, 0.015);
            display:flex; flex-direction:column; gap:22px; 
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: var(--vc-text);
            animation: vc-fade-in 0.4s ease-out;
        }
        
        [data-theme="light"] .vc-root {
            --vc-text: #111827; 
            --vc-text-sec: #4b5563;
            --vc-bg-card: #ffffff;
            --vc-bd-card: #e5e7eb;
            --vc-bg-card-hover: #f9fafb;
            --vc-bg-table-header: #f3f4f6;
            --vc-bg-row-alt: #f9fafb;
        }

        @keyframes vc-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* Header */
        .vc-header { display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:15px; margin-bottom:5px; }
        .vc-title { margin:0 0 5px; font-size:1.2rem; font-weight:800; display:flex; align-items:center; gap:10px; color: var(--vc-text); }
        .vc-title-icon { width:36px; height:36px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:1rem; }
        .vc-subtitle { margin:0; font-size:0.85rem; color:var(--vc-text-sec); }
        
        /* Legenda */
        .vc-legenda { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:5px; }
        .vc-leg { display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--vc-text-sec); }
        .vc-leg-dot { width:10px; height:10px; border-radius:3px; flex-shrink:0; }

        /* Cards KPI */
        .vc-hero { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:15px; }

        /* ── Mobile: 2 cards por linha ── */
        @media (max-width: 600px) {
          .vc-hero { grid-template-columns: repeat(2, 1fr); gap:10px; }
          .vc-kpi-title { font-size:0.75rem; }
          .vc-kpi { padding:10px 12px; }
          .vc-table-wrap { position:relative; }
          .vc-landscape-hint {
            display:flex; align-items:center; gap:6px;
            font-size:0.72rem; color:#94a3b8;
            background:rgba(56,189,248,0.07); border:1px solid rgba(56,189,248,0.15);
            border-radius:8px; padding:6px 12px; margin-bottom:8px;
            animation: vc-pulse-hint 2.5s ease-in-out infinite;
          }
          @keyframes vc-pulse-hint { 0%,100%{opacity:1} 50%{opacity:0.55} }
          .vc-landscape-hint i { font-size:1rem; color:#38bdf8; }
        }
        @media (min-width: 601px) {
          .vc-landscape-hint { display:none; }
        }
        .vc-kpi {
            background: var(--vc-bg-card); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
            border: 1px solid var(--vc-bd-card); border-radius:12px; padding:18px;
            display:flex; flex-direction:column; gap:5px;
            border-left: 4px solid var(--vc-accent, #38bdf8);
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .vc-kpi:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
        .vc-kpi-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; }
        .vc-kpi-title { font-size:0.85rem; color:var(--vc-text); font-weight:800; margin:0; text-transform:uppercase; letter-spacing:0.5px; }
        .vc-sub-label { display: block; font-size: 0.65rem; color: var(--vc-text-sec); font-weight: 600; margin-top: 2px;}
        .vc-kpi-icon { width:34px; height:34px; border-radius:8px; background:rgba(255, 255, 255, 0.05); color:var(--vc-accent); display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0;}
        
        .vc-kpi-meta { font-size:0.7rem; font-weight:700; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid var(--vc-bd-card); color:var(--vc-text-sec); display:inline-flex; align-items:center; gap:5px; align-self:flex-start; margin-bottom:8px;}
        [data-theme="light"] .vc-kpi-meta { background: #f3f4f6; color: var(--text, #F0F0F0); }
        .vc-kpi-notice { font-size:0.6rem; color:#94a3b8; background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.1); border-radius:5px; padding:3px 7px; margin-top:4px; line-height:1.4; }
        [data-theme="light"] .vc-kpi-notice { color:#64748b; background:#f8fafc; border-color:#e2e8f0; }

        .vc-kpi-row { display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--vc-bd-card); margin-top:6px;}
        .vc-kpi-label { font-size:0.75rem; color:var(--vc-text-sec); font-weight:600; display:flex; align-items:center; gap:6px; }

        /* Section Title */
        .vc-section-title { font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing:.8px; color:var(--vc-text-sec); margin-bottom:12px; margin-top:10px; display:flex; align-items:center; gap:8px; border-bottom: 1px solid var(--vc-bd-card); padding-bottom: 8px;}

        /* Tabela */
        .vc-table-wrap { background: var(--vc-bg-card); border: 1px solid var(--vc-bd-card); border-radius: 12px; overflow-x: auto; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .vc-table { width: 100%; border-collapse: collapse; text-align: right; }
        .vc-table th { background: var(--vc-bg-table-header); padding: 12px 16px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vc-text-sec); border-bottom: 1px solid var(--vc-bd-card); }
        .vc-table th.left { text-align: left; }
        .vc-table td { padding: 8px 16px; font-size: 0.85rem; font-weight: 600; color: var(--vc-text); font-variant-numeric: tabular-nums; border-bottom: 1px solid var(--vc-bd-card); vertical-align: middle; }
        .vc-table td.left { text-align: left; }
        .vc-table tr:hover td { background: var(--vc-bg-card-hover); }
        
        /* Agrupamento de Frente */
        .vc-group-header td { background: rgba(56, 189, 248, 0.05); color: #38bdf8; text-align: left; font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px; border-bottom: 1px solid rgba(56, 189, 248, 0.15); border-top: 2px solid rgba(56, 189, 248, 0.2); }
        [data-theme="light"] .vc-group-header td { color: #0284c7; background: #e0f2fe; border-bottom-color: #bae6fd; border-top-color: #7dd3fc;}

        /* Linha de Meta Tabela */
        .vc-meta-row td { background: rgba(245, 158, 11, 0.03); color: #fcd34d; font-size: 0.75rem; font-weight: 700; border-bottom: 1px dashed rgba(245, 158, 11, 0.2); padding-top: 8px; padding-bottom: 8px;}
        [data-theme="light"] .vc-meta-row td { color: #b45309; background: #fffbeb; border-bottom-color: #fde68a; }

        /* Ajustes de Linha Dupla */
        .vc-row-dia td { border-bottom: none; padding-bottom: 4px; padding-top: 12px;}
        .vc-row-acm td { padding-top: 4px; padding-bottom: 12px; color: var(--vc-text-sec); font-size: 0.8rem; }
        .vc-row-alt td { background: var(--vc-bg-row-alt); }

        /* Badges de Status */
        .vc-b-red { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); padding:3px 10px; border-radius:6px; font-weight:800; display:inline-block; min-width:65px; text-align:center;}
        .vc-b-green { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); padding:3px 10px; border-radius:6px; font-weight:800; display:inline-block; min-width:65px; text-align:center;}
        .vc-b-blue { background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); padding:3px 10px; border-radius:6px; font-weight:800; display:inline-block; min-width:65px; text-align:center;}
        .vc-b-neu { background: rgba(255,255,255,0.05); color: #d1d5db; border: 1px solid rgba(255,255,255,0.1); padding:3px 10px; border-radius:6px; font-weight:800; display:inline-block; min-width:65px; text-align:center;}

        [data-theme="light"] .vc-b-red { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
        [data-theme="light"] .vc-b-green { background: #dcfce7; color: #15803d; border-color: #bbf7d0; }
        [data-theme="light"] .vc-b-blue { background: #dbeafe; color: #1d4ed8; border-color: #bae6fd; }
        [data-theme="light"] .vc-b-neu { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
        </style>`;
    }

    // ─────────────────────────────────────────────
    // PONTO DE ENTRADA
    // ─────────────────────────────────────────────
    render(d1Data, acmData, producaoData, dispD1Data, dispAcmData) {
        const container = document.getElementById('consumo-tab-content');
        if (!container) return;

        // d1Data: ColConD1 (dia atual) — keepMax=false mantém linha do dia (menor Qtd Dias)
        // acmData: ColConAcm (acumulado/safra) — keepMax=true mantém maior período
        const d1Prop  = this._filterProprias(Array.isArray(d1Data)  ? d1Data  : [], false);
        const acmProp = this._filterProprias(Array.isArray(acmData) ? acmData : [], true);

        if (d1Prop.length === 0 && acmProp.length === 0) {
            container.innerHTML = this._getStyles() + `
                <div class="vc-root" style="align-items:center; justify-content:center; padding:100px 20px;">
                    <i class="fas fa-gas-pump" style="font-size:3rem; color:var(--vc-text-sec); opacity:0.3; margin-bottom:1rem;"></i>
                    <h3 style="margin:0; font-weight:700; color:var(--vc-text);">Sem dados de consumo</h3>
                    <p style="font-size:0.85rem; color:var(--vc-text-sec); margin-top:0.5rem;">Aguardando sincronização de arquivos das colhedoras.</p>
                </div>`;
            return;
        }

        const statsD1  = this._calcStats(d1Prop);
        const statsAcm = this._calcStats(acmProp);
        const dispD1   = this._calcDispMedia(dispD1Data,  d1Prop);
        const dispAcm  = this._calcDispMedia(dispAcmData, acmProp);

        container.innerHTML =
            this._getStyles() +
            `<div class="vc-root">
                ${this._buildHeader(statsD1.count, statsAcm.count)}
                ${this._buildCards(statsD1, statsAcm, dispD1, dispAcm)}
                ${this._buildFrentesTable(d1Prop, acmProp, producaoData, dispD1Data, dispAcmData)}
            </div>`;
    }

    // ─────────────────────────────────────────────
    // PARSER MATEMÁTICO UNIVERSAL (À PROVA DE BUGS)
    // ─────────────────────────────────────────────
    _p(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let s = String(val).trim().replace(/[^\d.,-]/g, '');
        if (!s) return 0;

        const numDots   = (s.match(/\./g) || []).length;
        const numCommas = (s.match(/,/g)  || []).length;

        // Múltiplos pontos: separador de milhar BR "2.818.825,42"
        if (numDots > 1) {
            s = s.replace(/\./g, '').replace(',', '.');
            return parseFloat(s) || 0;
        }
        // Múltiplas vírgulas: separador de milhar US "2,818,825.42"
        if (numCommas > 1) {
            s = s.replace(/,/g, '');
            return parseFloat(s) || 0;
        }

        const lastComma = s.lastIndexOf(',');
        const lastDot   = s.lastIndexOf('.');

        // Formato BR: "1.234,56" → vírgula é decimal
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        }
        // Formato US: "1,234.56" → ponto é decimal
        else if (lastDot > lastComma && lastComma !== -1) {
            s = s.replace(/,/g, '');
        }
        // Só vírgula: "1234,56"
        else if (lastComma !== -1 && lastDot === -1) {
            s = s.replace(',', '.');
        }

        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // ─────────────────────────────────────────────
    // LEITORES DE COLUNAS BLINDADOS (Ignoram a ordem/nome no Excel)
    // ─────────────────────────────────────────────
    _getVal(row, exactWords) {
        if (!row) return 0;
        const rowKeys = Object.keys(row);
        for (const rk of rowKeys) {
            const cleanRk = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (exactWords.includes(cleanRk)) {
                const v = this._p(row[rk]);
                if (v > 0) return v;
            }
        }
        return 0;
    }

    // keepMax=true → mantém linha com maior Qtd Dias (acumulado/safra)
    // keepMax=false → mantém linha com menor Qtd Dias ≥ 1 (dia atual)
    _filterProprias(rows, keepMax = true) {
        const allProp = rows.filter(r => String(r['Equip'] || r['equip'] || r['EQUIP'] || '').trim().startsWith('80'));
        // Se não há coluna "Periodo", retorna tudo diretamente
        const hasPeriodo = allProp.some(r => r['Periodo'] !== undefined || r['periodo'] !== undefined);
        if (!hasPeriodo) return allProp;
        // Deduplica por máquina mantendo o período correto
        const byEquip = new Map();
        allProp.forEach(r => {
            const eq  = String(r['Equip'] || r['equip'] || '').trim();
            const qtd = parseFloat(r['Qtd Dias Periodo'] || r['qtd dias periodo'] || r['QtdDiasPeriodo'] || 0);
            const existing = byEquip.get(eq);
            if (!existing) {
                byEquip.set(eq, r);
            } else {
                const existQtd = parseFloat(existing['Qtd Dias Periodo'] || 0);
                const shouldReplace = keepMax ? (qtd > existQtd) : (qtd > 0 && qtd < existQtd);
                if (shouldReplace) byEquip.set(eq, r);
            }
        });
        return Array.from(byEquip.values());
    }

    // 🔧 FIX 1: _getTonCana com fallback via Ton/Hr × Horas
    _getTonCana(r) {
        // Tenta leitura direta do campo "Ton. Cana"
        const direct = this._getVal(r, ['toncana', 'toneladas', 'tonelada', 'ton']);
        if (direct > 0) return direct;
        
        // Fallback: Ton/Hr × Horas (ambos presentes no ColConAcm)
        const tonHr = this._getVal(r, ['tonhr', 'ton/hr', 'tonperhour', 'tonporhora', 'tonhora']);
        const hrs   = this._getHoras(r);
        
        if (tonHr > 0 && hrs > 0) {
            const calc = tonHr * hrs;
            if (calc > 0 && calc < 50000) return calc; // sanity: max 50k ton por máquina
        }
        return 0;
    }

    // 🔧 FIX 2: _getHoras com fallback via fallback genérico
    _getHoras(r) {
        const direct = this._getVal(r, ['horas', 'horasmotor', 'horasmotorligado', 'hrsmotor', 'hrsoperacional', 'hrsoperacionais', 'horasoperacionais', 'horasoperacional']);
        if (direct > 0) return direct;
        
        // Fallback: procura qualquer campo com "hora" no nome
        for (const key of Object.keys(r || {})) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('hora') && !lowerKey.includes('ton')) {
                const v = this._p(r[key]);
                if (v > 0 && v < 5000) return v; // sanity: max 5000h
            }
        }
        return 0;
    }

    _getLitrosTotal(r) { return this._getVal(r, ['combustivel', 'litrostotal', 'litrosconsumo', 'combustivellitros']); }
    _getLitrosHr(r) { return this._getVal(r, ['litroshr', 'litros/hr', 'litros_hr', 'litros/hora', 'litros_hora', 'litroshora', 'litrosperhour', 'lhr', 'l/h', 'lh', 'consumohorario', 'consumo']); }
    _getLitrosTon(r) { return this._getVal(r, ['litroston', 'litros/ton', 'litros_ton', 'litrosperton', 'l/t', 'lt']); }
    
    // v10.2: _getDiasTrab usa APENAS Dias Trab. real para TMD correto
    // NÃO usa Qtd Dias Periodo como fallback (causava TMD menor que o real)
    _getDiasTrab(r) {
        // Prioridade 1: campo direto "Dias Trab." (dias efetivamente trabalhados)
        const direct = this._getVal(r, ['diastrab', 'diastrabalhados', 'dias']);
        if (direct > 0) return direct;
        
        // Prioridade 2: calcula pela diferença de datas no campo Periodo
        const periodo = r['Periodo'] || r['periodo'] || '';
        if (periodo && typeof periodo === 'string') {
            const dates = periodo.match(/\d{2}\/\d{2}\/\d{4}/g);
            if (dates && dates.length === 2) {
                const [d1, d2] = dates;
                const [dd1, mm1, aa1] = d1.split('/').map(Number);
                const [dd2, mm2, aa2] = d2.split('/').map(Number);
                const inicio = new Date(aa1, mm1-1, dd1);
                const fim = new Date(aa2, mm2-1, dd2);
                const diff = Math.round((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
                if (diff > 0 && diff < 366) return diff;
            }
        }
        // Prioridade 3 (último recurso): Qtd Dias Periodo
        const qtd = this._p(r['Qtd Dias Periodo'] || r['qtd dias periodo'] || r['QtdDiasPeriodo'] || 0);
        if (qtd > 0) return qtd;
        
        return 1;
    }
    
    _getREnerg(r) {
        // ColConAcm: "R. Energetico" (sem acento) — valores tipicamente 60–130 (índice × 100)
        // ColConD1:  "R. Energético" (com acento) — mesma escala
        // _normalize: converte para escala 0–2 (divide por 100 se valor > 2)
        const _normalize = v => {
            if (v <= 0) return 0;
            if (v > 2)  return v / 100; // e.g. 114 → 1.14
            return v;                   // já está em 0–2
        };

        const DIRECT_KEYS = [
            'R. Energetico', 'R. Energético',
            'R.Energetico',  'R.Energético',
            'R. Energetico ','R. Energético ',
            ' R. Energetico',' R. Energético',
            'R. Energetico	','R. Energético	',
        ];
        for (const k of DIRECT_KEYS) {
            if (r[k] !== undefined && r[k] !== null && r[k] !== '') {
                const v = this._p(r[k]);
                const n = _normalize(v);
                if (n > 0) return n;
            }
        }
        // Fuzzy: percorre todas as chaves normalizando acentos
        const TARGET = ['renergetico', 'rendimentoenergetico', 'rendenerg', 'energetico'];
        const _clean = s => s.toLowerCase()
            .replace(/[áàâãä]/g,'a').replace(/[éèêë]/g,'e')
            .replace(/[íìîï]/g,'i').replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u')
            .replace(/[^a-z0-9]/g,'');
        for (const key of Object.keys(r || {})) {
            if (TARGET.includes(_clean(key))) {
                const v = this._p(r[key]);
                const n = _normalize(v);
                if (n > 0) return n;
            }
        }
        return 0;
    }
    
    _getDispPct(r) {
        // ⚠️ colConD1/colConAcm: campo é 'Disp %' (com espaço e sinal %)
        const raw = r['Disp %'] ?? r['Disp%'] ?? r['DISP %'] ?? r['Disp'] ?? r['disp'] ?? null;
        if (raw !== null && raw !== undefined && raw !== '') {
            let v = this._p(raw);
            if (v > 100) v = v / 100;       // scale error: 9150 → 91.50
            else if (v > 0 && v < 1) v = v * 100;  // decimal: 0.91 → 91
            return (v > 0 && v <= 100) ? v : null;
        }
        // fallback: procura por chaves genéricas
        const v2 = this._getVal(r, ['disp', 'disponibilidade', 'disppct']);
        if (!v2) return null;
        return v2 > 100 ? v2 / 100 : (v2 > 1 ? v2 : v2 * 100);
    }

    // ─────────────────────────────────────────────
    // LÊ CAMPO PRÉ-CALCULADO DE UMA ROW (ColConAcm/ColConD1)
    // ─────────────────────────────────────────────
    _getPreCalcLhr(r) {
        // ColConAcm: "Litros/Hr" já é a taxa L/h calculada por máquina
        const v = this._p(r['Litros/Hr'] ?? r['Litros/hr'] ?? r['litros/hr'] ?? r['LitrosHr'] ?? '');
        return (v > 0 && v < 200) ? v : 0; // sanity: L/h deve ser < 200
    }
    _getPreCalcLton(r) {
        const v = this._p(r['Litros/Ton'] ?? r['Litros/ton'] ?? r['litros/ton'] ?? r['LitresTon'] ?? '');
        return (v > 0 && v < 20) ? v : 0; // sanity: L/t deve ser < 20
    }

    // ─────────────────────────────────────────────
    // CÁLCULOS GLOBAIS — MÉDIA POR MÁQUINA (não pool de brutos)
    // 🔧 FIX 4: _calcStats corrigido para somar corretamente toneladas e dias
    // ─────────────────────────────────────────────
    _calcStats(rows) {
        // ================================================================
        // REGRA FIXA: L/h e L/t são MÉDIAS por máquina.
        // Para cada máquina: usa campo pré-calculado se > 0,
        // senão calcula a partir dos brutos (comb/horas ou comb/ton).
        // NUNCA usa sumL/sumH global (causa "soma maluca").
        //
        // 🔧 TMD ACUMULADO — MÉDIA PONDERADA POR HORAS (v10.3):
        //   TMD = Σ(Ton_i) / Σ(Horas_i / 24)
        //   Apenas equipamentos com horas > MIN_HORAS_DIA entram no cálculo.
        //   Isso descarta automaticamente dias de chuva / máquinas paradas
        //   sem precisar de filtro manual, pois horas ≈ 0 nesses dias.
        //   Resultado esperado: entre 400–700 t/máq/dia.
        // ================================================================
        const MIN_HORAS_DIA = 4; // mínimo de horas produtivas para o dia ser válido
        const z = { TMD: 0, LITROS_HR: 0, LITROS_TON: 0, RENG: 0, count: 0 };
        if (!rows || rows.length === 0) return z;

        let sumTon = 0, sumD = 0, cTon = 0;
        let sumLhr = 0, cLhr = 0;
        let sumLton = 0, cLton = 0;
        let sumRe = 0, cRe = 0;

        rows.forEach(r => {
            // 🔧 FIX: _getTonCana agora tem fallback via Ton/Hr × Horas
            const ton  = this._getTonCana(r);
            // 🔧 FIX: _getDiasTrab agora tem fallback via Qtd Dias Periodo
            const dias = this._getDiasTrab(r);
            const h    = this._getHoras(r);
            const comb = this._getLitrosTotal(r);
            const re   = this._getREnerg(r);

            // Log para debug (apenas se ton ou dias não estiverem sendo capturados)
            if (ton === 0 && dias === 0 && rows.length > 0) {
                console.debug('[Consumo] Ton/Dias zero para equipamento:', 
                    String(r['Equip'] || r['equip'] || '').trim(),
                    '| Ton:', ton, '| Dias:', dias,
                    '| Campos disponíveis:', Object.keys(r).slice(0, 5));
            }

            // Para TMD ponderado por horas: apenas equipamentos com horas >= MIN_HORAS_DIA
            // entram no cálculo. Dias de chuva / máquinas paradas (h ≈ 0) são descartados
            // automaticamente. Convertemos horas em dias (÷24) para manter t/máq/dia.
            if (h >= MIN_HORAS_DIA && ton > 0) {
                const diasEquiv = h / 24;
                sumTon += ton;
                sumD   += diasEquiv;
                cTon++;
            }
            if (re  > 0) { sumRe  += re;  cRe++; }

            // ── L/h por máquina: pré-calculado OU comb/horas ────────────
            let lhr = this._getPreCalcLhr(r);
            if (!(lhr > 0) && h > 0 && comb > 0) {
                const calc = comb / h;
                if (calc > 0 && calc < 300) lhr = calc; // sanity: max 300 L/h
            }
            if (lhr > 0) { sumLhr += lhr; cLhr++; }

            // ── L/t por máquina: pré-calculado OU comb/ton ──────────────
            let lt = this._getPreCalcLton(r);
            if (!(lt > 0) && ton > 0 && comb > 0) {
                const calc = comb / ton;
                if (calc > 0 && calc < 20) lt = calc; // sanity: max 20 L/t
            }
            if (lt > 0) {
                const ltNorm = lt > 10 ? lt / 100 : lt;
                if (ltNorm > 0 && ltNorm < 20) { sumLton += ltNorm; cLton++; }
            }
        });

        // TMD ponderado por horas: Σ(Ton_i) / Σ(Horas_i / 24)
        // Fallback: divide pelo número de equipamentos se sumD ainda for 0
        const tmd = sumD > 0 ? sumTon / sumD : (cTon > 0 ? sumTon / cTon : 0);

        return {
            TMD       : tmd,
            LITROS_HR : cLhr  > 0 ? sumLhr  / cLhr  : 0,  // MÉDIA, nunca soma
            LITROS_TON: cLton > 0 ? sumLton / cLton : 0,  // MÉDIA, nunca soma
            RENG      : cRe   > 0 ? sumRe   / cRe   : 0,
            count     : cTon  || rows.length,
        };
    }

    _calcDispMedia(dispData, colconRows) {
        if (Array.isArray(colconRows) && colconRows.length > 0) {
            let s = 0, c = 0;
            colconRows.forEach(r => {
                const v = this._getDispPct(r);
                if (v !== null && v > 1 && v <= 100) { s += v; c++; }
            });
            if (c > 0) return s / c;
        }
        if (Array.isArray(dispData) && dispData.length > 0) {
            // colConD1/colConAcm usam 'Equip' (não 'Equipamento')
            const prop = dispData.filter(r => {
                const eq = String(r['Equip'] || r['Equipamento'] || r['equipamento'] || '').trim();
                return eq.startsWith('80');
            });
            if (prop.length > 0) {
                let s = 0, c = 0;
                prop.forEach(r => {
                    let v = this._p(r['Disp %'] ?? r['Disp'] ?? r['disp'] ?? r['DISP'] ?? 0);
                    if (v > 100) v = v / 100;
                    else if (v > 0 && v < 1) v = v * 100;
                    if (v > 0 && v <= 100) { s += v; c++; }
                });
                if (c > 0) return s / c;
            }
        }
        return null;
    }

    // ─────────────────────────────────────────────
    // CÁLCULOS INDIVIDUAIS (Para a Tabela)
    // ─────────────────────────────────────────────
    _rowMetrics(r, dispMap) {
        if (!r) return null;
        const eq    = String(r['Equip'] || r['equip'] || '').trim();
        const ton   = this._getTonCana(r);
        const dias  = this._getDiasTrab(r);
        const horas = this._getHoras(r);
        const comb  = this._getLitrosTotal(r);

        const tmd   = ton > 0 && dias > 0 ? ton / dias : null;
        // Prefer pre-computed column (ColConAcm), fallback to brute calculation
        const lhr   = this._getPreCalcLhr(r) || (horas > 0 ? comb / horas : null);
        const rawLton = this._getPreCalcLton(r) || (ton > 0 ? comb / ton : null);
        const lton  = rawLton && rawLton > 10 ? rawLton / 100 : rawLton;
        const re    = this._getREnerg(r) || null;

        const dispColCon = this._getDispPct(r);
        const dispSheet  = dispMap.has(eq) ? dispMap.get(eq) : null;
        const disp = (dispColCon !== null && dispColCon > 1 && dispColCon <= 100) ? dispColCon : dispSheet;

        return { tmd, lton, lhr, re, disp };
    }

    // ─────────────────────────────────────────────
    // REGRAS DE NEGÓCIO E RENDERIZAÇÃO
    // ─────────────────────────────────────────────
    _clsMaior(v, meta) { if (!meta || !v || v <= 0) return 'neu'; return v >= meta ? 'green' : v >= meta * 0.85 ? 'blue' : 'red'; }
    _clsMenor(v, meta) { if (!meta || !v || v <= 0) return 'neu'; return v <= meta ? 'green' : v <= meta * 1.15 ? 'blue' : 'red'; }
    _clsDisp(v) { if (v === null || v === undefined || v === 0) return 'neu'; return v >= 85 ? 'green' : v >= 75 ? 'blue' : 'red'; }

    _f(n, d=1) { return (!n || isNaN(n) || n === 0) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    _fp(n) { return (!n || isNaN(n) || n === 0) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }

    _buildHeader(nD1, nAcm) {
        const n = Math.max(nD1, nAcm);
        const dt = new Date().toLocaleDateString('pt-BR');
        const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        return `
        <div class="vc-header">
            <div>
                <h3 class="vc-title">
                    <span class="vc-title-icon"><i class="fas fa-gas-pump"></i></span>
                    Consumo & Performance — Colhedoras Próprias
                </h3>
                <p class="vc-subtitle">
                    Atualizado em ${dt} às ${ts} &nbsp;·&nbsp; ${n} colhedora${n !== 1 ? 's' : ''} ativas (prefixo 80)
                </p>
            </div>
            <div class="vc-legenda">
                <span class="vc-leg"><span class="vc-leg-dot" style="background:#10b981;"></span> Acima / Na Meta</span>
                <span class="vc-leg"><span class="vc-leg-dot" style="background:#3b82f6;"></span> Próximo</span>
                <span class="vc-leg"><span class="vc-leg-dot" style="background:#ef4444;"></span> Abaixo / Crítico</span>
            </div>
        </div>`;
    }

    _buildCard(cfg) {
        const { titulo, sub, ico, meta, dV, dC, aV, aC, accent, notice } = cfg;
        const colorAccent = accent || '#38bdf8';
        return `
        <div class="vc-kpi" style="--vc-accent: ${colorAccent};">
            <div class="vc-kpi-head">
                <div>
                    <h4 class="vc-kpi-title">${titulo}</h4>
                    <span class="vc-sub-label">${sub}</span>
                </div>
                <div class="vc-kpi-icon"><i class="${ico}"></i></div>
            </div>
            
            ${meta !== '—' ? `<div class="vc-kpi-meta"><i class="fas fa-bullseye" style="margin-right:4px;"></i> Meta: ${meta}</div>` : ''}
            ${notice ? `<div class="vc-kpi-notice"><i class="fas fa-info-circle" style="margin-right:3px;opacity:0.7;"></i>${notice}</div>` : ''}
            <div class="vc-kpi-row" style="margin-top:auto;">
                <span class="vc-kpi-label"><i class="fas fa-calendar-day" style="opacity:0.6;"></i> Hoje</span>
                <span class="vc-b-${dC}">${dV}</span>
            </div>
            <div class="vc-kpi-row" style="border-top:none; margin-top:0; padding-top:8px;">
                <span class="vc-kpi-label"><i class="fas fa-layer-group" style="opacity:0.6;"></i> Acumulado</span>
                <span class="vc-b-${aC}">${aV}</span>
            </div>
        </div>`;
    }

    _buildCards(d1, acm, dispDia, dispAcm) {
        const M = this.METAS;
        return `
        <div class="vc-hero">
            ${this._buildCard({ titulo:'TMD', sub:'Ton. Máquina Dia', ico:'fas fa-weight-hanging', meta:`${M.TMD} t/máq`,
                notice:'Baseado em Ton. / Dias Trabalhados. Não calculado via OEE.',
                dV:this._f(d1.TMD,0), dC:this._clsMaior(d1.TMD, M.TMD), aV:this._f(acm.TMD,0), aC:this._clsMaior(acm.TMD, M.TMD), accent:'#6366f1', topKey:'tmd' })}
            ${this._buildCard({ titulo:'Litros / Hr', sub:'Consumo Horário', ico:'fas fa-tachometer-alt', meta:`${M.LITROS_HR} L/h`,
                dV:this._f(d1.LITROS_HR,1), dC:this._clsMenor(d1.LITROS_HR, M.LITROS_HR), aV:this._f(acm.LITROS_HR,1), aC:this._clsMenor(acm.LITROS_HR, M.LITROS_HR), accent:'#0ea5e9', topKey:'lhr' })}
            ${this._buildCard({ titulo:'Litros / Ton', sub:'Eficiência Consumo', ico:'fas fa-tint', meta:`${M.LITROS_TON} L/t`,
                dV:this._f(d1.LITROS_TON,2), dC:this._clsMenor(d1.LITROS_TON, M.LITROS_TON), aV:this._f(acm.LITROS_TON,2), aC:this._clsMenor(acm.LITROS_TON, M.LITROS_TON), accent:'#06b6d4', topKey:'lton' })}
            ${this._buildCard({ titulo:'R. Energético', sub:'Índice Rendimento', ico:'fas fa-bolt', meta:`${M.RENG}`,
                dV:this._f(d1.RENG,2), dC:this._clsMaior(d1.RENG, M.RENG), aV:this._f(acm.RENG,2), aC:this._clsMaior(acm.RENG, M.RENG), accent:'#f59e0b', topKey:'re' })}
            ${this._buildCard({ titulo:'Disponibilidade', sub:'Frotas Próprias (%)', ico:'fas fa-check-circle', meta:`${M.DISP}%`,
                dV:dispDia !== null ? this._fp(dispDia) : '—', dC:this._clsDisp(dispDia), aV:dispAcm !== null ? this._fp(dispAcm) : '—', aC:this._clsDisp(dispAcm), accent:'#10b981', topKey:'disp' })}
        </div>`;
    }

    _buildFrentesTable(d1Prop, acmProp, producaoData, dispD1Data, dispAcmData) {
        const frenteMap  = this._buildEquipFrenteMap(producaoData);
        const dispD1Map  = this._buildDispMap(dispD1Data);
        const dispAcmMap = this._buildDispMap(dispAcmData);
        const M = this.METAS;

        const allEq = [...new Set([...d1Prop.map(r=>String(r['Equip']||'').trim()), ...acmProp.map(r=>String(r['Equip']||'').trim())])].filter(Boolean);
        const frentesMap = new Map();
        const semFrente  = [];
        
        allEq.forEach(eq => {
            const fr = frenteMap.get(eq);
            if (!fr) { semFrente.push(eq); return; }
            if (!frentesMap.has(fr)) frentesMap.set(fr, []);
            frentesMap.get(fr).push(eq);
        });

        const sorted = Array.from(frentesMap.keys()).sort((a,b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        if (semFrente.length) sorted.push('__sf__');

        const badge = (val, cls) => `<span class="vc-b-${cls}">${val}</span>`;
        const naStr = '<span style="color:var(--vc-text-sec);opacity:0.5;">—</span>';

        let rowCounter = 0;
        const machineRows = (eq) => {
            const dm = this._rowMetrics(d1Prop.find(r => String(r['Equip']||'').trim() === eq), dispD1Map);
            const am = this._rowMetrics(acmProp.find(r => String(r['Equip']||'').trim() === eq), dispAcmMap);
            const rowClass = rowCounter++ % 2 === 0 ? '' : 'vc-row-alt';

            return `
            <tr class="vc-row-dia ${rowClass}">
                <td rowspan="2" class="left" style="color:var(--primary, #38bdf8); font-size:1.05rem; font-weight:800; border-right:1px solid var(--vc-bd-card); padding-left:20px; width:140px;">
                    <i class="fas fa-tractor" style="opacity:0.5; font-size:0.8rem; margin-right:8px;"></i>${eq}
                 </td>
                <td class="left" style="color:var(--vc-text-sec); font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Dia</td>
                <td>${dm ? badge(this._f(dm.tmd,1), this._clsMaior(dm.tmd, M.TMD)) : naStr}</td>
                <td>${dm ? badge(this._fp(dm.disp), this._clsDisp(dm.disp)) : naStr}</td>
                <td>${dm ? badge(this._f(dm.lton,2), this._clsMenor(dm.lton, M.LITROS_TON)) : naStr}</td>
                <td>${dm ? badge(this._f(dm.lhr,1), this._clsMenor(dm.lhr, M.LITROS_HR)) : naStr}</td>
                <td>${dm && dm.re ? `<span style="color:var(--vc-text-sec); font-weight:600;">${this._f(dm.re,2)}</span>` : naStr}</td>
             </tr>
            <tr class="vc-row-acm ${rowClass}" style="border-bottom:1px solid var(--vc-bd-card);">
                <td class="left" style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Acm</td>
                <td>${am ? badge(this._f(am.tmd,1), this._clsMaior(am.tmd, M.TMD)) : naStr}</td>
                <td>${am ? badge(this._fp(am.disp), this._clsDisp(am.disp)) : naStr}</td>
                <td>${am ? badge(this._f(am.lton,2), this._clsMenor(am.lton, M.LITROS_TON)) : naStr}</td>
                <td>${am ? badge(this._f(am.lhr,1), this._clsMenor(am.lhr, M.LITROS_HR)) : naStr}</td>
                <td>${am && am.re ? `<span style="color:var(--vc-text-sec); font-weight:600;">${this._f(am.re,2)}</span>` : naStr}</td>
             </tr>`;
        };

        const tbody = sorted.map(fr => {
            const eqs = (fr === '__sf__' ? semFrente : frentesMap.get(fr)).sort((a,b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
            const label = fr === '__sf__' ? 'Sem Frente Definida' : `Frente Operacional ${fr}`;
            return `
            <tr class="vc-group-header">
                <td colspan="7">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span><i class="fas fa-map-marker-alt" style="margin-right:6px; opacity:0.7;"></i> ${label}</span>
                        <span style="color:var(--vc-text-sec); font-weight:600; font-size:0.75rem; text-transform:none;">(${eqs.length} equipamentos)</span>
                    </div>
                 </td>
             </tr>
            <tr class="vc-meta-row">
                <td colspan="2" class="left" style="padding-left:20px; font-weight:800; letter-spacing:0.5px;"><i class="fas fa-bullseye" style="margin-right:6px;"></i> Referência (Meta)</td>
                <td style="font-size:0.8rem;">${M.TMD}</td>
                <td style="font-size:0.8rem;">${M.DISP}%</td>
                <td style="font-size:0.8rem;">${this._f(M.LITROS_TON,2)}</td>
                <td style="font-size:0.8rem;">${M.LITROS_HR}</td>
                <td style="font-size:0.8rem;">${M.RENG}</td>
             </tr>
            ${eqs.map(eq => machineRows(eq)).join('')}`;
        }).join('');

        return `
        <div>
            <div class="vc-section-title" style="margin-top:10px;">
                <i class="fas fa-layer-group"></i>
                Detalhamento Operacional por Equipamento
            </div>
            <div class="vc-landscape-hint">
                <i class="fas fa-mobile-alt" style="transform:rotate(90deg)"></i>
                Vire o celular para melhor visualização
            </div>
            <div class="vc-table-wrap">
                <table class="vc-table">
                    <thead>
                        <tr>
                            <th class="left" style="width:140px; padding-left:20px;">Equipamento</th>
                            <th class="left" style="width:60px;">Período</th>
                            <th>TMD <span class="vc-sub-label">Ton/Máq</span></th>
                            <th>DISP <span class="vc-sub-label">% Mecânica</span></th>
                            <th>L / t <span class="vc-sub-label">Eficiência</span></th>
                            <th>L / h <span class="vc-sub-label">Consumo Hr</span></th>
                            <th>R. Energ. <span class="vc-sub-label">Índice</span></th>
                        </tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                 </table>
            </div>
        </div>`;
    }

    _buildEquipFrenteMap(producaoData) {
        const map = new Map();
        if (!Array.isArray(producaoData)) return map;
        producaoData.forEach(row => {
            if (!row) return;
            const fr = String(row.frente || row.Frente || '').trim();
            if (!fr) return;
            const eqs = [];
            if (row.equipamento) eqs.push(String(row.equipamento).trim());
            if (Array.isArray(row.equipamentos)) row.equipamentos.forEach(e => e && eqs.push(String(e).trim()));
            eqs.forEach(eq => { if (eq && !map.has(eq)) map.set(eq, fr); });
        });
        return map;
    }

    _buildDispMap(dispData) {
        const map = new Map();
        if (!Array.isArray(dispData)) return map;
        dispData.forEach(r => {
            const eq = String(r['Equipamento'] || r['equipamento'] || '').trim();
            if (!eq) return;
            let v = this._p(r['Disp'] || r['disp'] || r['DISP'] || r['Disp %'] || 0);
            if (v > 1) v = v / 100;
            if (v > 0) map.set(eq, v * 100);
        });
        return map;
    }
}

if (typeof window !== 'undefined') window.VisualizerConsumo = VisualizerConsumo;
console.log('[Consumo] v10.2 (TMD Acumulado Correto) registrado.');
}