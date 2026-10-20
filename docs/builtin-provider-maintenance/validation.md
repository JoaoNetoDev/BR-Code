# Validação de configuração e colaboração humana

## Camadas de validação

| Camada             | O que comprova                                              | O que não comprova                                       |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Material oficial   | Modelos, protocolos, parâmetros e ciclo de vida declarados  | Se ficam realmente disponíveis na conta/região/plano indicado |
| Decoder/Schema     | Estrutura do arquivo, campos e legalidade das faixas de valor | Que cada modelo fique completo no final e que o remoto aceite esses parâmetros |
| Testes de Resolver/Map | Ordem de cobertura, execução completa da configuração, mapeamento de parâmetros | Que o fornecedor realmente aceite as requisições |
| HTTP/replay local  | Codificação da requisição, consumo do stream, ciclo do tool e fiação da configuração | O endpoint público atual, as permissões da Key e o comportamento real do modelo |
| API real           | O resultado medido nesta entrada, modelo, protocolo e conta   | Outros planos, regiões, protocolos ou a disponibilidade futura |
| E2E de produto/validação de pacote | Da configuração na UI até a cadeia de execução alvo e os recursos reais | Que todos os fornecedores e plataformas passem |

Toda camada registra escopo e data. Não se pode registrar `GET /models` bem-sucedido, SDK criável ou um teste de conexão bem-sucedido como suporte completo do Agent.

## Handoff manual para obter API Key

Primeiro conclua o material, a spec, os testes e o diff candidato que não dependem de credenciais; só então apresente ao colaborador uma requisição executável: fornecedor, produto/região específica, lista de modelos, Key de API comum ou de plano, permissões necessárias, número estimado de requisições, custo máximo e uso pretendido dos dados de teste. Novas assinaturas, recargas e aumentos de limite são confirmados por uma pessoa; não é permitido ampliar o consumo por conta própria para uma "validação completa".

O colaborador ativa o produto correspondente no console oficial, confirma as permissões de modelo e o saldo, e entrega por meio de gerenciamento de Secret aprovado ou configuração local restrita. Quando forem necessárias variáveis de ambiente, registre apenas o nome da variável, para que o processo a leia; não grave a Key em argumentos de comando, chat, Git, MR, capturas de tela ou logs. Prefira Keys temporárias com o menor privilégio possível e revogáveis; ao fim da validação, revogue-as ou devolva a gestão conforme combinado com o colaborador.

O ambiente de teste não fornece Keys gratuitas automaticamente: o template comum do JSON de teste atual ainda usa o endereço do fornecedor em produção. API Key, Coding Plan/Token Plan Key e benefícios de login via web não podem ser misturados; mesmo entre produtos da mesma marca, confirme cada um separadamente. Permissão insuficiente, saldo insuficiente, região não suportada, limitação de taxa, falha de serviço e erro de parâmetro são registrados separadamente; não atribua tudo a "modelo incompatível".

Esta rodada de organização documental não solicitou nem obteve essas Keys; cada novo item observado ainda exige esse handoff. Quando não for possível obter uma Key no futuro, pode-se preparar um MR com bloqueio explícito; não é permitido inventar registro de aprovação, ampliar o escopo de uma validação já feita nem fazer rollout dinâmico por conta própria.

## Matriz mínima de requisições reais

Recorte conforme o escopo da mudança. Confirme um a um que o ID dos membros novos/alterados é chamável; cubra um a um as diferenças de parâmetros e de protocolo, sem usar um único modelo de flagship para representar a marca inteira.

| Cenário            | O que verificar                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Conexão e fluxo básico | URL/protocolo/Header reais, identidade do modelo; término normal do stream, usage e razão de fim; erros no meio do caminho não contam como sucesso |
| Ciclo de tools     | Tool declarado → montagem em streaming dos parâmetros → devolução do resultado da tool → continuação da resposta; ID da tool e ordem das mensagens corretos |
| Níveis de raciocínio | Para cada `values` público, o Body final do Map, em especial desligado/mínimo/máximo e nos modelos que não suportam desligar |
| Limites de saída   | Limite e orçamento explícito validados separadamente, valores inválidos falham de forma explícita; sem truncamento silencioso nem retry disfarçado com orçamento ampliado |
| Mídia e estruturado | Validar separadamente as imagens, vídeos, áudios, PDF e JSON Schema declarados/ajustados nesta rodada; marcar o que não foi testado |
| Sistema e histórico | Ao envolver MCS, histórico de raciocínio, conteúdo criptografado ou novo protocolo, verificar o replay de múltiplas rodadas, as rodadas seguintes a tools e o tratamento de mensagens de sistema |
| Variantes adjacentes | Modelo base/Flash/FlashX/visão/prefixo-sufixo de agregação; confirmar que as regras não se misturam |
| Configuração do usuário | Renovação de valores herdados, preservação de sobrescritas pessoais explícitas, ativação/desativação padrão, endereço/nome de instâncias existentes e seleção salva |

Use prompts mínimos e anexos de teste sem informações pessoais. Testes de pressão de contexto de um milhão e de saída máxima exigem orçamento separado; não envie requisições com a capacidade cheia por padrão só para validar valores de configuração. O smoke comum não declara cobertura do limite superior de capacidade. Latência ao vivo e flutuação de limitação de taxa são registradas como observação, para evitar que um sleep aleatório mascare problemas de configuração.

A detecção de conexão do produto só prova os passos de conexão que ela realmente executou e não equivale automaticamente à matriz acima. Ao ajustar o orçamento da detecção, primeiro confira no código atual os valores, o caminho da requisição e o critério de sucesso, registre neste diretório o comportamento que se pretende mudar e acrescente regressão; não trate valores sugeridos no passado como fato atual.

## Entradas de verificação no repositório

Os comandos abaixo são executados a partir da raiz do repositório. Selecione os arquivos conforme o escopo desta mudança e não rode a suíte completa de testes unitários sem autorização:

```bash
pnpm provider:config:check-test
pnpm exec vitest run packages/provider-node/test/zcode-builtin-integrity.test.ts
pnpm exec vitest run packages/provider/test/model-config-rules.test.ts packages/provider/test/provider-template.test.ts
pnpm exec vitest run packages/provider-node/test/zcode-builtin-reasoning-map.test.ts
```

Há também testes de referência: `packages/provider-node/test/new-model-catalog*.test.ts`, `opencode-go.test.ts`, `openrouter-reasoning-contract.test.ts`, `zhipu-api-templates.test.ts`; acrescente casos conforme os novos limites desta mudança, em vez de apenas alterar snapshots para fazer a falha sumir.

O teste de integridade final de arquivos suporta `ZCODE_BUILTIN_RELEASE_TEST_FILE` para indicar o arquivo real; valide separadamente a configuração de produção e a configuração de teste gerada. Exemplo em shell POSIX:

```bash
ZCODE_BUILTIN_RELEASE_TEST_FILE="$PWD/config/provider/zcode-builtin.test.json" pnpm exec vitest run packages/provider-node/test/zcode-builtin-integrity.test.ts
```

Outros shells usam a forma de definição da variável de ambiente correspondente, mantendo o valor da variável como o caminho absoluto real. Este teste contém as asserções de negócio do diretório atual; não é um teste de compatibilidade genérico para qualquer Release antigo, e as asserções não devem ser afrouxadas só para aceitar arquivos históricos.

Mudanças de código comuns executam `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` e `pnpm test:unit:affected --base <commit inicial>`. Código do CLI executa ainda `pnpm --dir apps/zcode-cli typecheck` e `pnpm --dir apps/zcode-cli lint`, e usa os scripts do pacote/Turbo para selecionar os testes dos pacotes afetados e de seus chamadores; os testes unitários affected da raiz não substituem os testes do CLI. Quando o escopo do CLI não puder ser determinado com segurança ou quando a infraestrutura de testes públicos for alterada, execute `pnpm --dir apps/zcode-cli test`.

Mudanças de interação no APP recebem primeiro o cenário de E2E desktop, e só então a implementação; cubra instância nova, herança de instância existente, preservação de sobrescrita explícita, seleção de modelo e cadeia de execução real, acrescentando o caminho mobile conforme o impacto. Cenário, spec e caso de teste devem permanecer coerentes; a verificação usa `pnpm test:e2e` com o escopo escolhido conforme as specs realmente afetadas, sem tomar a aprovação de um fixture HTTP local como verificação do fornecedor na internet pública. Mudanças visuais exigem ainda verificações de desktop/mobile, temas claro/escuro e dos idiomas pertinentes. Quando faltar ambiente, liste as combinações não verificadas, sem escrevê-las como tudo aprovado.

Mudanças na estratégia de build de dois ambientes ou de geração também devem cobrir `packages/provider-node/test/builtin-provider-build.test.ts`, `builtin-provider-test-config-sync.test.ts` e os testes dos scripts correspondentes em `scripts/test/`. Use Releases temporários com conteúdos diferentes para validar a prioridade entre ambientes, arquivo ausente/inválido, atualização de conteúdo no mesmo ambiente, renovação de recursos quando já existe JS, SEA e o conteúdo final embutido. Decodifique os dois JSON reais separadamente; não exija chamada a um modelo tarifado para validar o build.

Alterações puramente documentais verificam apenas links, comandos, referências e consistência. Quando uma verificação necessária falhar ou o ambiente bloquear, preserve as alterações e as evidências, sem commitar automaticamente; após aprovado, revise o diff você mesmo e faça o commit do conteúdo desta rodada. O Push mantém o gate `pnpm verify:pre-push`, sem contornar o hook; não rode a suíte completa de testes unitários da raiz sem pedido explícito.

## Retenção de evidências

Registre hora, commit, produção/teste, revision/hash da configuração, templateId/modelId/protocolo, produto e região da conta (sem identidade pessoal), casos de uso e o resultado aprovado/reprovado/não executado. As evidências de requisição/resposta preservam parâmetros anonimizados, código de status, razão de término e os logs necessários; limpe Authorization, Cookie, Key, query de URL assinada, prompts privados e o corpo do raciocínio. Quando precisar fazer replay, verifique primeiro quais campos o coletor realmente salvou, depois anonimize, faça a revisão manual e valide a reprodutibilidade; é proibido enviar diretamente capturas de rede brutas.

O registro de validação de uma entrada não pode ser reutilizado como conclusão de aprovação de outro plano ou de outro site agregador. Em caso de falha, preserve primeiro a reprodução mínima e o log de execução, diferencie problema de regra, de Adapter, de permissão e de upstream, e só então decida se é correção de configuração ou se é preciso mudar o design.
