# Pesquisa sobre Provider

Research guarda os fatos de código que sustentam o desenho e as decisões de implementação. Ele não define a
arquitetura-alvo; conforme o código evolui, cada pesquisa deve preservar a data da investigação e o escopo de
aplicabilidade.

| Tema | Estado | Uso |
| --- | --- | --- |
| [`todo154-start-plan-independence-impact.md`](./todo154-start-plan-independence-impact.md) | Arquivo da investigação pré-implementação; nova implementação e verificação vão para Todo154 §8 | Registra as restrições de current/autenticação, as diferenças de Session/escrita de volta de rascunho e de configuração independente, a correção I27 e o ponto de entrada recomendado de submissão, sustentando o Todo154 |
| [`builtin-online-release-review-2026-09-11.md`](./builtin-online-release-review-2026-09-11.md) | Pesquisa concluída, correções pendentes | Medição real dos campos de CDN em produção, estagnação da atualização Standalone, reprodução do timeout do corpo da mensagem, revisão de cache/versão/eficácia em cada ponta; a implementação vai para Todo117 |
| [`embedded-search-provider-dependency.md`](./embedded-search-provider-dependency.md) | Pesquisa concluída | Prova que a dependência de Provider Connection do Embedded Search pode ser removida |
| [`reasoning-config-to-wire.md`](./reasoning-config-to-wire.md) | Pesquisa concluída, migração não implementada | Reconstrói o mapeamento completo do estado atual entre reasoning level, provider options e os campos finais da requisição |
| [`m2-registry-aggregation-and-refresh.md`](./m2-registry-aggregation-and-refresh.md) | Pesquisa do estado histórico; as conclusões já entraram em Design/M2, pendências em Cleanup | Reconstrói, antes do M2, a construção, o push, o cache e o refresh do Registry no Host, Core Worker e Renderer |
| [`account-provider-facts-and-auth.md`](./account-provider-facts-and-auth.md) | Pesquisa do estado histórico; a fronteira de Account já foi decidida e implementada | Distingue a configuração estática do Plan, o escopo de acesso da conta e a autenticação da requisição, e localiza a identidade de acesso de conta que o Model precisa fixar |
| [`legacy-model-provider-service-call-map.md`](./legacy-model-provider-service-call-map.md) | Superfície de chamadas histórica; os principais consumidores já migraram, pendências em M2 Cleanup | Classifica os métodos antigos de IModelProviderService por Settings, Selection, Account, Connectivity e Worker Bridge |
| [`provider-config-schema-and-builtin-glm-draft.md`](./provider-config-schema-and-builtin-glm-draft.md) | Rascunho de design histórico; a estrutura de configuração já entrou em Design | Reúne as duas dimensões de acesso/api do Provider, o Account Access Overlay, os diversos Builtin Providers e a configuração de protocolo de GLM-5.2, GLM-5.3 e GLM-5-Turbo |

Ao ler nomes candidatos e julgamentos históricos em uma pesquisa, prevaleça o "destino da conclusão" no início do
documento; o alvo válido atual é sempre mantido por [`../design/design.md`](../design/design.md).
