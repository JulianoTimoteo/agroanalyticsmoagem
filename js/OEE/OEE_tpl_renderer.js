// OEE_tpl_renderer.js — v5.0 AgroAnalytics
// UI consistente com o padrão do sistema (sp-hero-section, glass-table, panel sp-panel)

(function () {
    'use strict';

    var ST = { tplData:null, analysis:null, filtroMode:'safra', inicio:null, fim:null };
    var COR = { PRODUTIVO:'#40800C', IMPRODUTIVO:'#F39C12', MANUTENCAO:'#E74C3C', CLIMATICO:'#3498DB', PREVENTIVO:'#8E44AD', INDETERMINADO:'#64748b' };
    var LBL = { PRODUTIVO:'Produtivas', IMPRODUTIVO:'Improdutivas', MANUTENCAO:'Manutenção', CLIMATICO:'Climáticas', PREVENTIVO:'Preventiva', INDETERMINADO:'Indeterminado' };
    var ORDER = ['PRODUTIVO','MANUTENCAO','PREVENTIVO','CLIMATICO','IMPRODUTIVO','INDETERMINADO'];
    var GCFG = {
        colh_propria  : { label:'Colhedoras Próprias',  color:'#40800C', icon:'fa-tractor'   },
        colh_terceira : { label:'Colhedoras Terceiras', color:'#E74C3C', icon:'fa-handshake' },
        cam_proprio   : { label:'Caminhões Próprios',   color:'#3498DB', icon:'fa-truck'     },
        cam_terceiro  : { label:'Caminhões Terceiros',  color:'#8E44AD', icon:'fa-truck'     },
        transbordo    : { label:'Transbordos',          color:'#F39C12', icon:'fa-tractor'   },
    };

    function fmtH(v) { if (!v&&v!==0) return '—'; var h=Math.floor(v),m=Math.round((v-h)*60); return h+'h'+(m>0?String(m).padStart(2,'0')+'m':''); }
    function fmtP(v,d) { if (v==null||isNaN(v)) return '—'; return (v*100).toFixed(d==null?1:d)+'%'; }
    function oeeC(v) { return v==null?'#64748b':v>=0.65?'#40800C':v>=0.45?'#F39C12':'#E74C3C'; }
    function oeeL(v) { return v==null?'—':v>=0.65?'🏆 Excelente':v>=0.45?'⚠️ Regular':'🚨 Crítico'; }
    function dispC(v) { return v==null?'#64748b':v>=0.85?'#40800C':v>=0.70?'#F39C12':'#E74C3C'; }

    function barPct(v,color,w) {
        var p=Math.min(Math.round((v||0)*100),100),bw=w||90;
        return '<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;max-width:'+bw+'px;height:6px;background:rgba(255,255,255,.1);border-radius:3px"><div style="width:'+p+'%;height:6px;background:'+color+';border-radius:3px"></div></div><span style="color:'+color+';font-weight:800;min-width:36px;text-align:right;font-size:12px">'+fmtP(v,0)+'</span></div>';
    }

    function donutSVG(tempos,sz) {
        sz=sz||80; var tot=0;
        ORDER.forEach(function(k){tot+=(tempos[k.toLowerCase()]||tempos[k]||0);});
        if (!tot) return '<div style="width:'+sz+'px;height:'+sz+'px"></div>';
        var cx=sz/2,cy=sz/2,rv=sz/2-7,stroke=10,circ=2*Math.PI*rv,offset=-circ*0.25,paths='';
        ORDER.forEach(function(k){ var v=(tempos[k.toLowerCase()]||tempos[k]||0); if(!v)return;
            var dash=(v/tot)*circ,gap=circ-dash;
            paths+='<circle cx="'+cx+'" cy="'+cy+'" r="'+rv+'" fill="none" stroke="'+COR[k]+'" stroke-width="'+stroke+'" stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" stroke-dashoffset="'+offset.toFixed(2)+'"/>';
            offset-=dash;
        });
        var pp=Math.round((tempos.produtivo||tempos.PRODUTIVO||0)/tot*100);
        return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 '+sz+' '+sz+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+rv+'" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="'+stroke+'"/>'+paths+'<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" class="donut-pct-text" font-size="'+(sz>60?13:10)+'" font-weight="800">'+pp+'%</text><text x="'+cx+'" y="'+(cy+10)+'" text-anchor="middle" class="donut-sub-text" font-size="8">prod.</text></svg>';
    }

    function _filtroBar(r) {
        var p=r.meta.periodo;
        var di=p.inicio?p.inicio.split('-').reverse().join('/'):'—';
        var df=p.fim?p.fim.split('-').reverse().join('/'):'—';
        var modos=[{id:'safra',l:'Safra Toda'},{id:'mes',l:'Este Mês'},{id:'semana',l:'Esta Semana'},{id:'dia',l:'Hoje'},{id:'custom',l:'Personalizado'}];
        var btns=modos.map(function(m){ return '<button onclick="window._oeeSetFiltro(\''+m.id+'\')" class="filter-btn'+(ST.filtroMode===m.id?' active':'')+'" style="margin-bottom:4px">'+m.l+'</button>'; }).join('');
        var custom=ST.filtroMode==='custom'?'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap"><input type="date" id="oe-di" value="'+(ST.inicio||'')+'" style="padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.2);color:inherit;font-size:12px"><span style="opacity:.5">até</span><input type="date" id="oe-df" value="'+(ST.fim||'')+'" style="padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.2);color:inherit;font-size:12px"><button onclick="window._oeeAplicarCustom()" class="filter-btn active" style="margin-bottom:0">Aplicar</button></div>':'';
        return '<div class="panel sp-panel" style="padding:14px 18px;margin-bottom:16px"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.5"><i class="fa-solid fa-calendar-days" style="margin-right:6px"></i>Filtro de Período</div><div style="font-size:12px;opacity:.7">📅 '+di+' → '+df+' &nbsp;·&nbsp; '+r.meta.nEquipamentos+' equipamentos &nbsp;·&nbsp; '+r.meta.nDias+' dia(s)</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">'+btns+'</div>'+custom+'</div>';
    }

    function _heroCelula(bcolor,icon,label,val,sub,valcolor) {
        var c=valcolor||bcolor;
        return '<div class="sp-hero-kpi" style="border-left:4px solid '+bcolor+'"><div class="sp-hero-icon" style="color:'+c+'"><i class="fa-solid '+icon+'"></i></div><div class="sp-hero-body"><div class="sp-hero-val" style="color:'+c+'">'+val+'</div><div class="sp-hero-label">'+label+'</div><div class="sp-hero-sub">'+sub+'</div></div></div>';
    }

    function _grupoCardsHTML(r,keys) {
        var cards=keys.map(function(k){
            var g=r.grupos[k],cfg=GCFG[k]; if(!g||g.nEquips===0) return '';
            var tem=g.tempos||{},tot=Object.values(tem).reduce(function(a,b){return a+b;},0)||1;
            var prod=(tem.PRODUTIVO||0),manu=(tem.MANUTENCAO||0),imp=(tem.IMPRODUTIVO||0),oc=oeeC(g.oee);
            var w=function(v){return tot>0?Math.max(0,Math.round(v/tot*1000)/10):0;};
            var barra=ORDER.map(function(ok){var v=tem[ok]||0,p=v/tot*100; return p>0?'<div style="width:'+p.toFixed(1)+'%;background:'+COR[ok]+';height:100%" title="'+LBL[ok]+': '+fmtH(v)+'"></div>':'';}).join('');
            var top5=(g.ranking||[]).slice(0,5).map(function(e,i){
                var c2=oeeC(e.oee),med=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
                return '<tr><td><span class="rank-num '+(i<3?'rank-top':'')+'" style="font-size:'+(i<3?'16px':'12px')+'">'+(med||i+1)+'</span></td><td><span class="equip-badge" style="font-size:10px">'+e.cod+'</span></td><td style="font-size:11px;opacity:.6">'+(e.frente||'—')+'</td><td style="color:#3498DB;font-size:11px;font-weight:700;text-align:right">'+fmtP(e.disp,0)+'</td><td><div style="display:flex;align-items:center;gap:4px"><div style="width:50px;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div style="width:'+Math.min((e.oee||0)*100,100)+'%;height:4px;background:'+c2+';border-radius:2px"></div></div><span style="color:'+c2+';font-weight:800;font-size:12px">'+fmtP(e.oee,0)+'</span></div></td></tr>';
            }).join('');
            return '<div class="vg-card" style="cursor:default"><div class="vg-card-header"><div class="vg-card-icon" style="background:'+cfg.color+'22;border:1px solid '+cfg.color+'44"><i class="fa-solid '+cfg.icon+'" style="color:'+cfg.color+'"></i></div><div class="vg-card-title-group"><div class="vg-card-name">'+cfg.label+'</div><div class="vg-card-meta">'+g.nEquips+' equip. · '+fmtH(tot)+' totais</div></div><span class="vg-card-ef" style="background:rgba(0,0,0,.15);color:'+oc+'">'+fmtP(g.oee,0)+'</span></div><div class="vg-card-body"><div class="vg-card-donut">'+donutSVG(Object.assign({total:tot},tem),84)+'</div><div class="vg-card-stats"><div class="vg-stat-row"><span class="vg-stat-dot" style="background:#40800C"></span><span class="vg-stat-label">Produtivas</span><span class="vg-stat-val" style="color:#40800C">'+fmtH(prod)+'</span><span class="vg-stat-pct">'+w(prod).toFixed(0)+'%</span></div><div class="vg-stat-row"><span class="vg-stat-dot" style="background:#E74C3C"></span><span class="vg-stat-label">Manutenção</span><span class="vg-stat-val" style="color:#E74C3C">'+fmtH(manu)+'</span><span class="vg-stat-pct">'+w(manu).toFixed(0)+'%</span></div><div class="vg-stat-row"><span class="vg-stat-dot" style="background:#F39C12"></span><span class="vg-stat-label">Improdutivas</span><span class="vg-stat-val" style="color:#F39C12">'+fmtH(imp)+'</span><span class="vg-stat-pct">'+w(imp).toFixed(0)+'%</span></div></div></div><div class="vg-card-bar">'+barra+'</div>'+(top5?'<div style="padding:0 16px 14px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.4;margin-bottom:6px">Top Equipamentos por OEE</div><table style="width:100%;border-collapse:collapse"><thead><tr><th style="font-size:9px;opacity:.4;padding:2px 4px">#</th><th style="font-size:9px;opacity:.4;padding:2px 4px;text-align:left">Equip.</th><th style="font-size:9px;opacity:.4;padding:2px 4px;text-align:left">Frente</th><th style="font-size:9px;opacity:.4;padding:2px 4px;text-align:right">Disp.</th><th style="font-size:9px;opacity:.4;padding:2px 4px;text-align:left">OEE</th></tr></thead><tbody>'+top5+'</tbody></table></div>':'')+'</div>';
        }).filter(Boolean).join('');
        if (!cards) return '';
        return '<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-layer-group" style="color:#40800C;margin-right:8px"></i>Resultado por Grupo</h3><p class="panel-subtitle">Clique na aba Comparativo para ver próprias vs terceiras</p></div><div style="padding:0 18px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">'+cards+'</div></div>';
    }

    function _frentesHTML(r,titulo) {
        var frentes=r.frentes||[]; if(!frentes.length) return '';
        var rows=frentes.map(function(f){
            var tot=f.tempoTotal||1,tem=f.tempos||{};
            var prod=(tem.PRODUTIVO||0),manu=(tem.MANUTENCAO||0),imp=(tem.IMPRODUTIVO||0),dc=dispC(f.disp);
            var barra=ORDER.map(function(k){var v=tem[k]||0,p=v/tot*100; return p>0?'<div style="width:'+p.toFixed(1)+'%;background:'+COR[k]+';height:100%"></div>':'';}).join('');
            return '<tr><td style="font-weight:700;font-size:13px;color:#40800C">'+f.frente+'</td><td class="text-center" style="font-size:12px">'+f.nEquips+'</td><td style="color:#40800C;font-weight:700">'+fmtH(prod)+'</td><td style="color:#E74C3C">'+fmtH(manu)+'</td><td style="color:#F39C12">'+fmtH(imp)+'</td><td><div style="display:flex;align-items:center;gap:4px"><div style="width:60px;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div style="width:'+Math.min((f.disp||0)*100,100)+'%;height:4px;background:'+dc+';border-radius:2px"></div></div><span style="color:'+dc+';font-weight:800;font-size:12px">'+fmtP(f.disp,0)+'</span></div></td><td style="min-width:70px"><div style="display:flex;height:5px;border-radius:3px;overflow:hidden">'+barra+'</div></td><td style="font-size:11px;color:#F39C12;max-width:140px">'+(f.gargalo?f.gargalo.desc:'—')+'</td></tr>';
        }).join('');
        return '<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-map-marked-alt" style="color:#3498DB;margin-right:8px"></i>'+(titulo||'Frentes de Trabalho')+'</h3></div><div class="table-container"><table class="glass-table" style="min-width:600px"><thead><tr><th>Frente</th><th class="text-center">Equip.</th><th style="color:#40800C">Trabalhando</th><th style="color:#E74C3C">Manutenção</th><th style="color:#F39C12">Parada Op.</th><th>Disponib.</th><th style="min-width:70px">Distribuição</th><th>Maior Parada</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }

    function _indicadoresHTML(r) {
        var ind=r.indicadores; if(!ind) return '';
        var defs=[
            {k:'semApontamento',e:'❓',t:'Sem Registro de Atividade',alerta:false},
            {k:'lavagemLubrificacao',e:'🛢',t:'Lavagem / Lubrificação',alerta:false},
            {k:'catandoCana',e:'🌿',t:'Catando Cana (Transbordo)',alerta:false},
            {k:'aguardandoColhedora',e:'⏳',t:'Aguardando Colhedora',alerta:true},
            {k:'engateDesengate',e:'🔗',t:'Engate / Desengate de Reboque',alerta:false},
            {k:'filaTransbordo',e:'🚦',t:'Fila de Transbordo',alerta:true},
            {k:'batendoPneus',e:'🔴',t:'Batendo Pneus',alerta:true},
            {k:'aguardManobraTransbordo',e:'↩',t:'Aguardando Manobra Transbordo',alerta:false},
            {k:'aguardandoTransbordo',e:'⌛',t:'Aguardando Transbordo',alerta:true},
            {k:'caminhaoCarregando',e:'🚛',t:'Caminhão Carregando',alerta:false},
            {k:'manutencaoMecanica',e:'🔧',t:'Manutenção Mecânica (3027)',alerta:false},
        ].filter(function(d){return ind[d.k]&&ind[d.k].hrsTotal>0;});
        if (!defs.length) return '';
        var rows=defs.map(function(d){
            var item=ind[d.k],temAlerta=(d.alerta&&item.anomalias&&Object.values(item.anomalias).some(Boolean))||(item.alertas&&item.alertas.length>0);
            return '<tr style="'+(temAlerta?'background:rgba(231,76,60,0.04)':'')+'"><td style="font-size:16px">'+d.e+'</td><td style="font-size:12px;font-weight:600">'+d.t+'</td><td style="font-weight:800;color:#F39C12">'+fmtH(item.hrsTotal)+'</td><td style="font-size:11px;opacity:.6">'+(item.nEquips?item.nEquips+' equip.':'')+'</td><td style="font-size:11px">'+(item.maiorFrente?'Maior: <b>'+item.maiorFrente.frente+'</b> ('+fmtH(item.maiorFrente.hrs)+')':'')+'</td><td>'+(temAlerta?'<span class="status-pill pill-red" style="font-size:9px">ALERTA</span>':'')+'</td></tr>';
        }).join('');
        return '<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-flag" style="color:#F39C12;margin-right:8px"></i>Indicadores Operacionais Críticos</h3><p class="panel-subtitle">11 indicadores de gargalo com alerta automático</p></div><div class="table-container"><table class="glass-table"><thead><tr><th></th><th>Indicador</th><th class="text-right">Horas</th><th>Equip.</th><th>Detalhe</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }

    function renderAbaOEE(r,containerId) {
        var el=document.getElementById(containerId); if(!el) return;
        if (!r||r.meta.nEquipamentos===0) { el.innerHTML='<div style="padding:60px;text-align:center;opacity:.4"><i class="fa-solid fa-chart-bar" style="font-size:40px;display:block;margin-bottom:12px"></i>Dados TPL não carregados.</div>'; return; }
        var o=r.oee,m=r.meta,t=r.tempos,oc=oeeC(o.oee),tot=t.total||1;
        var hero='<div class="sp-hero-section" style="flex-wrap:nowrap;overflow-x:auto;gap:8px">'+
            '<div class="sp-hero-kpi" style="border-left:4px solid '+oc+';flex:1.5;min-width:160px" title="OEE = Disponibilidade x Performance x Qualidade"><div class="sp-hero-icon" style="color:'+oc+';font-size:28px"><i class="fa-solid fa-gauge-high"></i></div><div class="sp-hero-body"><div class="sp-hero-val" style="font-size:48px;color:'+oc+'">'+fmtP(o.oee,1)+'</div><div class="sp-hero-label">OEE Global da Frota</div><div class="sp-hero-sub" style="color:'+oc+'">'+oeeL(o.oee)+'</div></div></div>'+
            _heroCelula(dispC(o.disponibilidade),'fa-check-circle','Disponibilidade',fmtP(o.disponibilidade),fmtH(t.produtivo)+' prod. de '+fmtH(tot)+' totais','#40800C')+
            _heroCelula('#F39C12','fa-bolt','Performance',fmtP(o.performance),'CBA: '+fmtH(m.hrsCBATotal)+' / Motor: '+fmtH(m.hrsMotorTotal),'#F39C12')+
            _heroCelula('#3498DB','fa-star','Qualidade <small class="status-pill pill-orange" style="font-size:9px;vertical-align:middle">PROXY</small>',fmtP(o.qualidade),'Impl.: '+fmtH(m.hrsImplTotal),'#3498DB')+
            (m.aderenciaRTK!=null?_heroCelula('#3498DB','fa-satellite','Piloto Automático (RTK)',fmtP(m.aderenciaRTK),'Aderência RTK','#3498DB'):'')+
            '</div>';
        var barRows=ORDER.map(function(k){ var v=t[k.toLowerCase()]||t[k]||0; if(!v) return ''; var p=v/tot*100;
            return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)"><div style="width:11px;height:11px;border-radius:3px;background:'+COR[k]+';flex-shrink:0"></div><div style="flex:1;font-size:12px">'+LBL[k]+'</div><div style="font-size:12px;font-weight:700;color:'+COR[k]+'">'+fmtH(v)+'</div><div style="min-width:100px"><div style="display:flex;align-items:center;gap:4px"><div style="flex:1;height:4px;background:rgba(255,255,255,.07);border-radius:2px"><div style="width:'+Math.round(p)+'%;height:4px;background:'+COR[k]+';border-radius:2px"></div></div><span style="font-size:11px;opacity:.6;width:30px;text-align:right">'+p.toFixed(0)+'%</span></div></div></div>';
        }).join('');
        var temposPanel='<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-clock" style="color:#3498DB;margin-right:8px"></i>Distribuição de Horas — Frota Total</h3><p class="panel-subtitle">Total registrado: '+fmtH(tot)+'</p></div><div style="padding:0 18px 14px">'+barRows+'</div></div>';
        el.innerHTML='<div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">'+_filtroBar(r)+hero+temposPanel+_grupoCardsHTML(r,['colh_propria','colh_terceira'])+'</div>';
    }

    function renderAbaCaminhoes(r) {
        var el=document.getElementById('tab-oee-caminhoes'); if(!el||!r) return;
        el.innerHTML='<div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">'+(_grupoCardsHTML(r,['cam_proprio','cam_terceiro','transbordo'])||'<div style="padding:40px;text-align:center;opacity:.4">Nenhum caminhão encontrado nos dados.</div>')+'</div>';
    }

    function renderAbaGargalos(r) {
        var el=document.getElementById('tab-gargalos'); if(!el) return;
        if (!r||r.meta.nEquipamentos===0) { el.innerHTML='<div style="padding:60px;text-align:center;opacity:.4"><i class="fa-solid fa-magnifying-glass" style="font-size:40px;display:block;margin-bottom:12px"></i>Sem dados de TPL.</div>'; return; }
        var t=r.tempos,total=t.total||1,totalParado=(t.manutencao||0)+(t.improdutivo||0)+(t.climatico||0)+(t.preventivo||0)+(t.indeterminado||0);
        var pp=(totalParado/total*100).toFixed(0),corR=pp>50?'#E74C3C':pp>30?'#F39C12':'#27AE60';
        var hero='<div class="sp-hero-section">'+
            _heroCelula(corR,'fa-circle-exclamation','Tempo Não Produtivo',pp+'%',fmtH(totalParado)+' de '+fmtH(total)+' totais',corR)+
            _heroCelula('#40800C','fa-leaf','Horas Trabalhando',fmtH(t.produtivo||0),((t.produtivo||0)/total*100).toFixed(0)+'% do total','#40800C')+
            _heroCelula('#E74C3C','fa-wrench','Manutenção Mecânica',fmtH(t.manutencao||0),((t.manutencao||0)/total*100).toFixed(0)+'%','#E74C3C')+
            _heroCelula('#F39C12','fa-pause','Paradas Operacionais',fmtH(t.improdutivo||0),((t.improdutivo||0)/total*100).toFixed(0)+'%','#F39C12')+
            ((t.climatico||0)>0?_heroCelula('#3498DB','fa-cloud-rain','Chuva / Clima',fmtH(t.climatico||0),((t.climatico||0)/total*100).toFixed(0)+'%','#3498DB'):'')+
            '</div>';
        var todos=(r.gargalos&&r.gargalos.todos)||[];
        var tabelaGarg='';
        if (todos.length) {
            var rows=todos.slice(0,15).map(function(g,i){
                var cat=g.categoria||'INDETERMINADO',c=COR[cat]||'#64748b',lb=LBL[cat]||cat;
                return '<tr><td><span class="rank-num '+(i<3?'rank-top':'')+'" style="font-size:'+(i<3?'16px':'12px')+'">'+(i<3?['🥇','🥈','🥉'][i]:i+1)+'</span></td><td><span class="status-pill" style="background:'+c+'22;color:'+c+';font-size:9px">'+lb+'</span></td><td style="font-size:12px;font-weight:600">'+(g.codOperacao?'<span style="opacity:.45;font-size:10px">'+g.codOperacao+' · </span>':'')+(g.descOperacao||g.descOp||'—')+'</td><td><span class="group-tag" style="font-size:9px">'+(g.tipo||'—')+' '+(g.owner||'')+'</span></td><td style="font-size:11px;opacity:.6">'+(g.frente||'—')+'</td><td style="font-weight:800;color:'+c+';text-align:right">'+fmtH(g.hrsTotal)+'</td><td style="text-align:right;opacity:.5;font-size:11px">'+(g.nEquips||0)+' equip.</td></tr>';
            }).join('');
            tabelaGarg='<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-ranking-star" style="color:#E74C3C;margin-right:8px"></i>Top 15 — Maiores Causas de Parada</h3><p class="panel-subtitle">Ordenado por horas acumuladas</p></div><div class="table-container"><table class="glass-table"><thead><tr><th style="width:32px">#</th><th>Categoria</th><th>Operação</th><th>Tipo / Frota</th><th>Frente</th><th class="text-right">Horas</th><th class="text-right">Equip.</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
        }
        el.innerHTML='<div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">'+hero+tabelaGarg+_indicadoresHTML(r)+_frentesHTML(r,'Distribuição por Frente')+'</div>';
    }

    function renderAbaEficiencia(r) {
        var el=document.getElementById('tab-eficiencia-operacional'); if(!el) return;
        if (!r||r.meta.nEquipamentos===0) { el.innerHTML='<div style="padding:60px;text-align:center;opacity:.4">Sem dados.</div>'; return; }
        var t=r.tempos,total=t.total||1;
        var hero='<div class="sp-hero-section">'+
            _heroCelula(oeeC(r.oee.oee),'fa-gauge-high','OEE da Frota',fmtP(r.oee.oee,1),oeeL(r.oee.oee),oeeC(r.oee.oee))+
            _heroCelula('#40800C','fa-leaf','Horas Trabalhando',fmtH(t.produtivo||0),((t.produtivo||0)/total*100).toFixed(0)+'% do total','#40800C')+
            _heroCelula('#E74C3C','fa-wrench','Horas Manutenção',fmtH(t.manutencao||0),((t.manutencao||0)/total*100).toFixed(0)+'%','#E74C3C')+
            _heroCelula('#F39C12','fa-pause','Paradas Operacionais',fmtH(t.improdutivo||0),((t.improdutivo||0)/total*100).toFixed(0)+'%','#F39C12')+
            (r.meta.hrsMotorTotal>0?_heroCelula('#3498DB','fa-satellite','Piloto Automático (RTK)',fmtP(r.meta.aderenciaRTK),'Aderência RTK','#3498DB'):'')+
            '</div>';
        var todos=[]; Object.values(r.grupos).forEach(function(g){(g.ranking||[]).forEach(function(e){todos.push(e);});});
        todos.sort(function(a,b){return b.oee-a.oee;});
        var rankRows=todos.slice(0,25).map(function(e,i){
            var c=oeeC(e.oee),med=i<3?['🥇','🥈','🥉'][i]:'',topOp=e.topOps&&e.topOps[0]?e.topOps[0].desc:'—';
            var prod=(e.tempos&&e.tempos.PRODUTIVO)||0,manu=(e.tempos&&e.tempos.MANUTENCAO)||0;
            return '<tr style="background:'+(i<3?'rgba(64,128,12,0.04)':'')+'"><td><span class="rank-num '+(i<3?'rank-top':'')+'" style="font-size:'+(i<3?'16px':'12px')+'">'+(med||i+1)+'</span></td><td><span class="equip-badge">'+e.cod+'</span></td><td style="font-size:12px;opacity:.65">'+(e.frente||'—')+'</td><td style="color:#40800C;font-weight:700">'+fmtH(prod)+'</td><td style="color:#E74C3C">'+fmtH(manu)+'</td><td>'+barPct(e.disp,dispC(e.disp),70)+'</td><td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;max-width:70px;height:6px;background:rgba(255,255,255,.1);border-radius:3px"><div style="width:'+Math.min((e.oee||0)*100,100)+'%;height:6px;background:'+c+';border-radius:3px"></div></div><span style="color:'+c+';font-weight:800;font-size:13px">'+fmtP(e.oee,0)+'</span></div></td><td style="color:'+c+';font-size:11px;font-weight:700">'+oeeL(e.oee)+'</td><td style="font-size:11px;opacity:.6;max-width:160px">'+(topOp.length>32?topOp.slice(0,32)+'…':topOp)+'</td></tr>';
        }).join('');
        var rankPanel='<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-trophy" style="color:#40800C;margin-right:8px"></i>Ranking de Equipamentos — por OEE</h3><p class="panel-subtitle">Todos os grupos · '+todos.length+' equipamentos</p></div><div class="table-container"><table class="glass-table" style="min-width:640px"><thead><tr><th style="width:32px">#</th><th>Equip.</th><th>Frente</th><th style="color:#40800C">Trabalhando</th><th style="color:#E74C3C">Manutenção</th><th>Disponib.</th><th>OEE</th><th>Nível</th><th>Principal Parada</th></tr></thead><tbody>'+rankRows+'</tbody></table></div></div>';
        el.innerHTML='<div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">'+hero+rankPanel+_frentesHTML(r,'Eficiência por Frente de Trabalho')+'</div>';
    }

    function renderAbaComparativo(r) {
        var el=document.getElementById('tab-comparativo-oee'); if(!el) return;
        if (!r||r.meta.nEquipamentos===0) { el.innerHTML='<div style="padding:60px;text-align:center;opacity:.4">Sem dados.</div>'; return; }
        var pares=[
            {titulo:'Colhedoras',propria:r.grupos.colh_propria,terceiro:r.grupos.colh_terceira,labelP:'🚜 Próprias (80x–85x)',labelT:'🤝 Terceiras (93x–95x)',corP:'#40800C',corT:'#E74C3C'},
            {titulo:'Caminhões', propria:r.grupos.cam_proprio, terceiro:r.grupos.cam_terceiro, labelP:'🚛 Próprios (31x–32x)',labelT:'🚚 Terceiros (91x)',    corP:'#3498DB',corT:'#8E44AD'},
        ];
        var html='';
        pares.forEach(function(par){
            var temP=par.propria&&par.propria.nEquips>0,temT=par.terceiro&&par.terceiro.nEquips>0;
            if(!temP&&!temT) return;
            var cols=[{g:temP?par.propria:null,label:par.labelP,cor:par.corP},{g:temT?par.terceiro:null,label:par.labelT,cor:par.corT}];
            var headerCols=cols.map(function(c){return '<th style="text-align:center;color:'+c.cor+';font-size:13px;font-weight:800">'+(c.g?c.label:'<span style="opacity:.3">Sem dados</span>')+'</th>';}).join('');
            var barrasComp=cols.map(function(c){
                if(!c.g) return '<td></td>';
                var tem=c.g.tempos||{},tot=Object.values(tem).reduce(function(a,b){return a+b;},0)||1;
                var barra=ORDER.map(function(ok){var v=tem[ok]||0,p=v/tot*100; return p>0?'<div style="width:'+p.toFixed(1)+'%;background:'+COR[ok]+';height:100%"></div>':'';}).join('');
                return '<td style="text-align:center;padding:6px 16px"><div style="display:flex;height:8px;border-radius:4px;overflow:hidden">'+barra+'</div></td>';
            }).join('');
            var metrics=[
                {label:'OEE',fn:function(g){return '<span style="color:'+oeeC(g.oee)+';font-weight:900;font-size:18px">'+fmtP(g.oee,1)+'</span> <span style="color:'+oeeC(g.oee)+';font-size:11px">'+oeeL(g.oee)+'</span>';}},
                {label:'Disponibilidade',fn:function(g){return barPct(g.disp,dispC(g.disp));}},
                {label:'Performance',fn:function(g){return barPct(g.perf,'#F39C12');}},
                {label:'Trabalhando',fn:function(g){return '<span style="color:#40800C;font-weight:700">'+fmtH((g.tempos&&g.tempos.PRODUTIVO)||0)+'</span>';}},
                {label:'Manutenção',fn:function(g){return '<span style="color:#E74C3C">'+fmtH((g.tempos&&g.tempos.MANUTENCAO)||0)+'</span>';}},
                {label:'Improdutivas',fn:function(g){return '<span style="color:#F39C12">'+fmtH((g.tempos&&g.tempos.IMPRODUTIVO)||0)+'</span>';}},
                {label:'Equipamentos',fn:function(g){return g.nEquips+' equip.';}},
            ];
            var bodyRows=metrics.map(function(m){
                var tds=cols.map(function(c){return '<td style="text-align:center;padding:8px 16px">'+(c.g?m.fn(c.g):'<span style="opacity:.3">—</span>')+'</td>';}).join('');
                return '<tr><td style="font-size:12px;opacity:.6;padding:8px 16px;white-space:nowrap">'+m.label+'</td>'+tds+'</tr>';
            }).join('');
            var deltaHTML='';
            if(temP&&temT){
                var deltas=[{label:'OEE',dp:par.propria.oee,dt:par.terceiro.oee},{label:'Disponib.',dp:par.propria.disp,dt:par.terceiro.disp},{label:'Performance',dp:par.propria.perf,dt:par.terceiro.perf}].filter(function(d){return d.dp!=null&&d.dt!=null;});
                if(deltas.length){
                    deltaHTML='<div style="margin-top:12px;padding:12px 16px;background:rgba(255,255,255,.03);border-radius:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;opacity:.4;margin-bottom:8px">Diferença — Próprias vs Terceiras</div><div style="display:flex;gap:10px;flex-wrap:wrap">'+
                    deltas.map(function(d){var delta=d.dp-d.dt,absPP=(Math.abs(delta)*100).toFixed(0)+'pp',icon=Math.abs(delta)<0.02?'≈':delta>0?'⬆':'⬇',c=Math.abs(delta)<0.02?'#64748b':delta>0?par.corP:par.corT;
                        return '<div style="flex:1;min-width:90px;background:rgba(255,255,255,.04);border-radius:6px;padding:8px;text-align:center"><div style="font-size:10px;opacity:.5;margin-bottom:2px">'+d.label+'</div><div style="font-size:15px;font-weight:900;color:'+c+'">'+icon+' '+absPP+'</div><div style="font-size:9px;opacity:.5">'+(delta>0?'Próprias melhor':delta<0?'Terceiras melhor':'Equivalente')+'</div></div>';
                    }).join('')+'</div></div>';
                }
            }
            var rankRows2=[];
            cols.forEach(function(c){if(!c.g)return;(c.g.ranking||[]).slice(0,8).forEach(function(e){rankRows2.push({e:e,cor:c.cor,grupo:c.label});});});
            rankRows2.sort(function(a,b){return b.e.oee-a.e.oee;});
            var rankTableRows=rankRows2.slice(0,12).map(function(item,i){
                var e=item.e,c2=oeeC(e.oee),med=i<3?['🥇','🥈','🥉'][i]:'';
                return '<tr><td><span class="rank-num '+(i<3?'rank-top':'')+'" style="font-size:'+(i<3?'14px':'11px')+'">'+(med||i+1)+'</span></td><td><span class="equip-badge" style="font-size:10px">'+e.cod+'</span></td><td style="font-size:11px;color:'+item.cor+';font-weight:700">'+item.grupo.replace(/[🚜🤝🚛🚚]\s*/,'').split('(')[0].trim()+'</td><td style="font-size:11px;opacity:.6">'+(e.frente||'—')+'</td><td>'+barPct(e.disp,dispC(e.disp),60)+'</td><td><div style="display:flex;align-items:center;gap:4px"><div style="width:55px;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div style="width:'+Math.min((e.oee||0)*100,100)+'%;height:4px;background:'+c2+';border-radius:2px"></div></div><span style="color:'+c2+';font-weight:800;font-size:12px">'+fmtP(e.oee,0)+'</span></div></td></tr>';
            }).join('');
            html+='<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-balance-scale" style="color:#3498DB;margin-right:8px"></i>'+par.titulo+' — Próprias vs Terceiras</h3><p class="panel-subtitle">Comparativo de desempenho e distribuição de horas no período</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:0 18px 18px"><div><table class="glass-table" style="width:100%"><thead><tr><th></th>'+headerCols+'</tr></thead><tbody><tr><td style="padding:4px 16px"></td>'+barrasComp+'</tr>'+bodyRows+'</tbody></table>'+deltaHTML+'</div><div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;opacity:.4;margin:0 0 8px 4px">Ranking Individual</div><table class="glass-table"><thead><tr><th style="width:28px">#</th><th>Equip.</th><th>Grupo</th><th>Frente</th><th>Disp.</th><th>OEE</th></tr></thead><tbody>'+rankTableRows+'</tbody></table></div></div></div>';
        });
        var trb=r.grupos.transbordo;
        if(trb&&trb.nEquips>0){
            var trbRows=(trb.ranking||[]).slice(0,10).map(function(e,i){var c=oeeC(e.oee),med=i<3?['🥇','🥈','🥉'][i]:''; return '<tr><td><span class="rank-num '+(i<3?'rank-top':'')+'" style="font-size:'+(i<3?'16px':'12px')+'">'+(med||i+1)+'</span></td><td><span class="equip-badge">'+e.cod+'</span></td><td style="font-size:11px;opacity:.6">'+(e.frente||'—')+'</td><td>'+barPct(e.disp,dispC(e.disp),70)+'</td><td><div style="display:flex;align-items:center;gap:4px"><div style="width:60px;height:4px;background:rgba(255,255,255,.08);border-radius:2px"><div style="width:'+Math.min((e.oee||0)*100,100)+'%;height:4px;background:'+c+';border-radius:2px"></div></div><span style="color:'+c+';font-weight:800;font-size:12px">'+fmtP(e.oee,0)+'</span></div></td></tr>';}).join('');
            html+='<div class="panel sp-panel"><div class="panel-header"><h3><i class="fa-solid fa-tractor" style="color:#F39C12;margin-right:8px"></i>Transbordos Terceiros (92x)</h3></div><div class="sp-hero-section" style="padding:12px 18px 0">'+_heroCelula(oeeC(trb.oee),'fa-gauge-high','OEE',fmtP(trb.oee,1),oeeL(trb.oee),oeeC(trb.oee))+_heroCelula(dispC(trb.disp),'fa-check-circle','Disponibilidade',fmtP(trb.disp),'Meta: ≥85%',dispC(trb.disp))+_heroCelula('#F39C12','fa-bolt','Performance',fmtP(trb.perf),'','#F39C12')+_heroCelula('#64748b','fa-cog','Equipamentos',trb.nEquips+' equip.','','#64748b')+'</div><div class="table-container" style="padding:12px 18px 18px"><table class="glass-table"><thead><tr><th style="width:32px">#</th><th>Equip.</th><th>Frente</th><th>Disponib.</th><th>OEE</th></tr></thead><tbody>'+trbRows+'</tbody></table></div></div>';
        }
        el.innerHTML='<div style="display:flex;flex-direction:column;gap:16px;padding:4px 0">'+(html||'<div style="padding:40px;text-align:center;opacity:.4">Sem dados para comparativo.</div>')+'</div>';
    }

    window._oeeSetFiltro=function(modo){
        ST.filtroMode=modo;
        if(modo==='safra'){ST.inicio=null;ST.fim=null;}
        else if(modo==='mes'){var t=new Date();ST.inicio=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-01';ST.fim=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(new Date(t.getFullYear(),t.getMonth()+1,0).getDate()).padStart(2,'0');}
        else if(modo==='semana'){var t2=new Date(),dow=t2.getDay()||7,seg=new Date(t2);seg.setDate(t2.getDate()-dow+1);var dom=new Date(seg);dom.setDate(seg.getDate()+6);ST.inicio=seg.toISOString().slice(0,10);ST.fim=dom.toISOString().slice(0,10);}
        else if(modo==='dia'){ST.inicio=ST.fim=new Date().toISOString().slice(0,10);}
        _rerender();
    };
    window._oeeAplicarCustom=function(){ST.inicio=((document.getElementById('oe-di')||{}).value)||null;ST.fim=((document.getElementById('oe-df')||{}).value)||null;_rerender();};
    function _rerender(){if(!ST.tplData||!window.OEE_TPL_Analysis)return;try{var r=window.OEE_TPL_Analysis.analyze(ST.tplData,{inicio:ST.inicio,fim:ST.fim});ST.analysis=r;window.OEE_TPL._dispatch(r);}catch(e){console.error('[OEE TPL] Erro re-render:',e);}}

    window.OEE_TPL={
        _lastAnalysis:null,
        _dispatch:function(r){renderAbaOEE(r,'tab-oee-colhedoras');renderAbaCaminhoes(r);renderAbaGargalos(r);renderAbaEficiencia(r);renderAbaComparativo(r);},
        renderColhedoras:function(rows){try{if(!window.OEE_TPL_Analysis)return;ST.tplData=rows;var r=window.OEE_TPL_Analysis.analyze(rows,{inicio:ST.inicio,fim:ST.fim});this._lastAnalysis=r;ST.analysis=r;this._dispatch(r);}catch(e){console.error('[OEE_TPL.renderColhedoras]',e);}},
        renderCaminhoes:function(){try{if(this._lastAnalysis)renderAbaCaminhoes(this._lastAnalysis);}catch(e){}},
        renderComparativo:function(){try{if(this._lastAnalysis)renderAbaComparativo(this._lastAnalysis);}catch(e){}},
        renderGargalos:function(){try{if(this._lastAnalysis)renderAbaGargalos(this._lastAnalysis);}catch(e){}},
    };
    window.renderOEEFromTPL=function(id,r,d){if(d)ST.tplData=d;renderAbaOEE(r,id);};
    window.OEE_TPL_COLORS=COR;
    window.OEE_TPL_STATE=ST;
    console.log('[OEE_tpl_renderer v5.0] Registrado — UI integrada ao padrão AgroAnalytics.');
})();