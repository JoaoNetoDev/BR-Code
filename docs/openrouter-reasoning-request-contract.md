# Correção dos parâmetros de reasoning em OpenRouter Messages

## Escopo e embasamento

2026-09-14: o teste de conexão do GLM-5.3 no Air envia `thinking.type=enabled`, mas sem
`thinking.budget_tokens`, e isso é rejeitado pela validação de requisições Messages do
OpenRouter (400).
Com o mesmo prompt, Key e modelo, usando `adaptive + output_config.effort=low`, a resposta foi
200 e completou por inteiro.

- [OpenRouter Messages API](https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message):
  `enabled` deve carregar um `budget_tokens` inteiro; `adaptive` não exige orçamento.
- [Notas de migração do Claude 4.6 no OpenRouter](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-4-6):
  adaptive e o modo com orçamento são mecanismos distintos; não se pode substituir adaptive por
  enabled sem orçamento.

## Decisões

- Corrigir somente o mapeamento equivalente para GLM, DeepSeek, Kimi K2, Qwen e MiMo no
  OpenRouter Messages.
  Os Maps de compatibilidade do fabricante desses modelos produzem enabled sem orçamento; isso
  não pode ser aplicado diretamente ao OpenRouter.
- Usar regras específicas por site: o nível desligado envia `thinking.type=disabled`; nos
  demais casos usa-se adaptive, passando o effort como veio e mapeando o nível booleano
  ligado `enabled` para `high`. Não se adiciona nenhum orçamento fixo arbitrário.
- Preservar os valores de nível existentes, os limites de saída, os membros de modelo, a
  ativação/desativação e as demais capacidades; os mapeamentos dedicados já existentes para
  GPT, Claude, Kimi K3 etc. não mudam. Nesta rodada não se redesenha a antiga estratégia de
  orçamento dos modelos Claude antigos.
- As regras só casam `https://openrouter.ai/api`, com `/v1` opcional e barra final opcional, e
  a API precisa ser `anthropic-messages`. Funcionam igualmente para Providers auto-hospedados,
  sem depender de Provider ID/ID de template.
- Não alterar outros sites, Chat/Responses, Maps pessoais ou configurações manuais fixas, nem
  fazer migração de dados. Não adicionar ramificação por nome de modelo no Runtime. Desktop e
  remoto reutilizam a mesma cadeia de resolução de configuração, sem novo estado ou protocolo.
- O Fable já usa adaptive; o 403 local vem claramente de restrição de região e não é
  contornado alterando o Map.

## Aceitação

- Analisar a configuração completa e válida a partir do JSON publicado, enumerando todos os
  modelos e níveis legítimos dos templates do OpenRouter: não é permitido enabled sem
  orçamento válido; desligado não pode virar ligado.
- Afirmar explicitamente adaptive + effort para os modelos afetados; verificar que os demais
  sites/APIs e as sobrescritas Personal permanecem inalterados.
- Preservar a verificação de wire do Map após serialização pelo SDK real e as asserções de
  compatibilidade com limite de saída baixo (1 token).
- Não registrar modelos restritos por região como se tivessem passado em uma chamada real; não
  publicar automaticamente configuração remota nem modificar a configuração do usuário.

## Registro de verificação (2026-09-14)

- Antes da alteração, os novos testes de configuração falhavam em 12 itens e passavam em 2;
  após a correção, os 14 passaram.
- 133 itens passaram em 7 arquivos relacionados a configuração, catálogo, Maps históricos,
  formatação e estrutura de publicação.
- 88 itens passaram na verificação de wire de novos modelos do SDK real e na segunda leva de
  wire do catálogo; foram adicionados 8 casos do OpenRouter cobrindo cinco classes de modelo e
  o nível desligado. Apenas o tráfego de rede foi interceptado; um 200 com mock não prova
  suporte do servidor.
- Typecheck, formatação e verificação de arquitetura passaram; Lint com 0 erros e 42 avisos
  já existentes.
- Conexão direta do Air ao OpenRouter, com a forma de requisição resolvida a partir da
  configuração publicada acima e o mesmo prompt do teste de conexão, `low`,
  `max_tokens=1000`; ambas as vezes HTTP 200, `end_turn`, `message_stop`:

| Modelo | OpenRouter generation ID |
| --- | --- |
| z-ai/glm-5.3-flash | gen-1789366855-73w0bfyOBz3ELtvUBygJ |
| deepseek/deepseek-v4.1-flash | gen-1789366855-gFYWCQboaRXqxM9q5QkH |

O controle anterior do GLM-5.3 com adaptive também completou com sucesso:
`gen-1789365468-l1GzIrS9atlIn0WGWZsj`.
Os demais modelos não foram requisitados individualmente online; a restrição de região do
Fable continua. Nenhum pacote novo foi instalado, a configuração pessoal do Air não foi
alterada e nenhuma configuração online foi publicada.