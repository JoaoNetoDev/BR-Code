# Telemetria do banner de erro do chat (migração V4 pendente)

Atualmente, `chatErrorBannerTelemetry.ts` tem apenas helper/testes, sem nenhum ponto de chamada em produção na V4; a exposição do banner de erro, o clique no CTA e o dismiss não podem ser considerados já reportados.

Na reconexão, deve-se usar o fingerprint de erro da V4 e o ciclo de vida do pane para deduplicar, proibindo envios repetidos conforme o número de renders, e validar sob os dois perfis de entrega, desktop e mobile. Antes de concluir a ligação em produção, o painel de monitoramento precisa marcar esses dados como ausentes.