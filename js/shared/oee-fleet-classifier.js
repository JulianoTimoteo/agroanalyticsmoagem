// oee-fleet-classifier.js
// ============================================================
// MÓDULO CENTRALIZADOR DE CLASSIFICAÇÃO DE FROTA E EQUIPAMENTO
// Fonte de verdade única para regras de prefixo.
// Toda alteração de regra deve ser feita AQUI — nunca espalhada.
//
// REGRAS VALIDADAS CONTRA Producao.xlsx e TPL.csv (agosto/2025):
//   Colhedora Própria  : prefixo "80" (ex: 80222, 80419)
//   Colhedora Terceira : prefixo "93" (ex: 93019, 93057)
//   Caminhão Próprio   : prefixo "31" (ex: 31325, 311025)
//   Caminhão Terceiro  : prefixo "91" (ex: 91275, 91281)
//
// NOTA: O campo "Dsc. Tipo Prop. Frota" (→ dscTipoPropFrota) é a
//       fonte primária. Prefixo é fallback auditável.
// ============================================================

if (typeof OEEFleetClassifier === 'undefined') {

    class OEEFleetClassifier {

        // ── CONSTANTES PÚBLICAS ──────────────────────────────────
        static COLHEDORA_PROPRIA_PREFIXES  = ['80', '81', '82', '83', '84', '85'];
        static COLHEDORA_TERCEIRA_PREFIXES = ['93', '94', '95'];
        static CAMINHAO_PROPRIO_PREFIXES   = ['31'];
        static CAMINHAO_TERCEIRO_PREFIXES  = ['91'];

        // Estados no TPL
        static TPL_STATE_MAP = {
            'M': 'manutencao',   // Manutenção mecânica
            'F': 'parado',       // Funcional parado / improdutivo
            'E': 'executando',   // Executando operação produtiva
            'D': 'deslocamento'  // Auto deslocamento
        };

        // Grupos de operação do TPL mapeados para categorias OEE
        static TPL_OP_GROUPS = {
            produtivo: [
                'Corte Mecanizado De Cana Crua',
                'Corte Mecanizado De Cana Queimada',
                'Colheita'
            ],
            parada_operacional: [
                'Aguardando Caminhão', 'Aguardando Carregamento',
                'Aguardando Transbordo', 'Aguardando Ordem',
                'Aguardando Liberação de Área', 'Aguardando Manobra Transbordo',
                'Troca De Turno', 'Abastecimento', 'Abastecimento de insumos',
                'Aguardando Comboio', 'Aguardando Eletrecista'
            ],
            parada_mecanica: [
                'Manutencao Mecanica', 'Manutenção Mecânica',
                'Manutencao Mecanica Terceiros', 'Aguardando Mecanico',
                'Aguardando Mecanico Terceiros', 'Aguardando Pecas',
                'Aguardando Manutenção Borracharia', 'Aguardando Manutencao Implemento',
                'Manutenção Elétrica', 'Borracharia'
            ],
            improdutivo: [
                'Equipamento Inativo', 'Patio De Tratores', 'Pátio Oficina',
                'Sem Apontamento', 'Sem Operacao', 'Indeterminado',
                'Condicoes Climaticas'
            ],
            deslocamento: [
                'Auto Deslocamento', 'Deslocamento', 'Mudanca De Area C Prancha',
                'Engate Ou Desengate De Reboque'
            ]
        };

        // ── IDENTIFICAÇÃO DE TIPO ────────────────────────────────

        /**
         * Classifica uma linha da base de produção.
         * Retorna: 'colh_propria' | 'colh_terceira' | 'cam_proprio' | 'cam_terceiro' | 'desconhecido'
         */
        static classifyProductionRow(row) {
            // 1. Prioridade: campo textual de tipo de frota
            const dscFrota = (row.dscTipoPropFrota || row.tipoFrota || '').toUpperCase().trim();
            const dscProp  = (row.tipoProprietarioFa || row.dscTipoPropriedade || '').toUpperCase().trim();

            const frota = String(row.frota || '').trim();
            const equip = String(row.equipamento ||
                (Array.isArray(row.equipamentos) && row.equipamentos[0]) || '').trim();

            // 2. Detecta caminhão pela frota
            if (this._startsWithAny(frota, this.CAMINHAO_PROPRIO_PREFIXES)) return 'cam_proprio';
            if (this._startsWithAny(frota, this.CAMINHAO_TERCEIRO_PREFIXES)) return 'cam_terceiro';

            // 3. Detecta colhedora pelo equipamento
            if (this._startsWithAny(equip, this.COLHEDORA_PROPRIA_PREFIXES))  return 'colh_propria';
            if (this._startsWithAny(equip, this.COLHEDORA_TERCEIRA_PREFIXES)) return 'colh_terceira';

            // 4. Fallback pelo texto do campo de propriedade
            if (dscFrota === 'PROPRIO' || dscProp === 'PROPRIA' ||
                dscProp.includes('ARRENDAMENTO') || dscProp.includes('PRÓPRIA')) {
                // Sem prefixo de colhedora → trata como caminhão próprio
                return 'cam_proprio';
            }
            if (dscFrota === 'TERCEIROS' || dscFrota === 'FRETISTA' ||
                dscProp.includes('FORNECEDOR') || dscProp.includes('TERCEIRO') ||
                dscProp.includes('FRETISTA')) {
                return 'cam_terceiro';
            }

            return 'desconhecido';
        }

        /**
         * Classifica um registro do TPL pelo código de equipamento.
         */
        static classifyTPLRow(codEquipamento) {
            const cod = String(codEquipamento || '').trim();
            if (this._startsWithAny(cod, this.COLHEDORA_PROPRIA_PREFIXES))  return 'colh_propria';
            if (this._startsWithAny(cod, this.COLHEDORA_TERCEIRA_PREFIXES)) return 'colh_terceira';
            if (this._startsWithAny(cod, this.CAMINHAO_PROPRIO_PREFIXES))   return 'cam_proprio';
            if (this._startsWithAny(cod, this.CAMINHAO_TERCEIRO_PREFIXES))  return 'cam_terceiro';
            return 'outro';
        }

        /** Verifica se é colhedora (qualquer propriedade) */
        static isColhedora(codEquipamento) {
            const cod = String(codEquipamento || '').trim();
            return this._startsWithAny(cod, [
                ...this.COLHEDORA_PROPRIA_PREFIXES,
                ...this.COLHEDORA_TERCEIRA_PREFIXES
            ]);
        }

        /** Verifica se é caminhão (qualquer propriedade) */
        static isCaminhao(frota) {
            const cod = String(frota || '').trim();
            return this._startsWithAny(cod, [
                ...this.CAMINHAO_PROPRIO_PREFIXES,
                ...this.CAMINHAO_TERCEIRO_PREFIXES
            ]);
        }

        /**
         * Classifica operação do TPL em categoria OEE.
         * Retorna: 'produtivo' | 'parada_operacional' | 'parada_mecanica' | 'improdutivo' | 'deslocamento' | 'outro'
         */
        static classifyTPLOperation(descOperacao) {
            const desc = (descOperacao || '').trim();
            for (const [cat, ops] of Object.entries(this.TPL_OP_GROUPS)) {
                if (ops.some(op => desc.toLowerCase().includes(op.toLowerCase()))) return cat;
            }
            return 'outro';
        }

        /**
         * Detecta conflito de prefixo vs campo textual.
         * Retorna: { conflict: bool, message: string }
         */
        static detectPrefixConflict(row) {
            const frota = String(row.frota || '').trim();
            const dscFrota = (row.dscTipoPropFrota || '').toUpperCase().trim();
            if (!frota || !dscFrota) return { conflict: false, message: '' };

            const isPrefixProprio  = this._startsWithAny(frota, this.CAMINHAO_PROPRIO_PREFIXES);
            const isPrefixTerceiro = this._startsWithAny(frota, this.CAMINHAO_TERCEIRO_PREFIXES);
            const isTextoProprio   = dscFrota === 'PROPRIO';
            const isTextoTerceiro  = ['TERCEIROS','FRETISTA'].includes(dscFrota);

            if (isPrefixProprio && isTextoTerceiro) {
                return { conflict: true, message: `Frota ${frota}: prefixo indica PRÓPRIA mas campo texto diz TERCEIROS` };
            }
            if (isPrefixTerceiro && isTextoProprio) {
                return { conflict: true, message: `Frota ${frota}: prefixo indica TERCEIRA mas campo texto diz PRÓPRIA` };
            }
            return { conflict: false, message: '' };
        }

        // ── HELPERS PRIVADOS ─────────────────────────────────────

        static _startsWithAny(str, prefixes) {
            return prefixes.some(p => str.startsWith(p));
        }
    }

    window.OEEFleetClassifier = OEEFleetClassifier;
    console.log('[OEEFleetClassifier] Registrado. Prefixos: colh_própria=80-85, colh_terceira=93-95, cam_próprio=31, cam_terceiro=91');
}
