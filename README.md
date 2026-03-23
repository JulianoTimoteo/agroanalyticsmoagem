# AgroAnalytics v5 — Documentação Técnica Completa

## Índice
1. [Estrutura do Projeto](#1-estrutura-do-projeto)
2. [Fluxo de Dados](#2-fluxo-de-dados)
3. [Como Adicionar Nova Aba](#3-como-adicionar-nova-aba)
4. [Como Corrigir Bugs](#4-como-corrigir-bugs)
5. [Dependências entre Arquivos](#5-dependências-entre-arquivos)
6. [Regras de Cálculo](#6-regras-de-cálculo)
7. [Problemas Conhecidos](#7-problemas-conhecidos)
8. [Como Outra IA Deve Atuar](#8-como-outra-ia-deve-atuar-no-projeto)

---

## 1. Estrutura do Projeto

```
agroanalytics-v5-final/
├── index.html          ← HTML principal (sem JS inline)
├── app.js              ← ORQUESTRADOR: inicializa todos os módulos
├── sw.js               ← Service Worker (cache offline)
├── manifest.json       ← PWA manifest
├── README.md
│
├── js/
│   ├── core/           ← Processadores de dados (sem DOM)
│   │   ├── dataanalyzer.js
│   │   ├── data-analyzer-kpis.js
│   │   ├── data-analyzer-rankings.js
│   │   ├── data-analyzer-time.js    ← Buckets 06:00→05:59
│   │   ├── data-analyzer-metas.js
│   │   ├── datavalidator.js
│   │   ├── datavisualizer.js
│   │   └── intelligent-processor.js
│   │
│   ├── shared/
│   │   ├── utils.js
│   │   ├── oee-fleet-classifier.js
│   │   ├── Mobile_revolution.js
│   │   └── modtv.js
│   │
│   ├── Moagem/                         ← 5 arquivos (regra: mín 2 por aba)
│   │   ├── InformativoOperacional.js   ← Cards KPI da aba
│   │   ├── StatusDaFrota.js            ← Cards de frota (ida/campo/volta...)
│   │   ├── AcumuladoEProgresso.js      ← Acumulado + barra + inputs de meta
│   │   ├── ProjecaoDeMoagem.js         ← Projeção 24h + badge
│   │   ├── AcumuladoEProgresso_charts.js
│   │   └── VisaoHorariaDetalhada_charts.js
│   │
│   ├── EntregaHXH/                     ← 3 arquivos
│   │   ├── TimelineHXH.js              ← Scroll horas 06:00→05:59
│   │   ├── ViagensPorHora.js           ← Gráfico de viagens por hora
│   │   └── PesoPorFrente.js            ← Gráfico de peso por frente
│   │
│   ├── Caminhoes/                      ← 2 arquivos
│   │   ├── RankingCaminhoes.js         ← Rankings própria/terceiros
│   │   └── GraficoRotaCaminhoes.js     ← Doughnut etapas
│   │
│   ├── Colhedoras/                     ← 2 arquivos
│   │   ├── RankingColhedoras.js        ← Rankings + operadores
│   │   └── GraficoDisponibilidade.js   ← Barras disp % com meta
│   │
│   ├── Usuarios/                       ← 2 arquivos
│   │   ├── FormUsuario.js              ← CRUD formulário
│   │   └── ListaUsuarios.js            ← Tabela + editar/excluir
│   │
│   ├── FrenteDeTrabalho/
│   │   └── FrenteGrid.js
│   ├── Metas/
│   │   └── MetasGrid.js
│   ├── Consumo/
│   │   └── ConsumoPerformance.js
│   ├── VisaoGlobal/
│   │   └── VisaoGlobal.js
│   └── OEE/
│       ├── Oee_analyzer.js
│       ├── OEE_renderer.js
│       └── OEE_unified.js
│
└── css/
    ├── base/main.css + mobile.css
    ├── Moagem/Moagem.css, StatusDaFrota.css, AcumuladoEProgresso.css
    ├── EntregaHXH/EntregaHXH.css
    ├── Caminhoes/Caminhoes.css
    ├── Colhedoras/Colhedoras.css
    ├── Usuarios/Usuarios.css
    ├── Consumo/Consumo.css
    ├── FrenteDeTrabalho/FrenteDeTrabalho.css
    ├── Metas/Metas.css
    ├── VisaoGlobal/VisaoGlobal.css
    └── OEE/oee.css
```

---

## 2. Fluxo de Dados

```
Planilhas CSV (Google Drive URL pública)
        │
        ▼
app.js._loadAllData()
  ├── producao.csv    → this.data[]            (viagens, peso, frota)
  ├── potencial.csv   → this.potentialData[]   (potencial/hora, rotação)
  ├── metas.xlsx      → this.metaData[]
  ├── AcmSafra.csv    → this.acmSafraData[]    (acumulado da safra)
  ├── ColConD1.csv    → this.consumoD1Data[]   (consumo diário)
  ├── ColConAcm.csv   → this.consumoAcmData[]  (consumo acumulado)
  ├── DispD1.csv      → this.dispD1Data[]
  └── DispAcm.csv     → this.dispAcmData[]
        │
        ▼
DataAnalyzer.analyzeAll() → this.analysisResult
  ├── totalPesoLiquido    (soma producao.csv campo "Peso Líquido")
  ├── acumuladoSafra      (de AcmSafra.csv campo "Peso Líquido")
  ├── totalViagens
  ├── viagensProprias     (prefixos 31xx/32xx/80xx)
  ├── viagensTerceiros    (prefixo 91xx)
  ├── fleetStatus         (etapas de cada caminhão)
  └── projecaoMoagem.forecast
        │
        ▼
updateDashboardWithCorrectedValues()
  ├── StatusDaFrota.update(analysisResult)
  ├── AcumuladoEProgresso.update(analysisResult)
  ├── ProjecaoDeMoagem.update(analysisResult)
  ├── RankingCaminhoes.update(analysisResult)
  ├── GraficoRotaCaminhoes.update(analysisResult)
  ├── RankingColhedoras.update(analysisResult)
  └── GraficoDisponibilidade.update(consumoAcmData)

Ao abrir aba HxH:
  ├── TimelineHXH.update(data)
  │   └── dispara 'hxhHoraChanged' ao clicar hora
  │         ├── ViagensPorHora filtra pela hora
  │         └── PesoPorFrente filtra pela hora
  ├── ViagensPorHora.update(data)
  └── PesoPorFrente.update(data)
```

---

## 3. Como Adicionar Nova Aba

### Passo 1 — Criar pelo menos 2 arquivos JS
```bash
mkdir js/NovaAba css/NovaAba
touch js/NovaAba/ComponentePrincipal.js  # responsabilidade A
touch js/NovaAba/GraficoNovaAba.js       # responsabilidade B
touch css/NovaAba/NovaAba.css
```

### Passo 2 — Padrão obrigatório de cada JS
```javascript
// ============================================================
// js/NovaAba/ComponentePrincipal.js
// Responsabilidade: O QUE EXATAMENTE este arquivo faz
// ============================================================
// ⚠️ DEPENDÊNCIA CRUZADA
// Depende de: app.js (estado global)
// Interage com: GraficoNovaAba.js
// ============================================================

export function initComponentePrincipal(data) { /* inicializa */ }
export function updateComponentePrincipal(data) { /* atualiza */ }

window.ComponentePrincipal = { init: initComponentePrincipal, update: updateComponentePrincipal };
```

### Passo 3 — Registrar no index.html
```html
<link rel="stylesheet" href="css/NovaAba/NovaAba.css">
<script src="js/NovaAba/ComponentePrincipal.js"></script>
<script src="js/NovaAba/GraficoNovaAba.js"></script>
```

### Passo 4 — Conectar no app.js
Em `processDataAsync()`:
```javascript
if (window.ComponentePrincipal) window.ComponentePrincipal.init(this.analysisResult);
```
Em `updateDashboardWithCorrectedValues()`:
```javascript
if (window.ComponentePrincipal) window.ComponentePrincipal.update(this.analysisResult);
```

---

## 4. Como Corrigir Bugs

### Valor incorreto em card
1. Inspecionar o elemento → copiar o `id`
2. `grep -r "id-do-elemento" js/` para achar qual módulo atualiza
3. Rastrear o campo até `DataAnalyzer.analyzeAll()` em `js/core/dataanalyzer.js`
4. Corrigir na **fonte** (DataAnalyzer), não no módulo de exibição

### Número absurdo (ex: 428.503.301.999.983)
**Causa:** `replace(/\./g, '')` em string com decimal BR remove o ponto decimal.
**Solução:** usar o parser blindado:
```javascript
function _toNum(v) {
    let s = String(v).trim().replace(/[^\d,.-]/g, '');
    if ((s.match(/\./g)||[]).length > 1) s = s.replace(/\./g,''); // remove milhar
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}
```

### Classificação de frota errada
| Prefixo | Tipo |
|---------|------|
| 31xx, 32xx, 80xx | PROPRIO |
| 91xx | TERCEIRO |
- Campo CSV: `dscTipoPropFrota` = `'PROPRIO'` ou `'FRETISTA'` (sem acento)
- **NUNCA comparar com `'PRÓPRIA'`** (tem acento e é errado)

---

## 5. Dependências entre Arquivos

```
app.js
 ├── CHAMA → window.NomeModulo.init/update (todos os módulos)
 ├── CONSOME → dataanalyzer.js → analysisResult
 └── ORQUESTRA → ordem: DataAnalyzer → visualizer → módulos

TimelineHXH.js → dispara 'hxhHoraChanged' → ViagensPorHora + PesoPorFrente
AcumuladoEProgresso.js → dispara 'metaMoagemChanged' → ProjecaoDeMoagem
FormUsuario.js → dispara 'usuarioSalvo' → ListaUsuarios
```

---

## 6. Regras de Cálculo

| KPI | Fórmula | Fonte |
|-----|---------|-------|
| Acumulado Safra | Soma de `"Peso Líquido"` em AcmSafra.csv | acmSafraData |
| Acumulado Dia | `analysisResult.totalPesoLiquido` | producao.csv |
| Projeção 24h | `(acumDia / horasAgro) × 24` | calculado |
| TMD D1 | `Σ(Ton.Cana) / Count(Equip)` | ColConD1 |
| TMD Acm | `Σ(Ton.Cana) / Count(Equip) / QtdDiasPeriodo` | ColConAcm |
| Disp % | se `0 < v ≤ 1.1` → `v × 100`, senão usar direto | ColConAcm |
| Viagens Próprias | `cod.startsWith('31'/'32'/'80')` | producao.csv |

---

## 7. Problemas Conhecidos

| Problema | Causa | Solução |
|----------|-------|---------|
| OEE "Sem TPL" | GAS_URL não configurada | Definir `window.GAS_URL` em app.js |
| Disp % = 0 | Acento em "R. Energético" não normalizado | `.normalize('NFD')` antes de comparar |
| TMD errado no acumulado | Falta dividir por QtdDiasPeriodo | Ver `_calcStats(rows, true)` em ConsumoPerformance.js |
| Gráficos não aparecem | Scripts fora de ordem | Verificar ordem `<script>` no index.html |
| Safra = 28.19 ton | Campo `pesoLiquido` vs `"Peso Líquido"` | Usar exatamente `"Peso Líquido"` com espaço e acento |

---

## 8. Como Outra IA Deve Atuar no Projeto

### Regras absolutas
1. **Ler o arquivo COMPLETO antes de editar** — nunca editar pelo nome do arquivo sem ler
2. **Nunca criar stub** — cada arquivo deve ter código funcional (mínimo 30 linhas reais)
3. **Nunca hardcode de fallback** — `|| 17957.38` ou qualquer número fixo é proibido
4. **Sempre usar `_toNum()`** para converter valores do formato BR
5. **Corrigir na fonte** — se um KPI está errado, corrigir no DataAnalyzer, não no módulo de exibição
6. **Testar a ordem dos `<script>`** — Chart.js deve vir antes dos módulos de gráfico

### Anti-padrões a evitar
```javascript
// ❌ ERRADO — stub inútil
console.log('[Modulo] Carregado');

// ❌ ERRADO — fallback hardcoded
const valor = calcular() || 17957.38;

// ❌ ERRADO — classificação com acento
if (row.tipoFrota === 'PRÓPRIA') { ... }

// ❌ ERRADO — parser que quebra decimais BR
const n = parseFloat(str.replace(/\./g, '').replace(',', '.'));
// (remove "1.234,56" → "123456" ao invés de "1234.56")

// ✅ CORRETO
const n = _toNum(str); // usa o parser blindado
```

### Fluxo recomendado para qualquer alteração
```
1. grep o id/campo problemático nos arquivos JS
2. Rastrear até a fonte de dados (DataAnalyzer)
3. Verificar o nome EXATO da coluna na planilha (com/sem acento, espaços)
4. Corrigir com parser blindado _toNum()
5. Atualizar APENAS o arquivo necessário
6. Verificar que index.html carrega esse arquivo
```
