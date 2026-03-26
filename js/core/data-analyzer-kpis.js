// data-analyzer-kpis.js - Cálculo de KPIs Básicos (VERSÃO FINAL - CORREÇÃO DE LEITURA TIPO PROPRIETÁRIO)

if (typeof DataAnalyzerKPIs === 'undefined') {
    class DataAnalyzerKPIs {

        constructor(analyzer) {
            this.analyzer = analyzer;
        }

        /**
         * Auxiliar para converter string numérica BR (1.000,00) para Float JS (1000.00)
         */
        _parseBRNumber(val) {
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (!val) return 0;

            let str = String(val).trim().replace(/\s/g, '');
            if (!str) return 0;

            const numDots   = (str.match(/\./g) || []).length;
            const numCommas = (str.match(/,/g)  || []).length;

            // Sem separadores
            if (numDots === 0 && numCommas === 0) {
                return parseFloat(str) || 0;
            }

            // Múltiplas vírgulas → formato US com milhar vírgula: "2,818,825.42"
            if (numCommas > 1) {
                str = str.replace(/,/g, '');
                return parseFloat(str) || 0;
            }

            // Múltiplos pontos → formato BR com milhar ponto: "2.818.825,42"
            if (numDots > 1) {
                str = str.replace(/\./g, '').replace(',', '.');
                return parseFloat(str) || 0;
            }

            // Um ponto e uma vírgula → determina qual é decimal
            if (numDots === 1 && numCommas === 1) {
                const lastDot   = str.lastIndexOf('.');
                const lastComma = str.lastIndexOf(',');
                if (lastComma > lastDot) {
                    // BR: "1.234,56" → ponto é milhar, vírgula é decimal
                    str = str.replace('.', '').replace(',', '.');
                } else {
                    // US: "1,234.56" → vírgula é milhar, ponto é decimal
                    str = str.replace(',', '');
                }
                return parseFloat(str) || 0;
            }

            // Só vírgula → BR decimal: "1234,56"
            if (numCommas === 1 && numDots === 0) {
                str = str.replace(',', '.');
                return parseFloat(str) || 0;
            }

            // Só ponto → US/BR decimal: "1234.56"
            return parseFloat(str) || 0;
        }

        /**
         * 🔥 CÁLCULO DO ACUMULADO SAFRA
         * Procura inteligentemente a coluna de peso na planilha AcmSafra
         */
        calculateAcumuladoSafra(productionData, acmSafraData) {
            // ═══════════════════════════════════════════════════════════════
            // SAFRA-AWARE: soma Peso Líquido de TODOS os registros de produção
            // Safra 25/26 = Ago/2025 → Jul/2026
            // Lógica de transição:
            //   • Enquanto não existirem dados de 2026, usa a safra 25/26 normalmente.
            //   • Quando dados de 2026/2027 começarem a aparecer, congela o total
            //     25/26 e apresenta o acumulado da nova safra 26/27.
            // ═══════════════════════════════════════════════════════════════

            const _parseNum = (v) => {
                if (typeof v === 'number') return isNaN(v) ? 0 : v;
                if (!v) return 0;
                let s = String(v).trim().replace(/[^\d,.-]/g, '');
                if ((s.match(/\./g)||[]).length > 1) s = s.replace(/\./g, '');
                s = s.replace(',', '.');
                const n = parseFloat(s);
                return isNaN(n) ? 0 : n;
            };

            const _getDate = (row) => {
                const raw = row['Dia Balanca'] || row['DIA BALANCA'] || row['dia_balanca'] || '';
                if (!raw) return null;
                const s = String(raw).trim();
                // Formato DD/MM/YYYY
                const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
                return null;
            };

            // Determina limites da safra 25/26 e 26/27
            const SAFRA_2526_INI = new Date(2025, 7, 1);  // Ago/2025
            const SAFRA_2526_FIM = new Date(2026, 6, 31); // Jul/2026
            const SAFRA_2627_INI = new Date(2026, 7, 1);  // Ago/2026

            // Fontes de dados: produção do Firestore + AcmSafra legado
            const prodRows = Array.isArray(productionData) ? productionData : [];
            const acmRows  = Array.isArray(acmSafraData)   ? acmSafraData  : [];

            // Verifica se já tem dados da safra nova (26/27)
            let hasSafra2627 = false;
            for (const row of prodRows) {
                const d = _getDate(row);
                if (d && d >= SAFRA_2627_INI) { hasSafra2627 = true; break; }
            }

            // Acumula produção por safra usando os registros de produção
            let total2526 = 0;
            let total2627 = 0;
            let rowCount  = 0;

            for (const row of prodRows) {
                if (this.analyzer.isAggregationRow(row)) continue;
                const peso = _parseNum(
                    row['Peso Líquido'] || row['Peso Liquido'] || row['PESO LIQUIDO'] ||
                    row['pesoLiquido']  || row['peso']        || 0
                );
                if (peso <= 0) continue;
                const d = _getDate(row);
                if (!d) continue;
                if (d >= SAFRA_2526_INI && d <= SAFRA_2526_FIM) { total2526 += peso; rowCount++; }
                if (d >= SAFRA_2627_INI)                         { total2627 += peso; rowCount++; }
            }

            // Fallback: se produção não veio, usa AcmSafra legado
            if (total2526 === 0 && acmRows.length > 0) {
                const firstRow = acmRows[0];
                const keys = Object.keys(firstRow);
                const possibleCols = ['PESO LIQUIDO','PESO_LIQUIDO','LIQUIDO','LÍQUIDO',
                                      'TONELADAS','TON','TOTAL','ACUMULADO','MOAGEM'];
                let weightCol = null;
                for (const col of possibleCols) {
                    weightCol = keys.find(k => k.toUpperCase().includes(col));
                    if (weightCol) break;
                }
                if (weightCol) {
                    acmRows.forEach(row => {
                        if (this.analyzer.isAggregationRow(row)) return;
                        total2526 += _parseNum(row[weightCol]);
                    });
                    console.log('[KPIs] AcmSafra (legado): col="'+weightCol+'" | total='+total2526.toLocaleString('pt-BR'));
                }
            }

            // Resultado: se nova safra começou → retorna total da nova; senão, retorna 25/26
            const result = hasSafra2627 ? total2627 : total2526;

            console.log(
                `[KPIs] Acumulado safra: ${hasSafra2627 ? '26/27' : '25/26'} = ` +
                `${result.toLocaleString('pt-BR')} t ` +
                `(prodRows=${prodRows.length} rowsCont=${rowCount} acmFallback=${acmRows.length > 0 ? 'sim' : 'não'})`
            );

            // Expõe metadados para uso no tooltip do dashboard
            if (this.analyzer) {
                this.analyzer._safraInfo = {
                    safraAtual:   hasSafra2627 ? '26/27' : '25/26',
                    total2526,
                    total2627,
                    hasSafra2627
                };
            }

            return result;
        }

        /**
         * TAXA DE ANÁLISE GLOBAL: cargas analisadas / total cargas
         * Uma viagem TREMINHÃO tem 3 cargas; RODOTREM tem 2.
         * Taxa = cargas_SIM / total_cargas_únicas × 100
         */
        calculateAnalysisRateByTrip(data) {
            if (!data || data.length === 0) return 0;

            const totalSet    = new Set();
            const analisadasSet = new Set();

            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;
                const cargaId = String(row.carga || row.ticket || '').trim();
                if (!cargaId) return;

                totalSet.add(cargaId);

                const val = row.analisado;
                const isAnalysed = val === true || val === 'SIM' || val === 'S' || val === 1 ||
                                   val === '1' || val === '1,00' ||
                                   (typeof val === 'string' && val.toUpperCase().includes('ANALISADO'));
                if (isAnalysed) analisadasSet.add(cargaId);
            });

            const taxa = totalSet.size > 0
                ? Math.min(100, (analisadasSet.size / totalSet.size) * 100)
                : 0;
            return parseFloat(taxa.toFixed(2));
        }

        /**
         * TAXA DE ANÁLISE POR LIBERAÇÃO: agrupada por libera/liberacao
         * Retorna { liberacaoId: { totalCargas, analisadas, taxa } }
         */
        calculateAnalysisRateByLiberacao(data) {
            if (!data || data.length === 0) return {};

            const libMap = new Map();

            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;
                const cargaId = String(row.carga || row.ticket || '').trim();
                if (!cargaId) return;

                const libId = String(row.liberacao || row.libera || row.Liberacao || row['Cod. Frente'] || '').trim();
                if (!libId) return;

                if (!libMap.has(libId)) libMap.set(libId, { total: new Set(), sim: new Set() });
                const lib = libMap.get(libId);
                lib.total.add(cargaId);

                const val = row.analisado;
                const isAnalysed = val === true || val === 'SIM' || val === 'S' || val === 1 ||
                                   (typeof val === 'string' && val.toUpperCase().includes('ANALISADO'));
                if (isAnalysed) lib.sim.add(cargaId);
            });

            const result = {};
            libMap.forEach((v, k) => {
                const total    = v.total.size;
                const analis   = v.sim.size;
                const taxa     = total > 0 ? Math.min(100, Math.round((analis / total) * 100)) : 0;
                result[k] = { totalCargas: total, analisadas: analis, taxa };
            });
            return result;
        }

        // --- MÉTODOS DE APOIO ORIGINAIS ---

        countUniqueTrips(data) {
            const uniqueTrips = new Set();
            const uniqueProprias = new Set();
            const uniqueTerceiros = new Set();
            // Frota Registrada: unique caminhões com prefixo 31 (próprio) ou 91 (terceiro)
            // conforme coluna "Frota Motriz" da produção
            const uniqueFrotaPropria   = new Set(); // prefixo 31
            const uniqueFrotaTerceira  = new Set(); // prefixo 91
            
            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;
                const vId = row.viagem || row.idViagem;
                if (!vId) return;
                
                const idStr = String(vId).trim();
                uniqueTrips.add(idStr);
                
                if (this.analyzer.isPropria(row)) uniqueProprias.add(idStr);
                else uniqueTerceiros.add(idStr);

                // Conta frotas motriz distintas (somente 31xxx e 91xxx)
                const frota = String(row.frota || '').trim();
                if (frota && frota !== '0') {
                    if (frota.startsWith('31')) uniqueFrotaPropria.add(frota);
                    else if (frota.startsWith('91')) uniqueFrotaTerceira.add(frota);
                }
            });

            const frotaRegistrada = uniqueFrotaPropria.size + uniqueFrotaTerceira.size;
            
            return {
                total: uniqueTrips.size,
                proprias: uniqueProprias.size,
                terceiros: uniqueTerceiros.size,
                frotaMotrizDistinta: frotaRegistrada,
                frotaRegistradaPropria: uniqueFrotaPropria.size,
                frotaRegistradaTerceira: uniqueFrotaTerceira.size
            };
        }

        calculateTotalWeightComplete(data) {
            let total = 0;
            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;
                total += parseFloat(row.peso) || 0;
            });
            return total;
        }

        analyzeFleetDistributionComplete(data) {
            let p = 0, t = 0;
            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;
                const peso = parseFloat(row.peso) || 0;
                
                if (this.analyzer.isPropria(row)) p += peso;
                else t += peso;
            });
            return { propria: p, terceiros: t };
        }
        
        getEquipmentDistribution(data) {
             let propria = 0;
             let terceiros = 0;
             
             data.forEach(row => {
                 const peso = parseFloat(row.peso) || 0;
                 if (peso <= 0) return;

                 if (this.analyzer.isPropria(row)) propria += peso;
                 else terceiros += peso;
             });
             
             return { propria, terceiros };
        }

        /**
         * Análise de Tipo de Proprietário (Própria vs Fornecedor)
         * 🔥 CORREÇÃO AQUI: Usa 'tipoProprietarioFa' mapeado do IntelligentProcessor
         * e adiciona fallback para Frota se o campo de texto estiver vazio.
         */
        analyzeOwnerType(data) {
            let propriaTons = 0;
            let fornecedorTons = 0;
            
            data.forEach(row => {
                if (this.analyzer.isAggregationRow(row)) return;

                const peso = parseFloat(row.peso) || 0;
                
                // 1. Tenta identificar pelo texto da coluna "Tipo Proprietario (F.A.)"
                // O IntelligentProcessor mapeia essa coluna para 'tipoProprietarioFa'
                const tipoProp = (row.tipoProprietarioFa || row.dscTipoPropriedade || '').toUpperCase().trim();
                
                // Verifica se existe texto válido na coluna
                if (tipoProp.length > 0) {
                    if (tipoProp.includes('FORNECEDOR') || tipoProp.includes('PARCERIA') || tipoProp.includes('TERCEIRO') || tipoProp.includes('FRETISTA')) {
                        fornecedorTons += peso;
                    } else {
                        // Assume Própria para "ARRENDAMENTO", "PROPRIA", "AGRICOLA", etc.
                        propriaTons += peso;
                    }
                } 
                else {
                    // 2. Fallback de Segurança: Se a coluna de texto estiver vazia,
                    // usa a lógica de prefixo de frota (isTerceiro / isPropria) definida no DataAnalyzer
                    if (this.analyzer.isTerceiro(row)) {
                        fornecedorTons += peso;
                    } else {
                        propriaTons += peso;
                    }
                }
            });

            const total = propriaTons + fornecedorTons;
            
            return {
                propria: propriaTons,
                fornecedor: fornecedorTons,
                total: total,
                propriaPercent: total > 0 ? (propriaTons / total) * 100 : 0,
                fornecedorPercent: total > 0 ? (fornecedorTons / total) * 100 : 0,
            };
        }

        calculateLastTripAverage(data) {
            const tripWeights = [];
            const uniqueTrips = new Set();
            
            for (let i = data.length - 1; i >= 0 && tripWeights.length < 3; i--) {
                const row = data[i];
                const v = row.viagem || row.idViagem;
                const peso = parseFloat(row.peso) || 0;
                
                if (peso > 0 && v && !this.analyzer.isAggregationRow(row)) {
                    if (!uniqueTrips.has(v)) { 
                        tripWeights.push(peso); 
                        uniqueTrips.add(v); 
                    }
                }
            }
            
            const sum = tripWeights.reduce((a, b) => a + b, 0);
            return { average: tripWeights.length > 0 ? sum / tripWeights.length : 0, count: tripWeights.length };
        }
    }
    
    window.DataAnalyzerKPIs = DataAnalyzerKPIs;
}