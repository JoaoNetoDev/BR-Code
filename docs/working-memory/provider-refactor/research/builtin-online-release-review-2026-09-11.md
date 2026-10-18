# Revisão da cadeia de publicação online do Built-in (2026-09-11)

> Natureza: fatos de código e verificação em execução; esta rodada não modifica código de produto. O ponto de entrada da implementação é [Todo127](../steps/todo-127-builtin-online-release.md).
>
> Baseline: `af5843586b`, Builtin revision 19. A verificação de frescor apontou que o staging local está 5 commits atrás de origin/staging; os pontos de entrada de download de Provider, Provider Node e Services e as implementações relacionadas ao startup do CLI foram comparados e não há diferença em relação ao remoto. Esta rodada não substitui o merge do código mais recente; refazer a verificação antes de implementar.

## 1. Resumo

A base de transporte e cache tem valor de reuso, mas hoje não se pode tomar “isso já foi escrito antes” ou “o teste unitário antigo passou” como prova de que a publicação online é confiável. Foram confirmados três problemas: campo novo não conectado, atualização do Standalone sem efeito e expiração do timeout na leitura do corpo da resposta no App; a agendação de refresh e a aceitação de publicação também precisam ser completadas. Não há motivo para refazer a arquitetura de domínio do Provider nem para adicionar schema de persistência.

## 2.medição em produção

Requisição a `https://zcode.z.ai/api/v1/client/configs?app_version=3.12.0&platform=linux-x86_64`, HTTP 200, code de negócio 0:

```json
{
  "data": {
    "configs": {
      "builtin_provider_config_json": "https://cdn-zcode.z.ai/zcode/config/zcode-builtin.json"
    }
  }
}
```

Campos sem relação foram omitidos. O antigo `configs.zcodeBuiltin` não foi retornado. Passando a resposta real ao `decodeZCodeBuiltinClientConfigEnvelope` atual, o resultado é `null`.

O download no CDN retorna HTTP 200, `Content-Type: application/json`, `schemaVersion: 1`, `revision: 19`; o `decodeZCodeBuiltinRelease` oficial atual tem sucesso, com 17 templates e 8 Providers embutidos, e depois da normalização é idêntico ao arquivo do repositório. `Cache-Control: max-age=31104000`, ou seja, 360 dias. O usuário confirmou que cada publicação futura usará uma URL nova, sem sobrescrever a mesma URL; o cache longo em si não é o erro a corrigir.

Isto prova apenas que, em produção, aquela combinação de versão/plataforma retorna a URL correta; a requisição ao ambiente de teste falhou e sua configuração não ficou provada. Não foi verificado todo o roteamento versão/plataforma do servidor, e nenhum campo em produção, upload ou arquivo publicado foi alterado.

## 3. Cadeia existente

```text
App / Server Environment Host                 Standalone CLI 入口
  Services.fetchZCodeBuiltinRemoteRelease       fetchCliZCodeBuiltinRelease
                    \                         /
                 旧 configs.zcodeBuiltin 解码
                              |
                   RemoteSynchronizer
            共享控制文件 lease / TTL / 失败退避
                              |
             Source.applyRemoteRelease + 文件锁
              max revision / 同版本内容一致性
                              |
               原子替换 Active，通知配置变化
                              |
              ConfigService + Account Source
                              |
          Registry（两个来源的 Built-in 版本须一致）
                     /                    \
             设置 / 选模投影            ModelFactory
                                     新建执行使用新配置
```

O Worker gerenciado pelo Host recebe o mesmo caminho do arquivo Active por variável de ambiente e lê/observa o arquivo por conta própria; a Account é entregue pelo protocolo já existente. O Standalone busca a configuração remota por conta própria e deriva a Account a partir das credenciais. O celular se apoia no Host alvo e não baixa, armazena nem monta o Built-in de forma independente; SSH/WSL/Docker/Server mantêm a autoridade do Environment alvo.

## 4. Problemas confirmados e lacunas de implementação

### R1: campo novo não conectado; a resposta de produção é tratada como missing

- O decodificador de Envelope em `packages/provider-node/src/zcode-builtin-release.ts` só lê `zcodeBuiltin`.
- Tanto `packages/services/src/model-provider/zcodeBuiltinRemoteConfig.ts` quanto `apps/zcode-cli/packages/cli/src/provider-runtime-env.ts` pedem client/configs uma única vez e chamam esse decodificador, sem download da URL.
- Na medição real a resposta de produção decodifica como `null`; o Synchronizer trata missing como resultado normal, grava o próximo horário de refresh permitido e não reporta erro de rede.
- Obrigatório: os dois lados compartilham a resolução do campo novo, o download e a validação do Release. A ausência do campo pode manter o local; campo presente com tipo errado/URL inválida/falha de download ou de decodificação precisa ser distinguido da ausência normal.

### R2: o Built-in do Standalone mudou, mas a versão da Account não acompanha e o Registry mantém a antiga

- `apps/zcode-cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts:80` assina mudanças de credencial para reconstruir a Account, sem assinatura correspondente para mudança do Built-in.
- `packages/provider-node/src/provider-registry-runtime.ts:40` só monta na inicialização o snapshot fail-closed de uma Account ainda não inicializada.
- `packages/provider/src/registry-service.ts:204` exige explicitamente que o `basedOnZCodeBuiltinRevision` da Account seja igual ao da Config; quando não é, o Registry guarda a versão completa anterior. Essa checagem de consistência está correta e não deve ser removida só para a atualização passar a valer.
- Reprodução em execução: carregar um arquivo temporário com a revision real 19 e iniciar `NodeProviderRegistryRuntime`; atualizar apenas a revision do arquivo para 20, ler a Config e forçar o refresh do Registry. A Config fica em 20, mas Account e Registry seguem em 19 e o refresh devolve o snapshot antigo. O teste não depende de espera por timer nem de conta real e já prova o travamento da camada inferior; a lacuna de assinatura na montagem de produção do Standalone é confirmada pelo código.
- Corrida de inicialização semelhante: quando uma atualização do Built-in acontece entre a inicialização das credenciais e o download em background, o alinhamento da inicialização também precisa cobrir esse caso; não basta testar a atualização posterior à inicialização.
- Direção de correção: o Standalone reconstrói a Account serialmente diante de mudanças de Built-in e de credenciais no mesmo ciclo de vida, a partir das credenciais reais e atuais; se o resultado estiver expirado, recalcula. Também é preciso gerar o snapshot fail-closed baseado no novo Built-in quando não há conta. Não se pode fingir uma nova análise apenas bumpando a revision de uma Account antiga, nem refazer o protocolo de login.

### R3: o timeout pedido pelo App não cobre a leitura do corpo

- `packages/services/src/providers/api/nodeApiClient.ts:168` limpa o timeout interno depois que `fetch()` devolve a Response; só então `readApiJson` executa `response.json()`.
- Reprodução com serviço HTTP local: enviar os cabeçalhos imediatamente e encerrar o corpo JSON 220ms depois, com `timeoutMs: 40`; a leitura tem sucesso cerca de 228ms depois, em vez de estourar o timeout. Isso mostra que a fase de corpo perdeu a proteção.
- O `AbortSignal.timeout(15000)` atual do CLI ainda está associado ao corpo da Response; não se pode misturar o comportamento do App com o do CLI.
- Depois que a cadeia de URL ganhar uma segunda requisição, é recomendável que esta funcionalidade mantenha explicitamente no limite de download compartilhado um sinal de cancelamento/timeout que atravesse o consumo do body da resposta, além de limitar o tamanho do download. Todo o orçamento de fetch precisa casar com o lease de 30s; não se deve somar dois 15s completos mais uma leitura de corpo sem limite.
- Não usar isso como desculpa para refatorar todas as chamadas de ApiClient; a prioridade é a correção mínima no caminho de download do Built-in, e uma correção genérica fica para avaliação de impacto à parte.

### R4: TTL e backoff não são agendamento automático, e sucesso não quer dizer Registry já aplicado

- `NodeProviderConfigRuntime.start()` dispara apenas um refresh em background; a página de configurações dispara o refresh forçado via `useModelProviders → ProviderSettingsService → refreshSources`.
- O `prepareCliProviderRuntimeEnv` do Standalone também é um único refresh em background, disposing Source/Synchronizer ao terminar; não se pode dizer que suporta execução longa simplesmente colocando um timer sem dono em cima de um objeto já encerrado.
- `nextEligibleAt` só limita quando algo pode chamar refresh de novo; não acorda sozinho. O backoff de falha funciona pelo mesmo princípio; e, faltando o campo, depois de gravar um TTL bem-sucedido o processo atual também não refaz a tentativa automaticamente.
- O `AccountProviderService` do App assina mudanças de configuração e reinterpreta, de modo que o caminho normal é mais completo que o do Standalone. Mas, se a reconstrução da Account atualizada falhar, a Account antiga é mantida; e, como o próximo resultado remoto vier como unchanged, nenhuma nova mudança de configuração será emitida. Portanto, a verificação de recuperação precisa cobrir o realinhamento da Account; não se pode substituir a recuperação dependente por downloads repetidos em timer.
- O `updated` de `applyRemoteRelease` indica apenas que o Active foi submetido, e não que todos os Worker/Registry já o tenham observado. Um refresh manual ainda pode sair como skipped porque outro processo detém o lease. A UI atual não precisa de novos estados enumerados, mas logs/testes não podem tratar esses resultados como “efetivo em todos os lados”.

## 5. Mecanismos existentes: preserváveis, mas com limites claros

| Etapa | Resultado da revisão | Tratamento nesta rodada |
| --- | --- | --- |
| Validação do Release | Envelope estrito, schemaVersion, revision inteira não negativa e segura; parsers de Provider/Model validam; legitimidade por regex e compilação CEL já estão no schema oficial | Reutilizar direto, sem duplicar um conjunto de schemas |
| Persistência atômica | Comparação dentro do lock do arquivo Active, substituição atômica por arquivo temporário; Provider e Model são substituídos por inteiro, sem montagem cruzada entre fontes | Manter e acrescentar cobertura de integração após o download da URL |
| Comparação de versão | Versão menor é stale; mesma versão com mesmo conteúdo é unchanged; mesma versão com conteúdo diferente é recusada; conflito de cache de mesma versão na inicialização volta ao que veio no pacote | Manter; rollback de conteúdo se faz publicando uma revision maior |
| LKG/pacote | Escolhe o candidato analisável mais novo; um candidato corrompido, de schema antigo ou de versão menor pode voltar ao pacote; se os dois candidatos forem inválidos, reporta erro | Não criar fallback de config vazia nem de pseudo-sucesso |
| Isolamento de ambiente | Caminhos separados por plataforma/versão do App/Endpoint do plano de controle, com a revision carregando a identidade do caminho de origem | A URL do CDN é apenas o endereço de transporte desta origem nesta rodada; trocar de URL não troca a identidade de cache nem limpa o histórico de revisions |
| Refresh concorrente | Coalescência de in-flight no processo, lease entre processos; force não contorna lease válido; lock de arquivo + revision no fim impedem retrocesso | Manter. O lease é uma deduplicação que pode expirar, não exclusão permanente; acrescentar regressões de requisição lenta em duas fases, take-over e resposta tardia |
| Saída/Endpoint | Já existem verificações de disposed/Endpoint após o download e dispose da fonte antiga | Acrescentar validação do corpo do download, antes da submissão e do ciclo de vida dos timers; não alegar cobertura de todas as sequências de troca |
| Projeção de mudança | Publicação completa Source→Config→Registry; mudança de Account no Host notificada ao Worker por protocolo; Worker observa o Active | Já há teste unitário no Linux; desktop/mobile reais e multiprocesso entre plataformas ainda exigem aceitação |
| Personal/execução | Fonte online pertence ao mesmo candidato Built-in, com Personal prioritário; Model já criado fica congelado | Não reescrever seleção, histórico nem modelos em execução; execuções criadas depois resolvem normalmente a nova configuração |

### Limite da capacidade de validação: não é uma “violação do projeto” recém-descoberta

Reprodução em execução: apagar do release real os três grupos de regras (Model genérico, Model+API, Site), mantendo a lista de templates e o liga/desliga exatos, e usar uma revision maior. `decodeZCodeBuiltinRelease` continua tendo sucesso, `applyRemoteRelease` retorna updated e grava em disco; depois de analisar GPT-6, `validateComplete()` reporta 2 ausências. Ou seja, **analisável não significa modelo disponível**: esse tipo de conteúdo substitui o Active em vez de restaurar automaticamente a versão anterior.

Isso está de acordo com [a decisão histórica do Todo19](../steps/todo-19-zcode-builtin-release-integrity-validation.md): a primeira versão da sincronização remota não adiciona validador de integridade de negócio do cliente, nem injeta conta falsa ou API Key para validar o Registry inteiro. Esta rodada não restaura silenciosamente o Todo19 descontinuado, nem passa a recusar configuração pública com base no Personal atual/nas contas.

Esta publicação precisa rodar, antes do upload, os testes reais existentes de integridade/regras/requisição do Built-in sobre o arquivo final, além da aceitação de download em duas fases exigida por esta funcionalidade; não se pode escrever testes que só validem o arquivo do repositório enquanto se envia outro conteúdo de fato. Se futuramente haverá ferramenta de publicação independente, pipeline totalmente automático ou portão de negócio no cliente, isso continua dependendo de decisão à parte. Não é possível prometer rollback automático para erro de negócio de configuração: hoje a forma de recuperação é uma publicação corretiva com revision maior.

## 6. Verificação em execução e limitações

| Evidência | Resultado |
| --- | --- |
| client/configs de produção → CDN → decoder oficial → comparação com o arquivo local normalizado | Sucesso; o Envelope antigo devolve null para a mesma resposta, ver §2 |
| Vitest da raiz: download do Services, release/runtime do Provider Node, config runtime do Services, Provider Registry Service | 5 arquivos, 46 testes passando |
| CLI `tsx --test packages/cli/tests/provider-runtime-env.test.ts` | 4 testes passando |
| Vitest próprio do CLI: `packages/bootstrap/tests/process-provider-registry-runtime.test.ts` | 1 arquivo, 10 testes passando |
| Reproduções com Runtime temporário, HTTP e Release sem regras | Provam respectivamente R2, R3 e o limite de integridade de negócio; nenhuma configuração ou teste oficial foi modificado |

O Vitest da raiz não coletou por padrão os dois arquivos-alvo do CLI; depois disso foram usados os runners corretos. Em um momento o arquivo Vitest do bootstrap foi entregue ao node:test, o que gerou erro de runner; trocando para o Vitest do CLI os 10 testes passaram, o que não é atribuído a defeito de produto. Ao todo, 60 testes existentes passaram; **nenhum deles é aceitação da nova cadeia de URL**.

Os scripts temporários de reprodução ficam em `/tmp/builtin-review-repro.mts` e `/tmp/builtin-timeout-review.mts`; eles só leem código, criam estado de teste no diretório temporário do sistema e limpam tudo, sem tocar na configuração do usuário. Na implementação, converta os cenários acima em testes persistidos no repositório. Logs: `/tmp/builtin-online-full-review-tests.log`, `/tmp/builtin-online-cli-entry-review-tests.log` (runner correto isolado, 4 testes passando) e `/tmp/builtin-online-bootstrap-review-tests.log`; o log histórico com runner misturado incorretamente é `/tmp/builtin-online-cli-review-tests.log`.

Não foi feito E2E real de desktop/mobile, atualização real entre processos, file watcher em Windows/macOS, verificação de rede em SSH/WSL/Docker/Server; nenhuma requisição paga a modelo foi enviada e nenhuma publicação online foi executada. Não se afirma que nada disso passou.