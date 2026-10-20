# Todo127: Publicação online e correção da cadeia de atualização da configuração Built-in

> Estado: **código e revisão concluídos; refresh da cadeia completa no desktop Pro, dois processos no macOS e verificação final de arquivos aprovados; limitações de celular/SSH etc. permanecem**. Goal com implementação autorizada. Download, ciclo de vida, alinhamento de Account e recuperação já estão conectados; limitações de verificação e publicação em [revisão de implementação](./todo-127-implementation-review.md) — não se pode tomar o download do arquivo do CDN como disponibilidade em todas as plataformas.
>
> Evidência de revisão: [revisão da cadeia de publicação online](../research/builtin-online-release-review-2026-09-11.md). Retoma o mecanismo de download/cache do Todo18; não se confunde o estado histórico de conclusão do Todo18 com a disponibilidade do novo protocolo de URL.

## 1. Contexto e decisões confirmadas

Na investigação, o servidor já devolvia uma URL de CDN em `data.configs.builtin_provider_config_json`, enquanto o App/CLI ainda lia o objeto antigo `configs.zcodeBuiltin`. Na época, o arquivo de produção era schemaVersion 1, revision 19. A conclusão da mesma versão vigente então está obsoleta: nesta rodada o local é revision 21; o online continua 19 e contém o já removido `teamApiKeyManagementUrl` — a validação estrita da nova versão vai rejeitá-lo e manter o candidato local; é preciso publicar um novo arquivo separadamente.

- Confirmado pelo usuário: **cada publicação usa uma URL nova, sem sobrescrever a mesma URL**. O cache CDN de longo prazo não precisa ser contornado por query aleatória a cada publicação.
- O pacote, o CDN e o Active continuam usando o mesmo `{ schemaVersion: 1, revision, config }`; Provider e Model são substituídos atomicamente juntos, sem novo Overlay, arquivo de configuração ou tabela de dados.
- O revision cresce de forma monotônica e unificada entre o pacote e a publicação online; conteúdo de rollback também é publicado com revision maior e URL nova. Não se pode forçar rollback apagando cache ou reduzindo o revision.
- Manter Environment como autoridade, sobreposição Personal e a fronteira de execução congelada; não reescrever seleção de modelo, campos antigos, mensagens, estatísticas, histórico ou Models em execução.
- Este Todo é responsável pela transmissão da publicação e pela aplicação confiável; Todo113/116 são responsáveis pelo catálogo real de modelos, capacidades e conteúdo de habilitação/desabilitação padrão, sem modificação duplicada aqui.
- Não reabrir as travas de integridade de negócio do cliente que já foram desativadas; formato/regex/CEL etc. reutilizam os Parsers existentes. Integridade e parâmetros reais são provados pela validação pré-publicação; não se pode prometer que qualquer conteúdo parseável seja utilizável.

## 2. Cadeia-alvo (camada por camada)

### 2.1 Lado de publicação

```text
Preparar configuração completa + revision maior
           |
Executar validação sobre o conteúdo final a ser enviado
           |
Enviar nova URL do CDN → confirmar que o conteúdo é legível e correto
           |
Atualizar client/configs.builtin_provider_config_json
```

Este Todo não publica dados online automaticamente nem inventa uma plataforma de publicação. O resultado da implementação entrega passos de verificação reutilizáveis; o suporte das versões antigas de cliente é verificado pelo desvio dos controles existentes de app_version/platform, e não se pode assumir que todas as versões antigas suportam campos, enums ou protocolos novos só porque o schemaVersion é 1 em todas. Atualmente apenas uma combinação de versão/plataforma de produção foi testada de fato.

### 2.2 Entrada de transmissão

```ts
interface BuiltinClientConfigFields {
  builtin_provider_config_json?: string; // o schema real restringe a URLs de download válidas
}
```

A interface apenas mostra o formato; a implementação deriva o tipo a partir do schema. O valor deste campo é apenas uma URL, não compatível com string JSON nem com objeto misto; campo ausente não limpa a configuração atual. Campo presente mas inválido, falha HTTP, timeout, JSON ruim/schemaVersion não suportado caem todos num caminho de falha com motivo, preservando o candidato local válido.

App Services e a CLI independente compartilham a lógica de parsing/download/decodificação de Release, com a rede injetada por dependência. Evita-se divergir novamente em duas implementações e também não se unifica todos os consumidores de client/configs por causa disso. Quanto a remover as exportações de decodificação antigas de `zcodeBuiltin`, verificar referências na implementação; não se introduz por padrão prioridade de duplo protocolo nem ramo de compatibilidade permanente.

Os limites de download estão confirmados; os valores abaixo substituem os números anteriormente pendentes:

| Item                                | Decisão final                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeout                             | As duas fases — requisição a client/configs e download do CDN — somam **20 segundos no total**, abrangendo cabeçalhos de resposta e consumo de corpo das duas requisições; não são 20 segundos cada. Mantém-se o lease existente de 30 segundos, e o orçamento de download é menor que o lease |
| Limite de corpo                      | Corpo do CDN **10 MB**,implementado como `10,000,000` bytes em decimal, substituindo a sugestão anterior de 5 MiB; acumula-se o corpo real durante a leitura, não apenas verificando Content-Length                              |
| URL                                 | Produção usa HTTPS; endereço com usuário/senha embutido é rejeitado                                                                                |
| Credenciais                         | Requisições ao CDN não carregam Token de conta nem API Key, e não copiam cabeçalhos de autenticação da requisição ao plano de controle                        |
| Campo ausente                       | Preserva a configuração atual; significa que não houve publicação online nesta rodada, não é construed como ordem de limpeza                           |
| Campo inválido/falha HTTP/timeout/falha de parsing | Preserva o candidato local válido, registra o motivo da falha e entra no backoff de download existente                                                 |
| Saída                               | Cancela a requisição e a leitura de corpo, interrompe a aplicação subsequente                                                                         |

Na implementação, conferir o tamanho real do arquivo e acrescentar testes de timeout e de limite de tamanho; o limite já determinado não é um item pendente que a implementação possa ajustar por conta própria. Não-se aproveitar para mudar a implementação de timeout de todos os ApiClients; primeiro corrigir o problema já reproduzido na fronteira de download compartilhada do Built-in.

### 2.3 Ciclo de vida do refresh

Manter a forma de inicialização que carrega primeiro o pacote/cache válido e faz a verificação em segundo plano, além do ponto de refresh manual na página de configurações. Não fazer a inicialização depender da rede e não adicionar um gate de download antes de cada requisição de modelo.

Responsabilidades confirmadas: o código compartilhado de download, refresh e agendamento fica em `provider-node`, com App/CLI injetando a capacidade de requisição de rede. App/Server Host inicia e libera dentro do ciclo de vida existente do Provider Runtime; o refresh contínuo da CLI independente vai para o runtime de longa duração, e a função de entrada passa a apenas preparar caminhos e a linha de base local, sem manter um objeto de refresh que se destrói logo após um download. O Managed Worker apenas lê/observa o arquivo Active injetado pelo Host, sem iniciar ciclo de download; o celular reutiliza o Host alvo da conexão.

```text
App / Server Environment Host            Runtime de longa duração da CLI
        Download e agendamento                 Download e agendamento
            |                                       |
         Arquivo Active                         Arquivo Active
            |                                       |
    Managed Worker lê/observa           Leitura pelo sistema de config do processo
```

| Momento do gatilho | Comportamento confirmado                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Inicialização      | Serve primeiro a configuração local, tenta refresh em segundo plano, respeitando o TTL compartilhado |
| Em execução       | **Verifica a expiração uma vez por minuto**; o intervalo entre requisições de rede após sucesso normal é de uma hora, não um download por minuto |
| Falha de download  | Reusa o nextEligibleAt e o backoff existentes: ~1, 2, 4 minutos crescendo progressivamente, com teto de uma hora; só tenta de novo na verificação de expiração |
| Refresh manual    | Contorna o TTL, mas ainda respeita o lease válido                                               |
| Saída              | Para a verificação periódica, cancela downloads, libera recursos e não impede a saída da CLI |

A verificação de um em minuto apenas lê o nextEligibleAt existente, sem manter uma segunda hora de retry de download. Vários Hosts em janelas diferentes podem verificar cada um, e o lease compartilhado funde as requisições de rede; não se afirma que exista apenas um Host por máquina. A aplicação normal da configuração é concluída por notificação de mudança e alinhamento de versão, e não por espera temporizada.

Reutilização de in-flight dentro do processo, e de lease em arquivo de controle entre processos; force apenas contorna o TTL, não o lease válido. A saída cancela downloads e libera recursos de agendamento, sem impedir a saída da CLI por causa de timer; após wake/rede recuperada, verifica conforme o estado de expiração, sem acumular ciclos perdidos. A troca de Endpoint do plano de controle segue o caminho isolado; a troca da URL do CDN não muda a identidade da origem.

### 2.4 Commit e aplicação

```text
Release completo no CDN
      |
Parser valida → compara revision dentro do lock de arquivo → substitui Active atomicamente
      |
Mudança de Config ──> Account é reconstruído a partir desse Built-in
      |                          |
      +────snapshot completo da mesma versão──+
                   |
                Registry
          /                \
Configurações e entradas de seleção  Models criados depois

Managed Worker: observa Active + recebe Account do Host
Standalone: observa Built-in + credenciais, deriva Account por conta própria
```

Confirmado: as mudanças de Built-in e de credenciais no Standalone compartilham um único fluxo de reconstrução serial, lendo o Built-in atual e as credenciais reais para derivar o Account; não exige novo login nem solicita nova API Key por causa da atualização de configuração. Mesmo sem conta logada, deve-se gerar um snapshot fail-closed baseado no novo Built-in, para que um Provider de API comum possa ser atualizado normalmente.

```text
Built-in 20, Account 19
          |
Continuar usando o Registry 19 completo, iniciar a reconstrução de Account
          |
Built-in chega a 21 durante a reconstrução?
  Sim: o resultado de 20 não é publicado, recalcula 21 a partir do fato mais recente
  Não: Account 20 + Built-in 20 → publica Registry 20 completo
```

Não se pode remover a verificação de mesma versão do Registry nem apenas alterar o revision do Account antigo para fingir uma reconstrução. Quando o Built-in ou as credenciais mudam durante a reconstrução, o resultado obsoleto não pode ser publicado; a inicialização e o download em segundo plano intercalados devem obedecer à mesma regra.

Quando a reconstrução falha, mantém-se o Registry completo antigo e reutiliza-se a verificação de um em minuto da §2.3 para determinar **se Built-in e Account ainda não estão alinhados**; só se reaciona a reconstrução de Account quando não estão alinhados. Essa verificação de recuperação não pode ser bloqueada pelo TTL de download, por falha de download ou por CDN unchanged; não é preciso baixar o CDN de novo e não se adiciona outro timer. O App cobre igualmente esse caminho de recuperação e não equipara download bem-sucedido a aplicação bem-sucedida.

A reconstrução normal de Account do App e o protocolo do Worker continuam sendo reutilizados. A ordem de chegada de arquivo e Account ao Managed Worker é indiferente; após a versão nova, publica-se o novo Registry, e antes disso continua-se servindo o snapshot completo antigo. Arquivo atualizado, Registry atualizado e Worker tendo observado são verificados separadamente; não se cria uma segunda autoridade de configuração nem uma barreira global antes do envio. Models já criados permanecem congelados; Models criados depois leem a configuração atualizada.

### 2.5 Ordem de implementação e pontos de alteração

1. **Fronteira compartilhada de download**: `packages/provider-node/src/` recebe o parsing do novo campo, o download em duas fases e a validação de Release existente; ajusta-se a montagem nos Services `zcodeBuiltinRemoteConfig.ts` e na CLI `provider-runtime-env.ts`, passando primeiro por BR117-01/02/03.
2. **Alinhamento e recuperação de Account**: em torno de `apps/zcode-cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts`, da derivação de Account do Standalone, do Provider Node Runtime e da montagem de Account do App, completar o gatilho de mudança e o tratamento de resultado obsoleto; manter as guardas de versão de `ProviderRegistryService`, passando primeiro por BR117-06/07.
3. **Agendamento de ciclo de vida**: conectar a verificação de um em minuto e o mecanismo existente de coordenação de refresh no runtime compartilhado do Provider Node; a montagem de ciclo de vida do App/Standalone é responsável por iniciar/parar; a mesma entrada de verificação também dispara a recuperação de Account não alinhado. Validar BR117-04/05, sem colocar responsabilidade no Renderer ou no Managed Worker.
4. **Aceitação da cadeia completa**: concluir BR117-08 a 11, validando Personal, execução congelada, consumidores reais e o arquivo final de publicação; depois executar os gates e registrar as plataformas não testadas. Cada passo primeiro acrescenta teste de falha, depois implementa; não-se ampliar o reordenamento de interfaces para um refactor global de ClientConfigService ou do protocolo de Account.

## 3. Itens a tratar nesta review

| Item                                | Conclusão e ação                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Campo antigo impede o download      | Medido de fato; mudar App/CLI para download de URL compartilhado                             |
| Arquivo do Standalone atualizado mas Registry antigo | Reprodução em runtime inferior + lacuna de assinatura em produção confirmadas; corrigir derivação de versão e corrida de inicialização |
| Timeout de corpo não funciona no App | Testado em HTTP local; completar na fronteira de download desta funcionalidade, sem mudar por padrão todos os ApiClients |
| Apenas TTL, sem agendamento automático | Confirmado estaticamente; acrescentar agendamento de ciclo de vida do Environment e recuperação real de falha |
| Active garante apenas parseabilidade | Fronteira de design existente; validar o conteúdo final antes da publicação, sem novo gate de negócio no cliente |
| Lock de arquivo/versão/cache/notificação | Testes direcionados existentes sustentam; manter o design e acrescentar integração do download de URL em duas fases e da cadeia de consumo |

O log deve no mínimo distinguir: ausente / ainda não chegou a hora do refresh / sendo atualizado por outro processo / versão inalterada / versão antiga demais / atualizado / estágio da falha. Usar o logger existente; o registro de atualização inclui revision e identidade da origem, evitando registrar a configuração inteira ou a URL completa com query sensível. Um agendamento normal sem mudança não gera info de alta frequência. Não tratar downloaded/updated como sucesso de aplicação em todas as plataformas.

## 4. Impact Brief

### Resumo da Funcionalidade

O modo é planning; a capacidade é fornecimento de configuração Built-in online, com camadas de alteração option-source, validation, persistence e ciclo de vida. Principais seeds: `fetchZCodeBuiltinRemoteRelease`, `fetchCliZCodeBuiltinRelease`, `ZCodeBuiltinRemoteSynchronizer`, `NodeProviderConfigRuntime`, `NodeProviderRegistryRuntime`, `ProviderRegistryService` e a montagem de Account do Standalone.

### Matriz de Superfície de UI

| Cenário/entrada                         | Origem compartilhada e commit                                                          | Exibição/rascunho e autoridade                                             | Modo e isolamento                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Refresh de configurações de modelo, lista de templates, parâmetros inteligentes | useModelProviders → ProviderSettingsService → refreshSources → Registry | Rascunho do Renderer inalterado; Config/Registry do Host é a autoridade, o download só escreve Active | Desktop e celular reutilizam o Host; não se pode limpar rascunho não salvo nem escrever Personal por conta própria |
| Conversa, automação, Subagent, seleção de modelo no Wiki | Cada um lê a projeção comum de Selection/Registry                   | Cada entrada mantém seu próprio commit e atribuição de salvamento        | Candidatos novos são mutáveis; histórico e execuções já vinculadas não são escritos por conta própria |
| CLI/TUI                                 | Download owner do Standalone → Source de arquivo/Account → Registry                  | O runtime de longa duração da CLI possui o ciclo de vida da configuração  | Sem owner de download de rede na UI; não deixar timers órfãos de funções de inicialização curtas |
| Controle remoto do celular, workspace remoto | shared-host attachment / Environment alvo servida                     | O celular só consome o Host alvo; o Host remoto gerencia a própria configuração | Não iniciar outro Agent, não duplicar o Registry local, não misturar workspacePath com identity |

### Comportamento Compartilhado e Divergente / Donos de Estado e Destinos de Commit

App e CLI compartilham Release, download e algoritmo de refresh, com a capacidade de rede injetada pela camada de montagem; a origem de derivação do Account difere. O único escritor do cache é o Source do Environment proprietário; o Personal Repository e as entradas de salvamento de cadaNegócio não são movidos por download online. O Managed Worker consome o Active do Host e o protocolo de Account; o Standalone precisa alinhar Built-in/Account por conta própria.

### Relacionamentos da Funcionalidade / Invariantes a Preservar

- must-inspect: entrada de download, owner do agendamento, commit em arquivo, alinhamento de versão de Account e publicação do Registry — determinam diretamente se a atualização online pode ser usada.
- should-inspect: refresh da página de configurações, parâmetros inteligentes, cada entrada de seleção de modelo e a criação posterior de ModelFactory; provam a mesma projeção de dados autoritativa.
- conditional: mudança de Endpoint, notificação de arquivo entre processos, SSH/WSL/Docker/Server com rede e cache próprios.
- invariant-only: sobreposição manual Personal, seleção/histórico não escritos por conta própria, Models criados ficam congelados, separação entre continuous do desktop e replayable do celular; não usar esta funcionalidade para refatorar o fluxo de dados do controle remoto.
- evidence-only: os 60 testes existentes e as reproduções em runtime do relatório de revisão; não tratá-los como funcionalidade de URL concluída.

### Evidência de Codegraph / Candidatos de Drift de Grafo / Delta de Grafo

Foram usados o grafo semântico e o domain map do feature-boundary-planner; atualmente não há ferramenta de codegraph, e a varredura de codegraph com profundidade 2 não foi executada. Usou-se rastreamento direto de chamadas/assinaturas no código-fonte e reprodução em runtime; não se pode afirmar que a varredura mecânica de impacto foi concluída.

Rastreados: App `node.ts → fetchZCodeBuiltinRemoteRelease → Source → Config → Registry`, `useModelProviders → refreshSources`, CLI `prepareCliProviderRuntimeEnv → bootstrap`, Host `zcodeAgentService → sincronização de Account`. O texto de antiga autoridade de remote provider/defaultModelRef no grafo semântico tem drift histórico; o Design V2 vigente prioriza Environment como autoridade; este Todo não altera o grafo nem restaura comportamento antigo. A relação a ser adicionada ao grafo é transmissão da fonte online → Source de capacidade de Model existente; organizar depois que a implementação estabilizar, sem ampliar o escopo na revisão.

### Perguntas Não Resolvidas / Handoff de Planejamento

Este Todo não exige montar um backend de publicação antes. O limite de download de 10 MB, o timeout total de 20 segundos, o lease existente de 30 segundos, a verificação de expiração de um em minuto e o intervalo normal de download de uma hora estão determinados e não voltam a ser itens pendentes. Se as exportações de decodificação de campos antigos ainda têm chamadas, e quais as assinaturas concretas de helper/ciclo de vida, serão definidos na implementação após verificar as referências; responsabilidades e comportamento devem seguir a §2. Se for preciso acrescentar gates de negócio do cliente, mudar o status de produto do Account, introduzir novos campos persistidos ou migração, ou publicar configuração online automaticamente, isso deve ser discutido à parte e não misturado a esta tarefa.

## 5. Plano de Verificação e Handoff

### Log de Esclarecimento / Dimensões / Poda

- O usuário confirmou o campo de URL, os dados completos no CDN, URLs versionadas sem sobrescrita, e as responsabilidades, o ciclo, a reconstrução de Account e a recuperação de falha do refresh da §2. O limite de corpo foi corrigido pelo usuário para 10 MB, substituindo 5 MiB. A autorização atual é落盘, não implementação imediata nem publicação.
- Dimensões: App/Standalone/Managed Worker; primeira inicialização/atualização em execução/saída; missing/falha/revision igual ou maior; normal/corpo lento/excedendo o lease; processo único/múltiplos; Account da mesma versão/atrasado/falha; cache válido/cache corrompido.
- Poda: não enumerar o produto cartesiano de todos os modelos e todos os planos de conta. Usar um modelo de API comum e um Account Provider para provar o alinhamento configuração/Account; as especificações reais de modelo ficam por conta de Todo113/116. Sem mudança de layout de UI, sem estender cores de tema/design de layout.

### Casos Aceitos / Linhas de Cobertura

Abaixo estão as metas de aceitação da implementação; primeiro reproduzir as lacunas com testes, depois alterar o código.

| ID       | Configuração e ação                                                                                                   | Asserções obrigatórias / camada de evidência                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR117-01 | client/configs retorna uma URL com formato real, CDN retorna um release novo válido                        | Requisições em duas fases em App/CLI, parâmetros de versão/plataforma corretos, sem tratar URL como JSON; download→arquivo→Registry consistente                                      |
| BR117-02 | Campo ausente, URL inválida, 404/500, JSON ruim, schema antigo, regex/CEL ruins                                   | Diferença entre ausente e falha; cache válido não é sobrescrito, erros diagnosticáveis; não alterar outros consumidores de client/configs                                      |
| BR117-03 | Respostas cumulativamente lentas em duas fases, cabeçalhos imediatos com corpo lento/corpo que não termina, Content-Length ausente ou falsamente pequeno, corpo exatamente 10,000,000 e mais 1 byte | Soma de 20 segundos nas duas requisições, limite de corpo de 10 MB, body cancelado ao exceder/timeout, in-flight finalmente liberado e retentável; App/CLI com a mesma semântica     |
| BR117-04 | Refresh concorrente, lease válido, tomada de controle com lease excedido, versão antiga atrasada, mesma versão com conteúdo diferente | Deduplicação limitada, sem downgrade nem escrita rasgada, owner antigo não sobrescreve novo registro de controle; saída/troca de Endpoint não mistura origens    |
| BR117-05 | Download de versão nova/unchanged; relógio falso avançando um minuto por vez, cobrindo o intervalo de sucesso de uma hora e o backoff de falha de 1/2/4 minutos até uma hora; dispose | Verificação sem expiração não gera requisição; só refresca na expiração, sem segunda hora de retry de download, agendamento duplicado ou vazamento em segundo plano; não baixar por requisição de modelo |
| BR117-06 | Atualizar Built-in durante execução no Standalone, credenciais inalteradas ou sem conta; inicialização intercalada; nova atualização para 21/durante reconstrução de 20 e mudança de credenciais | Account reconstruído automaticamente até o fato mais recente; resultados obsoletos não publicados, API comum não fica travada; sem novo login, sem nova Key, sem alterar apenas o revision |
| BR117-07 | Uma falha de reconstrução de Account no App/Standalone, download ainda dentro do TTL ou retornando unchanged; as duas ordens de chegada no Worker | A mesma verificação de um minuto pode tentar de novo apenas no estado não alinhado, sem download; Registry antigo preservado, mesma versão após recuperação; receivedRevision não se passa por aplicação, sem remover guardas |
| BR117-08 | Atualizar com sobreposição pessoal/rascunho de configurações não salvo/execução já criada                    | Arquivo Personal, seleção histórica e rascunhos não são escritos por conta própria; novo Model adota o novo valor a herdar, Model antigo não é substituído                    |
| BR117-09 | Dois processos observando arquivo compartilhado; substituição atômica em Windows/macOS/Linux              | Consumidores realmente leem o novo revision; reinício sem rede ainda tem linha de base utilizável, Active corrompido reverte para o do pacote                                |
| BR117-10 | Refresh manual nas configurações do desktop, celular conectado ao mesmo Host, Environment remoto             | Exibição/execução subsequente vêm do Registry do seu próprio alvo; evidência real de UI+Host/protocolo, sem iniciar outro runtime no celular                            |
| BR117-11 | Executar testes de integridade sobre o arquivo final de publicação e então baixar a nova URL para comparar | O objeto verificado é o mesmo do enviado; parâmetro de negócio ausente não pode ser publicado só porque o decoder passou; rollback usa revision maior         |

### Notas de Handoff E2E / Backfill de Matriz

Na implementação, conectar ao catálogo de testes existentes de Provider/configurações via e2e-case-lifecycle, sem escrever E2E nesta rodada. Usar um serviço HTTP local controlado simulando client/configs e CDN, diretório temporário de Environment, relógio controlado e dois processos consumidores reais; sem alterar campos de produção e sem precisar de requisições de modelos pagos. A aceitação de UI deve ligar ao menos refresh da página de configurações → Registry alvo → configuração da execução criada depois, com o celular usando o shared-host attachment existente. Sistemas e modos remotos que não puderem ser cobertos ficam com evidência explícita, sem ser escritos como aprovados.

## 6. Checklist Pendente

### Goal de Implementação de 2026-09-11

Verificado que o código-fonte atual ainda usa o campo inline antigo. O módulo compartilhado de download fica em provider-node; a rede entra por `request` via injeção, preservando a montagem de rede do ApiClient sem alterar sua implementação de timeout genérica. O módulo de download mantém o orçamento total de 20 segundos, o limite de bytes reais de corpo e o sinal de saída; os erros só relatam o estágio, sem ecoar a query da URL nem o corpo da configuração.

O ciclo de vida reaproveita o Node Config Runtime, e o owner de download executa a verificação compartilhada uma vez por minuto; o callback de recuperação de Account é independente do download, sem bloqueio por TTL/missing/falha. O Standalone prioriza reaproveitar o mecanismo serial/de mudança do AccountProviderService existente em vez de criar outra fila, e acrescenta a verificação de obsolescência pré-publicação; o Managed Worker continua sendo Host Account Source e não cria owner de download. A entrada curta da CLI apenas materializa a linha de base, e o refresh de rede vai para o runtime de longa duração.

- [x] Atualizar a linha de base do workspace, reverificar os campos online e o CDN e acrescentar os testes de cenário de falha deste Todo.
- [x] Conectar o download de URL compartilhado, corrigir timeout de corpo, cancelamento e limite de recursos, preservando o schema de Release existente.
- [x] Corrigir o alinhamento de Account/Builtin do Standalone e a corrida de inicialização; cobrir os limites de recuperação do App/Worker.
- [x] Acrescentar agendamento de ciclo de vida e resultados observáveis, reaproveitando lease/backoff/lock de arquivo/revision atuais, sem criar uma segunda autoridade de estado.
- [x] Concluir a integração central, o E2E de refresh no Pro desktop, a verificação final do arquivo revision22 e os testes afetados, typecheck, lint e gates de arquitetura.
- [ ] Complementar a verificação conjunta de celular shared-host/SSH e das plataformas não testadas; não se pode inferir aprovação em todas as plataformas a partir da aprovação no desktop.
- [x] Registrar as limitações reais de lançamento; a publicação online é executada por um processo com permissões à parte. Este Goal só autorizou o push da branch de trabalho, sem publicação automática de configuração.

A integração central e os gates já foram executados; a UI real/multiaplicador e o arquivo de publicação após a atualização final do catálogo do Todo113 serão consolidados na aceitação do lote completo. Este Todo e o Design V2 vigente prevalecem; os exemplos de campo inline do antigo Todo18 servem apenas como material histórico.

## 2026-10-12: falha de refresh remoto e isolamento do refresh de negócio

Defeito: o refreshSources das Settings colocava o refresh remoto de Built-in e de Account no mesmo
allSettled e depois lançava qualquer falha. Quando a validação do endereço de download remoto falhava, mesmo
com Bundled/Active válidos e Account já atualizado, a RPC inteira das Settings falhava; a troca de conexão
era revertida e o refresh de direitos após o login também era interrompido.

O único ponto de coordenação continua sendo Services ProviderRuntime.refreshSources. O erro de download remoto
é registrado em warn por essa entrada e depois degradado; o erro de refresh de Account continua propagando, e o
refresh final do Registry continua responsável por validar a consistência e a usabilidade dos snapshots atuais
de Config e de Account. Não se deve engolir o erro na UI, forjar direitos nem guardar uma segunda cópia do estado
disponível.

```text
Refresh das Settings
  ├─ atualização remota de Built-in → a falha só registra um aviso e mantém o candidato local válido
  └─ refresh de direitos de Account → a falha ainda é devolvida ao chamador
                 ↓
       Registry lê o Config + Account existentes
                 ↓
       válidos e consistentes → devolve a View; falha de leitura/parsing → mantém a semântica de falha
```

Esta rodada não altera o protocolo de download remoto, a validação HTTPS, a ordem de revision, o backoff nem a
escolha de cache, e não acrescenta migração de configuração/banco de dados. O refresh concorrente e a ordem de
eventos seguem o owner existente; ainda se aguarda a conclusão das duas verificações de origem desta rodada, sem
novas tarefas de background nem timeouts. O desktop e o Web compartilham a fronteira de Services; não são
modificados o Host attachment, a fila de tarefas, a entrega de mensagens desktop-continuous ou
web-remote-replayable. A chamada de download independente da CLI continua preservando a semântica original de
falha.

Regressão: em rejeição de endereço HTTP, HTTP 503, JSON inválido e falhas de cancelamento/timeout, com
Bundled/Active disponíveis o refresh deve continuar atualizando os direitos de Team/Start e o catálogo de
modelos; a falha na consulta da conta não pode ser mascarada pelo erro remoto; quando todos os configs
válidos estão ausentes, não se pode fingir sucesso. A UI reproduz o endereço remoto inválido usando um plano
de controle isolado e afirma que a seleção de equipe não é revertida e que os modelos de Start continuam
selecionáveis; o arquivo de teste entra em pending e não é promovido sem revisão manual.