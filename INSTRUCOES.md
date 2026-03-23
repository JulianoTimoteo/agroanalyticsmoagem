# AgroAnalytics v6.8 — Instruções de Setup

## SETUP INICIAL NO GAS (executar uma única vez)

A forma mais simples é rodar **apenas uma função**:

```
iniciarMigracaoAutomatica()
```

Isso instala um trigger de 1 minuto que executa automaticamente todos os passos:
1. `inicializarFirestore()` — produção últimas 48h
2. `migrarPlanilhasFixas()` — AcmSafra, Potencial, ColConAcm, ColConD1, Metas
3. `migrarTPL()` em chunks — TPL dos 2 últimos meses (para OEE)

Acompanhe pelo **Log de Execução** do Apps Script. Quando aparecer:
```
🎉 MIGRAÇÃO AUTOMÁTICA CONCLUÍDA! Trigger de 1min removido.
```
O dashboard está pronto.

---

## SETUP MANUAL (alternativa)

Execute em ordem:

```
instalarTriggers()         ← triggers automáticos (10min + 5h)
inicializarFirestore()     ← produção últimas 48h
migrarPlanilhasFixas()     ← tabelas fixas
migrarTPL()                ← repita até ver "Migração TPL CONCLUÍDA!"
```

---

## TRIGGERS AUTOMÁTICOS (após setup)

- `atualizarProducao()` — a cada 10min (incremental, ~2s)
- `aquecer()` — 1x ao dia às 5h (re-sincroniza tudo)

---

## CACHE OFFLINE (PWA)

Após o primeiro carregamento com dados:
1. Vá em **Gerenciar → Cache Offline**
2. Clique **"Baixar Snapshot JSON"**
3. Salve o arquivo no dispositivo

Na próxima abertura sem internet, importe o snapshot e o dashboard carrega com os dados salvos.

---

## RESOLUÇÃO DE PROBLEMAS

| Problema | Solução |
|----------|---------|
| `rows: []` no Firestore | Execute `resetarContadores()` depois `inicializarFirestore()` |
| OEE mostra N/D | Execute `migrarTPL()` até concluir |
| Dados zerados ao trocar tema | Atualizado no v6.8 — fixo |
| 30/12/1899 nos gráficos | Atualizado no v6.8 — fixo |
| Migração travada | Execute `resetarMigracaoTPL()` depois `migrarTPL()` |
