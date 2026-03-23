// ============================================================
// visualizer-visaoglobal.js  –  AgroAnalytics  v2.5
// Aba Visão Global — Painel Executivo de Colheita
// ============================================================

if (typeof VisualizerVisaoGlobal === 'undefined') {
class VisualizerVisaoGlobal {
    constructor() {
        console.log('📊 VisualizerVisaoGlobal v2.5 iniciado');
        this.METAS = { TMD: 633, LITROS_HR: 36, LITROS_TON: 1.02, DISP: 85 };
    }

    _p(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        let s = String(val).trim();
        if (s.includes(',')) {
            s = s.replace(/\./g, '');
            s = s.replace(',', '.');
        } else if ((s.match(/\./g) || []).length > 1) {
            s = s.replace(/\./g, '');
        }
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    _getTonCana(row) {
        if (!row) return 0;
        const directKeys = ['Ton. Cana','Ton.Cana','TonCana','TON. CANA','TON.CANA','ton_cana','Toneladas','Ton Cana'];
        for (const k of directKeys) {
            if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
                const n = this._p(row[k]);
                if (n > 0) return n;
            }
        }
        const tonHr = this._p(row['TON/Hr'] || row['Ton/Hr'] || 0);
        const horas = this._p(row['Horas']  || row['horas']  || 0);
        if (tonHr > 0 && horas > 0) return tonHr * horas;
        return 0;
    }

    _avgTMD(rows, diasPeriodo) {
        if (!rows || rows.length === 0) return null;
        const dias = Math.max(1, diasPeriodo || 1);
        let sum = 0, n = 0;
        rows.forEach(r => {
            let t = this._getTonCana(r);
            // ⚠️ BUGFIX: Se a linha já tem campo TMD/TMD_Dia use-o diretamente
            const tmdDirectKeys = ['TMD','Tmd','tmd','TMD_DIA','tmd_dia','TonMaqDia'];
            for (const k of tmdDirectKeys) {
                if (r[k] !== undefined && r[k] !== '' && r[k] !== null) {
                    const v = this._p(r[k]);
                    if (v > 0 && v < 5000) { t = v * dias; break; }
                }
            }
            if (t > 0) { sum += t; n++; }
        });
        if (n === 0) return null;
        const avgPerMaq = (sum / n) / dias;
        // ⚠️ BUGFIX TMD 60.036: PT-BR parser may misread "600,36" as 60036
        // Physical sanity: TMD for sugarcane never exceeds 3000 t/maq/day
        // If result > 3000, likely scale error (×100) — divide by 100
        return avgPerMaq > 3000 ? avgPerMaq / 100 : avgPerMaq;
    }

    // FIX #3/#4: média simples de TODOS os valores "Disp %" — sem filtro de prefixo
    _avgDispSimple(data) {
        if (!Array.isArray(data) || data.length === 0) return null;
        const vals = data.map(r => {
            const raw = r['Disp %'] ?? r['Disp'] ?? r['disp'] ?? r['DISP'] ?? r['disp_pct'] ?? null;
            if (raw === null || raw === undefined || raw === '') return NaN;
            let v = parseFloat(String(raw).replace(',', '.'));
            if (isNaN(v)) return NaN;
            if (v > 100)           v = v / 100;
            else if (v > 0 && v < 1) v = v * 100;
            return v;
        }).filter(v => !isNaN(v) && v > 0 && v <= 100);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }

    _avgDisp(dispData, prefix) {
        if (!Array.isArray(dispData) || dispData.length === 0) return null;
        const pfx = prefix || '80';
        // colConD1/colConAcm têm campo 'Equip' (não 'Equipamento')
        const rows = dispData.filter(r => {
            const eq = String(r['Equip'] || r['Equipamento'] || r['equipamento'] || r['EQUIPAMENTO'] || '').trim();
            return eq.startsWith(pfx);
        });
        if (!rows.length) return null;
        let sum = 0, n = 0;
        rows.forEach(r => {
            // colConD1/colConAcm usam campo 'Disp %'
            let raw = r['Disp %'] ?? r['Disp'] ?? r['disp'] ?? r['DISP'] ?? r['disp_pct'] ?? 0;
            let v = this._p(raw);
            // ⚠️ BUGFIX DISP%: nunca multiplicar se já está em escala 0-100
            // Ex de bug anterior: 85.63 → * 100 → 8563%
            if (v > 100)           v = v / 100;    // 8563 → 85.63
            else if (v > 0 && v < 1) v = v * 100;  // 0.85 → 85
            // v entre 1 e 100 = já está correto, não mexer
            if (v > 0 && v <= 100) { sum += v; n++; }
        });
        return n > 0 ? sum / n : null;
    }

    // ── Prefixos de frota (fonte de verdade única) ───────────────────────
    _isPropria(codEquip) {
        const c = String(codEquip || '').trim();
        return /^(80|81|82|83|84|85)\d/.test(c);
    }
    _isTerceira(codEquip) {
        const c = String(codEquip || '').trim();
        return /^(91|92|93|94|95)\d/.test(c);
    }
    // Extrai equipamentos de uma linha de producao
    _eqs(row) {
        const eqs = [];
        if (row.equipamento) eqs.push(String(row.equipamento).trim());
        if (Array.isArray(row.equipamentos)) row.equipamentos.forEach(e => e && eqs.push(String(e).trim()));
        return [...new Set(eqs.filter(Boolean))];
    }

    _buildFrenteStats(producao, acmProp, dispAcmData, diasPeriodo, tipoFrota) {
        // tipoFrota: 'proprio' | 'fretista' | undefined (all)
        // USA PREFIXO como fonte de verdade — não campo de texto
        const _isTipo = (r) => {
            if (!tipoFrota) return true;
            const eqs = this._eqs(r);
            if (eqs.length > 0) {
                if (tipoFrota === 'proprio')  return eqs.some(e => this._isPropria(e));
                if (tipoFrota === 'fretista') return eqs.some(e => this._isTerceira(e));
            }
            // Fallback: campo de texto
            const t = String(r['Dsc. Tipo Prop. Frota'] || r.dscTipoPropFrota || '').toLowerCase();
            if (tipoFrota === 'proprio')  return t.includes('proprio') || t.includes('própri');
            if (tipoFrota === 'fretista') return t.includes('fretista') || t.includes('terceiro');
            return true;
        };

        const stats = {};
        const eqFrMap = new Map();

        // Constrói eq→frente usando prefixo como filtro
        producao.forEach(r => {
            if (!r || !_isTipo(r)) return;
            const fr = String(r.frente || r.Frente || '').trim();
            if (!fr) return;
            this._eqs(r).forEach(eq => { if (eq && !eqFrMap.has(eq)) eqFrMap.set(eq, fr); });
        });

        // Acumula tonelagem por frente
        producao.forEach(r => {
            if (!r || r.isAggregation || !_isTipo(r)) return;
            const fr = String(r.frente || r.Frente || '').trim();
            if (!fr) return;
            if (!stats[fr]) stats[fr] = { ton: 0, colhedoras: new Set(), tmdSum: 0, tmdN: 0, dispSum: 0, dispN: 0, ltonSum: 0, ltonN: 0 };
            stats[fr].ton += parseFloat(r.peso) || 0;
        });

        const dispMap = new Map();
        if (Array.isArray(dispAcmData)) {
            dispAcmData.forEach(r => {
                // colConD1/colConAcm uses 'Equip' field
                const eq = String(r['Equip'] || r['Equipamento'] || r['equipamento'] || '').trim();
                if (!eq) return;
                let v = this._p(r['Disp %'] ?? r['Disp'] ?? r['disp'] ?? r['DISP'] ?? 0);
                if (v > 100) v = v / 100;
                else if (v > 0 && v < 1) v = v * 100;
                if (v > 0 && v <= 100) dispMap.set(eq, v);
            });
        }

        acmProp.forEach(r => {
            if (!r) return;
            const eq = String(r['Equip'] || '').trim();
            // Try to get frente from eqFrMap (producao mapping) first
            // then from acmProp row directly (Frente or Cod.Frente fields)
            const fr = eqFrMap.get(eq)
                || String(r['Frente'] || r['frente'] || r['COD FRENTE'] || r['Cod.Frente'] || r['COD_FRENTE'] || '').trim();
            if (!fr || !eq) return;
            if (!stats[fr]) stats[fr] = { ton: 0, colhedoras: new Set(), tmdSum: 0, tmdN: 0, dispSum: 0, dispN: 0, ltonSum: 0, ltonN: 0 };
            
            const t = this._getTonCana(r);
            if (t > 0) { stats[fr].tmdSum += t; stats[fr].tmdN++; }
            stats[fr].colhedoras.add(eq);
            // Collect Litros/Ton from colConD1
            const ltonRaw = this._p(r['Litros / Ton'] ?? r['Litros/Ton'] ?? r['L/t'] ?? r['lton'] ?? 0);
            if (ltonRaw > 0) { 
                const lton = ltonRaw > 10 ? ltonRaw / 100 : ltonRaw; // sanity: L/t never > 10
                stats[fr].ltonSum += lton; stats[fr].ltonN++; 
            }
            
            let disp = dispMap.get(eq);
            if (disp === undefined) {
                disp = this._p(r['Disp %'] || r['DISP'] || r['Disp']);
                if (disp > 100) disp = disp / 100;
                else if (disp > 0 && disp < 1) disp = disp * 100;
            }
            if (disp > 0 && disp <= 100) { stats[fr].dispSum += disp; stats[fr].dispN++; }
        });

        Object.keys(stats).forEach(fr => {
            const s = stats[fr];
            s.avgTMD  = s.tmdN  > 0 ? (s.tmdSum / s.tmdN) / diasPeriodo : null;
            s.avgDisp = s.dispN > 0 ? s.dispSum / s.dispN : null;
            s.avgLton = s.ltonN > 0 ? s.ltonSum / s.ltonN : null;
            s.nColhed = s.colhedoras.size;
        });
        return stats;
    }

    _clsTMD(v) {
        if (v === null || v === undefined || v === 0) return 'neutral';
        return v >= this.METAS.TMD ? 'green' : 'red';
    }
    _clsDisp(v) {
        if (v === null || v === undefined || v === 0) return 'neutral';
        if (v < 85)  return 'red';
        if (v < 95)  return 'blue';
        return 'green';
    }

    _f(n, d=1)  {
        if (n === null || n === undefined || isNaN(n) || n === 0) return '—';
        return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    _fp(n) {
        if (n === null || n === undefined || isNaN(n) || n === 0) return '—';
        return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }
    _fK(n) {
        if (!n || isNaN(n) || n === 0) return '0';
        if (n >= 1000000) return this._f(n / 1000000, 2) + ' M t';
        // Exibe número completo formatado (ex: 14.000 t) — nunca abreviado em k
        return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    }

    _styles() {
        return `<style id="vg-styles">
        .vg-root { 
            --vg-text: #ffffff; 
            --vg-text-sec: var(--text, #F0F0F0); /* NO GRAY RULE */
            --vg-bg-card: rgba(15, 23, 42, 0.6);
            --vg-bd-card: rgba(255, 255, 255, 0.08);
            --vg-bg-card-hover: rgba(15, 23, 42, 0.8);
            display:flex; flex-direction:column; gap:22px; 
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: var(--vg-text);
        }
        
        [data-theme="light"] .vg-root {
            --vg-text: #111827; 
            --vg-text-sec: #111827; /* light mode: near black */
            --vg-bg-card: #ffffff;
            --vg-bd-card: #e5e7eb;
            --vg-bg-card-hover: #f9fafb;
        }

        .vg-hero { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:15px; }
        .vg-kpi  {
            background: var(--vg-bg-card); backdrop-filter:blur(12px);
            border: 1px solid var(--vg-bd-card);
            border-radius:12px; padding:20px;
            display:flex; flex-direction:column; gap:5px;
            border-left: 4px solid var(--vg-accent,#6366f1);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .vg-kpi-val   { font-size:1.6rem; font-weight:900; line-height:1.1; color:var(--vg-accent,#6366f1); font-variant-numeric:tabular-nums; }
        .vg-kpi-label { font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--vg-text); }
        .vg-kpi-sub   { font-size:0.7rem; color:var(--text, #F0F0F0); opacity:0.75; }
        
        .vg-section-title { font-size:0.85rem; font-weight:800; text-transform:uppercase; letter-spacing:.8px; color:var(--vg-text-sec); margin-bottom:12px; display:flex; align-items:center; gap:8px; border-bottom: 1px solid var(--vg-bd-card); padding-bottom: 8px;}
        
        .vg-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:15px; }
        .vg-card  { background:var(--vg-bg-card); border:1px solid var(--vg-bd-card); border-radius:12px; overflow:hidden; transition:transform .18s,box-shadow .18s; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .vg-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.15); }
        
        .vg-card-head  { display:flex; align-items:center; gap:12px; padding:15px 18px 10px; border-bottom: 1px solid var(--vg-bd-card); }
        .vg-card-icon  { width:38px; height:38px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
        .vg-card-name  { font-size:1.05rem; font-weight:800; flex:1; color:var(--vg-text); }
        .vg-card-badge { font-size:0.75rem; font-weight:700; padding:3px 10px; border-radius:20px; }
        
        .vg-card-metrics { display:grid; grid-template-columns:1fr 1fr; gap:12px 15px; padding:12px 18px 18px; }
        .vg-metric       { display:flex; flex-direction:column; gap:4px; }
        .vg-metric-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:.4px; color:var(--text, #F0F0F0); font-weight:700;}
        .vg-metric-val   { font-size:0.95rem; font-weight:800; color:var(--vg-text); font-variant-numeric:tabular-nums; }
        
        .vg-disp-bar { height:5px; width:100%; display:flex; }
        
        .vg-insights { display:flex; flex-direction:column; gap:12px; }
        .vg-insight  { display:flex; gap:15px; padding:16px; border-radius:10px; align-items:flex-start; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .vg-insight-ico   { font-size:22px; flex-shrink:0; margin-top:2px; }
        .vg-insight-title { font-size:0.95rem; font-weight:800; margin-bottom:4px; }
        .vg-insight-txt   { font-size:0.85rem; line-height:1.6; color:var(--vg-text-sec); }
        
        .vg-legenda { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:5px; }
        .vg-leg     { display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--vg-text-sec); }
        .vg-leg-dot { width:10px; height:10px; border-radius:3px; flex-shrink:0; }

        .vg-b-red { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
        .vg-b-green { background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.3); }
        .vg-b-blue { background: rgba(96,165,250,0.15); color: #93c5fd; border: 1px solid rgba(96,165,250,0.3); }
        .vg-b-neu { background: rgba(255,255,255,0.07); color: #d1d5db; border: 1px solid rgba(255,255,255,0.15); }

        [data-theme="light"] .vg-b-red { background: rgba(239,68,68,0.15); color: #b91c1c; border-color: rgba(239,68,68,0.3); }
        [data-theme="light"] .vg-b-green { background: rgba(34,197,94,0.15); color: #15803d; border-color: rgba(34,197,94,0.3); }
        [data-theme="light"] .vg-b-blue { background: rgba(59,130,246,0.15); color: #1d4ed8; border-color: rgba(59,130,246,0.3); }
        [data-theme="light"] .vg-b-neu { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
        </style>`;
    }

    _badgeSpan(valor, cls) {
        const c = cls === 'red' ? 'vg-b-red' : cls === 'green' ? 'vg-b-green' : cls === 'blue' ? 'vg-b-blue' : 'vg-b-neu';
        return `<span class="${c}" style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:0.85rem;font-weight:800;font-variant-numeric:tabular-nums;">${valor}</span>`;
    }

    _header(totalTon, nD1Prop, nD1Terc, nAcm, nFrentes, tmdDia, dispDia, dispAcm, dataReal) {
        // ⚠️ TMD Acm removido (desnecessário) — mostra só TMD Dia
        // ⚠️ DISP: mostra dia E acumulado, colorido por meta
        const accentTMD  = tmdDia  !== null ? (tmdDia  >= this.METAS.TMD  ? '#10b981' : '#ef4444') : '#6366f1';
        const accentDispDia = dispDia  !== null ? (dispDia  >= this.METAS.DISP ? '#10b981' : '#ef4444') : '#6366f1';
        const accentDispAcm = dispAcm  !== null ? (dispAcm  >= this.METAS.DISP ? '#10b981' : '#ef4444') : '#6366f1';

        const kpis = [
            { label: 'Toneladas (safra)', val: this._fK(totalTon) + ' t',
              sub: 'Total acumulado', accent: '#6366f1' },
            { label: 'Colhedoras Dia — Próprias', val: nD1Prop.toString(),
              sub: 'Com dados de D1', accent: '#0ea5e9' },
            { label: 'Colhedoras Dia — Terceiras', val: nD1Terc.toString(),
              sub: 'Com dados de D1', accent: '#f59e0b' },
            { label: 'Colhedoras (Acm)', val: nAcm.toString(),
              sub: 'Próprias + terceiras', accent: '#0ea5e9' },
            { label: 'Frentes ativas', val: nFrentes.toString(),
              sub: 'Com produção no dia', accent: '#f59e0b' },
            { label: 'TMD médio — Dia',
              val: tmdDia !== null ? this._f(tmdDia, 0) + ' t' : '—',
              sub: `Meta: ${this.METAS.TMD} t/máq.`, accent: accentTMD },
            { label: 'DISP médio — Dia',
              val: this._fp(dispDia),
              sub: `Meta: ${this.METAS.DISP}%`, accent: accentDispDia },
            { label: 'DISP médio — Acm',
              val: this._fp(dispAcm),
              sub: `Meta: ${this.METAS.DISP}%`, accent: accentDispAcm },
        ];

        const now = new Date();
        const ts  = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        return `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:15px;margin-bottom:5px;">
            <div>
                <h3 style="margin:0 0 5px;font-size:1.2rem;font-weight:800;display:flex;align-items:center;gap:10px;">
                    <span style="width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(99,102,241,0.15);color:#6366f1;font-size:1rem;">
                        <i class="fas fa-chart-pie"></i>
                    </span>
                    Visão Global — Análise Executiva de Colheita
                </h3>
                <p style="margin:0;font-size:0.85rem;color:var(--vg-text-sec);">
                    Atualizado em ${dataReal} às ${ts}
                    &nbsp;·&nbsp; Colhedoras próprias e terceiras
                </p>
            </div>
            <div class="vg-legenda">
                <span class="vg-leg"><span class="vg-leg-dot" style="background:#10b981;"></span> Acima da meta</span>
                <span class="vg-leg"><span class="vg-leg-dot" style="background:#3b82f6;"></span> Próximo</span>
                <span class="vg-leg"><span class="vg-leg-dot" style="background:#ef4444;"></span> Abaixo da meta</span>
            </div>
        </div>
        <div class="vg-hero">
            ${kpis.map(k => `
            <div class="vg-kpi" style="--vg-accent:${k.accent};">
                <div class="vg-kpi-val" style="color:${k.accent}">${k.val}</div>
                <div class="vg-kpi-label">${k.label}</div>
                <div class="vg-kpi-sub">${k.sub}</div>
            </div>`).join('')}
        </div>`;
    }

    _cards(frentesKeys, frenteStats, tipo) {
        const isProp = tipo === 'prop';
        const isTerc = tipo === 'terc';

        // FIX #2: mostra somente frentes com pelo menos 1 colhedora deste tipo
        const activeFrentes = frentesKeys.filter(fr => frenteStats[fr] && frenteStats[fr].nColhed > 0);
        if (activeFrentes.length === 0) return '';

        const accentColors = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#ec4899','#8b5cf6','#06b6d4','#84cc16'];
        const iconMap = ['fa-wheat-awn','fa-leaf','fa-seedling','fa-tractor','fa-mountain','fa-flag'];

        const cardBgStyle = isProp
            ? 'background:rgba(16,185,129,0.04);border-color:rgba(16,185,129,0.15);'
            : isTerc
                ? 'background:rgba(245,158,11,0.05);border-color:rgba(245,158,11,0.18);'
                : '';

        const html = activeFrentes.map((fr, i) => {
            const s    = frenteStats[fr];
            const cor  = accentColors[i % accentColors.length];
            const ico  = iconMap[i % iconMap.length];
            let disp = s.avgDisp;
            if (disp !== null && disp > 100) disp = disp / 100;

            const clsDisp = this._clsDisp(disp);
            const dispPct = disp !== null ? Math.min(Math.max(disp, 0), 100) : 0;

            const perfOK    = disp !== null ? disp >= this.METAS.DISP : null;
            const perfLabel = perfOK === null ? '—' : (perfOK ? '✓ OK' : '⚠ Atenção');
            const perfCls   = perfOK === null ? 'neu' : (perfOK ? 'green' : 'red');

            const barCols = { green:'#10b981', blue:'#3b82f6', red:'#ef4444', neutral:'var(--text-secondary, #D8D8D8)' };
            const barColor = barCols[clsDisp] || barCols.neutral;

            const nMaq    = s.nColhed || 1;
            const mediaMaq = s.ton > 0 && nMaq > 0 ? s.ton / nMaq : null;
            const ltonRaw  = s.avgLton || null;
            const ltonStr  = ltonRaw !== null && ltonRaw > 0
                ? this._f(ltonRaw > 10 ? ltonRaw / 100 : ltonRaw, 2) + ' L/t'
                : '—';

            return `
            <div class="vg-card" style="${cardBgStyle}">
                <div class="vg-card-head">
                    <div class="vg-card-icon" style="background:${cor}22;border:1px solid ${cor}44;color:${cor};">
                        <i class="fas ${ico}"></i>
                    </div>
                    <div class="vg-card-name">Frente ${fr}</div>
                    <span class="vg-b-${perfCls} vg-card-badge">${perfLabel}</span>
                </div>
                <div class="vg-disp-bar">
                    <div style="width:${dispPct}%;background:${barColor};height:100%;transition:width .5s;"></div>
                    <div style="flex:1;background:rgba(128,128,128,0.2);height:100%;"></div>
                </div>
                <div class="vg-card-metrics">
                    <div class="vg-metric">
                        <div class="vg-metric-label">Colhedoras</div>
                        <div class="vg-metric-val" style="color:${cor};">${s.nColhed}</div>
                    </div>
                    <div class="vg-metric">
                        <div class="vg-metric-label">Toneladas</div>
                        <div class="vg-metric-val">${Number(s.ton).toLocaleString('pt-BR',{maximumFractionDigits:0})} t</div>
                    </div>
                    <div class="vg-metric">
                        <div class="vg-metric-label">Litros / Ton</div>
                        <div class="vg-metric-val" style="font-size:0.82rem;">${ltonStr}</div>
                    </div>
                    <div class="vg-metric">
                        <div class="vg-metric-label">DISP médio — Dia</div>
                        <div>${this._badgeSpan(disp !== null ? this._fp(disp) : '—', clsDisp)}</div>
                    </div>
                    <div class="vg-metric" style="grid-column:span 2;">
                        <div class="vg-metric-label">Média / Máquina</div>
                        <div class="vg-metric-val" style="font-size:0.82rem;">
                            ${mediaMaq !== null ? Number(mediaMaq).toLocaleString('pt-BR',{maximumFractionDigits:0}) + ' t/máq' : '—'}
                        </div>
                    </div>
                </div>
            </div>`;
        });

        const titulo = isProp ? 'Desempenho por Frente — Colhedoras Próprias'
                     : isTerc ? 'Desempenho por Frente — Colhedoras Terceiras'
                     : 'Desempenho por Frente';
        const icone  = isProp ? 'fa-tractor' : isTerc ? 'fa-handshake' : 'fa-layer-group';

        return `
        <div style="margin-top:14px;">
            <div class="vg-section-title">
                <i class="fas ${icone}"></i> ${titulo}
            </div>
            <div class="vg-cards">${html.join('')}</div>
        </div>`;
    }

    _insights(frentesKeys, frenteStats, globalTMD, globalDisp) {
        if (frentesKeys.length === 0) return '';

        const M = this.METAS;
        const insights = [];

        const comTMD = frentesKeys.filter(f => frenteStats[f] && frenteStats[f].avgTMD !== null);
        if (comTMD.length >= 2) {
            const sorted = [...comTMD].sort((a, b) => (frenteStats[b]?.avgTMD || 0) - (frenteStats[a]?.avgTMD || 0));
            const best = sorted[0], worst = sorted[sorted.length - 1];
            const bTMD = frenteStats[best]?.avgTMD;
            const wTMD = frenteStats[worst]?.avgTMD;
            insights.push({
                ico: '🏆', cls: 'green', title: `Destaque em TMD: ${best}`,
                txt: `${best} lidera com TMD médio de <b>${this._f(bTMD, 0)} t/máq.</b> `
                   + (wTMD < M.TMD * 0.9
                        ? `${worst} precisa de atenção com ${this._f(wTMD, 0)} t/máq. (meta: ${M.TMD} t).`
                        : `${worst} também está próxima à meta com ${this._f(wTMD, 0)} t/máq.`)
            });
        }

        if (globalDisp !== null) {
            const ok = globalDisp >= M.DISP;
            insights.push({
                ico: ok ? '✅' : '🚨', cls: ok ? 'green' : 'red',
                title: ok ? 'Disponibilidade Global Satisfatória' : 'Alerta: Disponibilidade Abaixo da Meta',
                txt: `DISP médio acumulado das colhedoras próprias: <b>${this._fp(globalDisp)}</b> `
                   + `(meta: ${M.DISP}%). `
                   + (ok ? 'Frota operando dentro dos parâmetros.' : 'Revisar plano de manutenção preventiva.')
            });
        }

        const abaixo = frentesKeys.filter(f => frenteStats[f] && frenteStats[f].avgTMD !== null && frenteStats[f].avgTMD < M.TMD);
        if (abaixo.length > 0) {
            insights.push({
                ico: '🔻', cls: 'red', title: `${abaixo.length} Frente${abaixo.length > 1 ? 's' : ''} Abaixo do TMD Meta`,
                txt: `<b>${abaixo.join(', ')}</b> com TMD médio abaixo de ${M.TMD} t/máq. Verificar condições de campo, operadores e manutenção.`
            });
        }

        if (globalTMD !== null) {
            const gap = ((globalTMD / M.TMD) - 1) * 100;
            const nTot = frentesKeys.reduce((s, f) => s + (frenteStats[f]?.nColhed || 0), 0) || 1;
            insights.push({
                ico: '📊', cls: 'blue', title: 'Resumo de Performance Global',
                txt: `TMD médio global (acumulado): <b>${this._f(globalTMD, 0)} t/máq.</b> — `
                   + (globalTMD >= M.TMD
                        ? `<b>Meta atingida!</b> (+${this._f(gap, 1)}%)`
                        : `<b>${this._f(-gap, 1)}% abaixo da meta.</b> Ganho potencial: ${this._f((M.TMD - globalTMD) * nTot, 0)} t/dia com frota atual.`)
            });
        }

        return `
        <div style="margin-top: 10px;">
            <div class="vg-section-title">
                <i class="fas fa-brain"></i> Diagnóstico Executivo — Análise Inteligente
            </div>
            <div class="vg-insights">
                ${insights.map(ins => `
                <div class="vg-insight vg-b-${ins.cls}">
                    <span class="vg-insight-ico">${ins.ico}</span>
                    <div>
                        <div class="vg-insight-title">${ins.title}</div>
                        <div class="vg-insight-txt">${ins.txt}</div>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
    }

    render(producaoData, d1Data, acmData, dispD1Data, dispAcmData, analysisResult) {
        const container = document.getElementById('visaoglobal-content');
        if (!container) return;

        const producao = Array.isArray(producaoData) ? producaoData : [];
        const d1   = Array.isArray(d1Data)   ? d1Data   : [];
        const acm  = Array.isArray(acmData)  ? acmData  : [];

        // Colhedoras D1 por prefixo (80-85 = próprias, 93-95 = terceiras)
        const d1Prop = d1.filter(r => this._isPropria(String(r['Equip'] || '').trim()));
        const d1Terc = d1.filter(r => this._isTerceira(String(r['Equip'] || '').trim()));

        // Acm: equipamentos ÚNICOS (colConD1 tem múltiplas linhas por equipamento)
        const d1PropUnique = new Set(d1Prop.map(r => String(r['Equip'] || '').trim()).filter(Boolean));
        const d1TercUnique = new Set(d1Terc.map(r => String(r['Equip'] || '').trim()).filter(Boolean));
        const nAcmUnique = d1PropUnique.size + d1TercUnique.size;

        // FIX #3/#4: DISP = média simples de TODOS os valores de Disp%
        const globalDispD1Dia = this._avgDispSimple(d1Data);
        const globalDispAcm   = this._avgDispSimple(acmData);

        // acmProp / acmTerc por prefixo para buildFrenteStats
        const acmProp = acm.filter(r => this._isPropria(String(r['Equip'] || '').trim()));
        const acmTerc = acm.filter(r => this._isTerceira(String(r['Equip'] || '').trim()));

        let dias = 1;
        const rDias = acmProp.find(r => r['Dias_Periodo'] || r['Qtd Dias Periodo']);
        if (rDias) dias = this._p(rDias['Dias_Periodo'] || rDias['Qtd Dias Periodo']) || 207;
        else dias = 207;

        const globalTMD_D1  = this._avgTMD(d1Prop, 1);
        const globalTMD_Dia = globalTMD_D1;
        const globalTMD_Acm = this._avgTMD(acmProp, dias);

        // Data real dos dados
        let dataReal = '—';
        if (producao.length > 0) {
            const camposData = ['Data','data','DATA','Dia Balanca','DIA','dia'];
            for (const campo of camposData) {
                const val = producao[producao.length - 1]?.[campo];
                if (val && String(val).trim()) { dataReal = String(val).trim().substring(0, 10); break; }
            }
        }

        // FIX: buildFrenteStats por tipo usando prefixo
        const frenteStats    = this._buildFrenteStats(producao, acmProp, dispD1Data, dias, 'proprio');
        const frenteStatsTer = this._buildFrenteStats(producao, acmTerc, dispD1Data, dias, 'fretista');

        let frentesKeysProp = Object.keys(frenteStats).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
        let frentesKeysTerc = Object.keys(frenteStatsTer).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

        // Fallback: se ambos vazios, tenta sem filtro de tipo
        let frenteStatsAll = {};
        if (frentesKeysProp.length === 0 && frentesKeysTerc.length === 0 && producao.length > 0) {
            frenteStatsAll = this._buildFrenteStats(producao, acm, dispD1Data, dias, undefined);
            frentesKeysProp = Object.keys(frenteStatsAll).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
        }
        const frenteStatsUsed = frentesKeysProp.length > 0 && Object.keys(frenteStats).length === 0 ? frenteStatsAll : frenteStats;
        const frentesKeys = [...new Set([...frentesKeysProp, ...frentesKeysTerc])].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

        const totalTon = producao.reduce((s, r) => {
            const v = parseFloat(String(r.peso || r['Peso Líquido'] || r['peso_liquido'] || 0).replace(',', '.'));
            return s + (isNaN(v) ? 0 : v);
        }, 0);

        // Frentes ativas = com produção (própria OU terceira OU all)
        const _statsForFrentes = Object.keys(frenteStatsUsed).length > 0 ? frenteStatsUsed : frenteStatsTer;
        const nFrentesAtivas = frentesKeys.filter(fr =>
            (frenteStatsUsed[fr]?.ton || 0) + (frenteStatsTer[fr]?.ton || 0) > 0
        ).length || Object.keys(_statsForFrentes).filter(fr => (_statsForFrentes[fr]?.ton || 0) > 0).length;

        container.innerHTML =
            this._styles() +
            `<div class="vg-root">` +
            this._header(totalTon, d1PropUnique.size, d1TercUnique.size, nAcmUnique, nFrentesAtivas, globalTMD_Dia, globalDispD1Dia, globalDispAcm, dataReal) +
            this._cards(frentesKeysProp, frenteStatsUsed, frentesKeysProp.length > 0 && Object.keys(frenteStats).length === 0 ? undefined : 'prop') +
            this._cards(frentesKeysTerc, frenteStatsTer, 'terc') +
            this._insights(frentesKeys, frenteStatsUsed, globalTMD_Acm, globalDispAcm) +
            `</div>`;
    }
}

window.VisualizerVisaoGlobal = VisualizerVisaoGlobal;
}