# Bugfix 05: auto-cura do refresh do Worker Registry do Personal Config

> Status: concluído
>
> Data: 2026-08-27
>
> Origem: teste de conexão real nas Provider Settings do macOS reportando `provider-not-found` por um longo período

> Revisão do limite de lock em 2026-09-15: leituras comuns e de polling puro, sem normalização, não usam mais lock exclusivo; importação, escrita normalizada e update continuam usando o lock de escrita original.
> Abaixo fica registrado o方案 histórico; o escopo de lock atual e as restrições de concorrência estão em [TODO de remoção de lock de leitura pura](../../../analysis/2026-09-15-provider-config-read-lock-todo.md).

## 1. Problema

Depois que o usuário salva um novo Personal Provider nas Provider Settings, a Host Settings View já exibe esse Provider, mas o teste de conexão de modelo pode retornar por um longo período:

```text
Provider Registry 中不存在 Provider: <providerId>
```

Clicar repetidamente no teste de conexão não resolve; reiniciar o Worker, reiniciar o aplicativo ou alguma alteração de arquivo posterior pode resolver.

Isso não é um atraso normal de refresh assíncrono. Host e Core Worker mantêm cada um seu Provider Registry em processo: após o Host salvar, ele atualiza ativamente o próprio Registry, enquanto o Worker só atualiza quando observa mudanças externas no Personal Config. O único mecanismo atual de observação entre processos é `fs.watch`; assim que um evento é perdido, o Worker não tem polling, releitura ativa nem outra entrada de auto-cura e serve um Registry antigo indefinidamente.

## 2. Causa raiz

A gravação em produção usa escrita atômica: primeiro grava um arquivo temporário no mesmo diretório e depois faz `rename` para `config.json`. O Personal Repository atual observa o diretório e somente agenda a releitura quando `fileName` é `null` ou é exatamente igual ao nome do arquivo alvo.

```text
Host
├─ write .config.json.<pid>.<time>.tmp
└─ rename tmp -> config.json
          |
          v
macOS / Windows / Linux 的 fs.watch 事件形态不一致
          |
          +-- 精确报告 config.json --> Worker 刷新
          `-- 临时名、漏事件或 watcher error --> 当前实现不再自愈
```

Existem ainda três fatores de amplificação:

- o `error` do watcher apenas publica um evento de erro, sem limpar nem recriar a instância inválida;
- falhas de leitura após o disparo do watcher apenas publicam erro, sem retry posterior;
- o teste de conexão apenas sincroniza ativamente o Account Config e não relê o Personal Config, então cliques consecutivos continuam consultando o mesmo Registry antigo do Worker.

Os testes existentes usam `writeFile(config.json)` direto para simular modificação externa e não cobrem dois Runtimes independentes校长 trabalhando com escrita atômica oficial, nem cobrem a recuperação após perda total de eventos de arquivo.

## 3. Decisão final

O Personal Config deixa de usar `fs.watch`. O Repository mantém apenas um mecanismo de observação de mudança entre processos: reler o arquivo alvo em baixa frequência e de forma assíncrona, comparando a content revision.

```text
Repository start/read
        |
        v
记录 observed content revision
        |
        v
异步轮询（默认约 1 秒）
        |
        v
在文件锁内读取 Personal Config
        |
        +-- revision 相同 --> 不发布事件
        `-- revision 变化 --> 更新 observed revision
                              + 发布 personal:poll-changed
                              + Registry 正常 refresh
```

Não se deve manter em paralelo dois mecanismos de longo prazo `fs.watch + poll`, nem adicionar barreira de revision entre Host/Worker, transferência completa de Config ou sincronização de Registry Snapshot. O polling lê apenas o arquivo local do Personal Config do Environment atual, não acessa servidor e não pertence ao refresh remoto de Built-in.

## 4. Restrições de implementação do Repository

### 4.1 Um único loop assíncrono de polling

- o polling é iniciado após o primeiro `read()` ou o `start()` do Runtime;
- intervalo padrão de cerca de 1 segundo; testes podem injetar um intervalo menor;
- a próxima rodada só é agendada após o término da atual, evitando que uma IO lenta gere leituras sobrepostas;
- usar IO de arquivo assíncrona e o lock de arquivo existente;
- comparar a revision do conteúdo oficial, sem depender de nome de arquivo, mtime, size ou inode;
- quando a revision não muda, não publicar mudança de Source e não disparar substituição do Registry;
- em falha temporária de leitura, lock ou parse, reportar erro observável e continuar tentando na próxima rodada;
- o Timer deve usar `unref()` e não pode impedir o encerramento do processo Node;
- após o `dispose()` do Repository, cancelar o agendamento da próxima rodada e nenhuma leitura em voo pode publicar evento ao terminar.

Remover `FSWatcher`, o filtro de eventos de diretório, o handler de erro do watcher e todo estado relacionado à recriação do watcher. O `watch?: boolean` existente, se apenas expressa desligar a observação de mudança externa nos testes, deve ser alterado de uma vez para uma opção de polling com semântica clara, sem manter uma camada de compatibilidade de nome enganoso.

### 4.2 Update explícito no próprio processo continua publicando imediatamente

Quando o próprio Repository executa `update()`, ele continua atualizando `observedRevision` imediatamente após a escrita atômica e publicando um `updated`:

```text
当前 Repository.update()
        |
        +-- 原子写完成
        +-- observedRevision = new revision
        `-- emit("updated")

下一轮 poll 读到相同 revision
        `-- 去重，不再 emit
```

Assim, o salvamento pelo Host não espera um segundo; apenas o Repository de outro processo alcança o estado novo, o mais tardar, na próxima rodada de polling.

## 5. Refresh ativo no teste de conexão

O teste de conexão de modelo é um diagnóstico da "configuração já salva atualmente" e não pode esperar a próxima rodada de polling. Ao receber uma requisição de conectividade, o Agent deve primeiro atualizar ativamente a Config Source e o Registry do próprio processo, e só então procurar o Provider/Model e executar o teste usando a cadeia de execução oficial de Model:

```text
Host 已完成保存
        |
        v
Agent connectivity request
        |
        v
Worker Registry.refresh("provider-connectivity")
├─ 主动读取 Personal Config
├─ 与当前 Account Config 共同 resolve
└─ 等待 Registry 发布完成
        |
        v
精确查找 providerId/modelId
        |
        v
临时创建正式 Model 并测试
```

Aqui não se deixa o Host implementar diretamente requisições HTTP de modelo: o Host não possui a cadeia de execução oficial de Adapter/ModelFactory, e duplicar um protocolo de conexão produziria um segundo comportamento do tipo "teste passa mas o chat real falha". Também não é permitido que o teste de conexão crie um Model alternativo a partir do rascunho do Renderer, de um Snapshot do Registry do Host ou de um Provider Config montado manualmente.

Quando o refresh ativo falhar, retornar o erro real de Config/Registry; quando o Provider for salvo mas incompleto, a falha deve continuar sendo um erro de Registry não executável, sem contornar o Resolver.

## 6. Semântica de operação normal

```text
同进程保存       --> 立即刷新当前 Registry
其他进程保存     --> 最迟约一个 polling interval 追上
连接测试         --> 请求开始时立即主动追上
新 Worker 启动   --> 首次 start/read 读取最新文件
Worker 长期存活  --> 轮询持续提供最终一致性
```

O refresh por polling afeta apenas as buscas de Registry e criações de Model realizadas posteriormente. Active Models já criados continuam congelados, sem reescrita a quente de seu Provider Config, Model Config, Endpoint ou material de acesso.

Desktop Local Host, Web Remote e Remote Workspace respeitam a propriedade por Environment de destino: o Host e o Worker de cada Environment leem apenas o Personal Config do próprio Environment. Não se deve copiar nem fazer polling do Personal Config local no Environment remoto.

## 7. Plano de testes

Escrever primeiro os testes que falham, depois modificar a implementação de produção.

### 7.1 Repository

- dois Personal Repository independentes apontando para o mesmo arquivo, com o escritor usando escrita atômica oficial e o observador publicando a nova revision dentro de um intervalo;
- descobrir mudanças mesmo sem nenhum evento de arquivo;
- mesmo conteúdo, escrita atômica repetida e `update()` no próprio processo não geram notificações duplicadas;
- a próxima rodada não começa enquanto a leitura anterior não terminou;
- recuperação na rodada seguinte após lock de arquivo, ausência temporária ou falha de leitura;
- `dispose()` limpa o Timer e leituras em voo não podem emitir após o dispose;
- o Timer não impede o encerramento do processo;
- não existe mais `FSWatcher` nem `fs.watch` do Personal Repository no código.

### 7.2 Registry e teste de conexão

- o Worker Registry resolve e publica o novo Provider após a mudança de Personal revision;
- após salvar um Personal Provider, o teste de conexão imediato encontra o Provider sem esperar o polling interval;
- Sessions ativas existentes e o App temporário de conectividade usam o mesmo Registry de processo já atualizado;
- falha de leitura de Config, Provider incompleto e Model inexistente preservam各自 erros precisos;
- o refresh ativo de conectividade não cria um segundo Registry, Snapshot de Provider ou DTO de Model exclusivo de teste;
- Active Models já criados permanecem congelados após o refresh do Registry.

### 7.3 Regressão

- o Account Config continua sendo sincronizado explicitamente pelo Protocol existente, sem ser fundido ao polling de Personal Config;
- Active/LKG do ZCode Built-in e o mecanismo de refresh remoto permanecem inalterados;
- Model Selection, Provider Settings e requisições normais de modelo enxergam os mesmos fatos de Registry;
- macOS, Windows e Linux não dependem das respectivas implementações de evento de arquivo.

## 8. Critérios de conclusão

- mudanças externas no Personal Config não dependem mais de `fs.watch`;
- o Worker alcança a nova content revision o mais tardar em um ciclo de polling, e eventos perdidos não podem causar obsolescência permanente;
- o teste de conexão sempre atualiza ativamente o Registry do Worker atual antes de procurar o modelo;
- nenhum novo protocolo de revision entre processos, sincronização de Config/Registry Snapshot ou via alternativa de execução de modelo no Host;
- testes direcionados, `pnpm typecheck`, `pnpm lint` e o teste real no macOS de "salvar e testar a conexão imediatamente" passam.

## 9. Resultado da implementação

- o Personal Repository removeu `FSWatcher`, o filtro de eventos de diretório e o refresh serial do watcher, passando a usar polling assíncrono de content revision com padrão de 1 segundo e agendamento da próxima rodada só após o fim da atual; o Timer usa `unref()` e nenhum evento é publicado após o `dispose()`;
- o `update()` no mesmo processo ainda publica `updated` imediatamente, e o polling que lê a mesma revision deduplica; falhas temporárias de leitura só são reportadas uma vez ao entrar em estado de erro, e as rodadas seguintes continuam tentando e podem se recuperar sozinhas;
- a entrada de protocolo de conectividade de Provider, antes de procurar o Provider/Model e criar o Model oficial, espera explicitamente pelo `ProviderRegistryService.refresh("provider-connectivity")` do Worker atual, sem nova via de requisição pelo Host, Snapshot de Registry ou Model exclusivo de teste;
- passam os 44 testes de `@zcode/provider-node`, os 11 testes direcionados de Services Provider Runtime, os 108 testes de protocolo do Bootstrap e o typecheck relacionado; a reverificação real no macOS ficou para a etapa final de validação manual.