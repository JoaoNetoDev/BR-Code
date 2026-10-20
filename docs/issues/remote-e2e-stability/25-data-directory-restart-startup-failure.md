# Falha na inicialização a frio após alteração das configurações do desktop e do diretório de dados

Status: done

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch 09.
O `desktopauthority` do lote `r3-server-20261011150809016-2aeaba` falhou em 203,1 segundos.

Com um projeto remoto ativado, pela página real de configurações foram alterados a aceleração de
hardware, a política de certificados do navegador e o diretório de dados local; após salvar, foi feito
um reinício completo imediato. Antes do reinício já havia sido conferido: os campos do desktop são
escritos apenas localmente, o arquivamento reverso automático do Source funciona normalmente; os campos
do desktop do Source não foram contaminados e o canary local já havia sido copiado para o novo diretório
de dados. O `settings-authority.json` guarda os fatos bem-sucedidos dessas etapas.

O novo Main não entrou na interface principal e exibiu “无法完成启动准备 / 数据准备进程意外退出或连接中断”
(“Não foi possível concluir a preparação da inicialização / o processo de preparação de dados saiu
inesperadamente ou a conexão foi interrompida”). A tentativa de inicialização do banco
`6bae681b-502c-4a44-9231-634811d33575` terminou após 2692 ms com
`status=failed, errorCode=transport_closed`; os logs do Host registraram, após o exit do Worker,
`Storage preparation failed: transport_closed`. O espaço disponível em disco ainda era superior a 128 GB.

```text
Projeto remoto ativado → configurações do desktop e diretório de dados salvos, cópia do canary bem-sucedida
  → saída normal do processo antigo → inicialização do novo Main / Host
  → conexão do Worker de preparação de dados fechada → página de falha na inicialização
```

Não se trata de estar esperando o projeto padrão errado: nesta rodada só se esperou a interface
principal operável, e a página de falha continuou aparecendo. A causa do exit do Worker ainda não foi
localizada de forma única, e não é possível atribuir a falha exclusivamente ao diretório de dados ou
à aceleração de hardware só com base nesse cenário combinado. O código de negócio não foi alterado
nesta rodada; a asserção final de leitura da nova configuração local após o reinício não foi alcançada.

Evidências: o `settings-authority.json` do `desktopauthority` do lote acima, a gravação da falha e os
logs do Desktop.

## 2026-10-12 Continuação da localização (sem alteração da implementação de negócio)

O stack do incidente `host/index.js:2:458` foi confrontado com o test bundle da mesma versão, ainda não
reconstruído; a posição recai no ramo de exit do Worker de `prepareSessionStorage`. Portanto, o que
saiu foi o **Worker de preparação da biblioteca de sessões da CLI**, e não o Worker de biblioteca de
índice de tarefas de `prepareHostStorage`; o `transport_closed` periférico não pode servir de causa
raiz do banco. Esse ramo só tem sucesso quando recebe storagePrepared, sai normalmente e não há erro
anterior; não receber o quadro de conclusão ou sair com exceção pode produzir o erro atual.
O código existente descarta diretamente o stderr desse Worker, e os logs históricos não guardaram o
erro original da CLI nem o código de saída.

Após uma inspeção somente leitura dos logs do incidente, a entrada real de build da mesma versão de
negócio foi chamada em um diretório temporário isolado: o Worker de índice de tarefas usou uma cópia
do banco do diretório antigo preservado e, tanto no diretório padrão quanto no diretório personalizado,
retornou done, exit 0; o Worker de biblioteca de sessões da CLI, sob um caminho explícito de banco
temporário, foi executado tanto com o runtime Node quanto com o runtime Node do Electron e, nas duas
layouts de diretório, retornou storagePrepared, exit 0, com stderr vazio.
Essas sondas não reproduzem o salvamento completo das configurações nem a inicialização a frio, e não
usaram o novo banco do diretório já removido pelos casos antigos, de modo que só podem estreitar o
escopo da investigação, sem excluir problemas de estado do banco durante a cópia, de ambiente real ou de
outras entradas de inicialização.

Próxima verificação válida: manter, no cenário combinado original, uma cópia do novo banco do
diretório e os caminhos de armazenamento resolvidos antes do reinício, coletando o stderr, o código de
saída e o último quadro de controle do Worker da CLI, e então comparar com a alteração isolada do
diretório de dados. Aceleração de hardware, política de certificados e cópia de dados não foram
reconhecidos como causa raiz única; esta rodada não altera essas implementações.

## 2026-10-12 Forense do Worker e causa raiz confirmada

Esta rodada é apenas de diagnóstico, sem alteração da inicialização de negócio. O `desktopauthority`
do lote `r3-server-20261012012923737-60d156` ainda falhou após 205,4 segundos; o build de negócio é o
mesmo da reverificação do problema 11.
O `storage-worker-diagnostics.mjs` específico de teste observa um Worker terceirizado via preloading do
E2E, sem substituir a entrada de armazenamento, os quadros de controle, o código de saída ou o fluxo de
recuperação; o stderr retém no máximo 64 KiB e é gravado apenas no arquivo 0600 do artifact desta rodada.

| Momento                | Código de saída | stderr                                                                   | Último quadro de controle |
| ---------------------- | --------------- | ------------------------------------------------------------------------ | ------------------------ |
| Antes de alterar o diretório de dados | 0 | vazio                                                                    | startup/storagePrepared   |
| Após salvar e reiniciar a frio | 1 | `--cwd path is not accessible: <new-data-root>/.zcode/workspace/default` | nenhum                   |

Verificando o sistema de arquivos enquanto a página de falha ainda existia: o novo data root e `.zcode`
existiam, mas `.zcode/workspace` e seu subdiretório `default` não existiam. Trata-se da ausência do
diretório de trabalho de inicialização, não de corrupção de banco observada nem de falha de aceleração
de hardware.

```text
Projeto remoto como lastActiveWorkspace + novo data root
  → copyDataDirectory copia apenas .zcode/v2
  → resolveStartupWindowBootstrap retorna {} no ramo de atividade remota, sem criar o cwd local padrão
  → o Main ainda usa o default sob o novo root como agentSpawnFallbackCwd
  → o Host não tem alvos locais de warmup e usa esse cwd para preparar a biblioteca de sessões
  → a validação --cwd da CLI falha, exit 1, e storagePath ainda não foi enviado
  → o Host descarta o stderr e apresenta transport_closed
```

Limite de responsabilidade: a passagem entre
`packages/desktop/src/main/startupWorkspace.ts:resolveStartupWindowBootstrap` e o
`agentSpawnFallbackCwd` de `index.ts` não garante a existência do cwd pertencente à aplicação entregue
à preparação do armazenamento. `resolveZCodeAgentSpawnCwd` mantém o caminho original quando tanto a
requisição quanto o diretório alternativo estão indisponíveis, e a recusa da CLI está de acordo com o
contrato de admissão de caminhos.

Contraprovas e sondas mínimas:

- Com o bootstrap e a entrada do resolvedor de cwd reais atuais, usando a seleção de atividade remota e
  o novo diretório padrão, o resultado é bootstrap={}, cwdCreated=false, cwdExists=false; o código-fonte
  original não foi reescrito.
- Com o bundle real da CLI da mesma versão, o runtime Node do Electron, os mesmos argv/ambiente e banco
  isolado: quando o cwd não existe, exit=1, stderr igual ao da cena e frames=[]; apenas criando o
  diretório, exit=0, stderr vazio e storagePrepared recebido. Não houve troca de aceleração de
  hardware/configuração de certificados, alteração do banco nem adição de retentativas.
- O próprio observador de teste usando o Worker real confirmou: o exit=23 original permanece, e o stderr
  e o último quadro são integralmente preservados.

Julgamento: o problema se confirma, a causa raiz está confirmada, repair_ready=true; o fim a fim original
foi reproduzido e o contrafactual de fronteira foi verificado. O objetivo da correção seguinte é que o
owner da inicialização garanta que o seu cwd pertencente à aplicação esteja disponível antes da
preparação de armazenamento do Host; não ampliar para reconstrução de diretórios de projetos de
usuários inválidos. O sucesso após a correção da sequência completa de configurações ainda não foi
verificado, de modo que esta rodada não registra o sucesso do diagnóstico como PASS de caso de
produto.
Evidências: `worker-cwd-observation.json`, `worker-cwd-counterfactual.jsonl` e `bootstrap-probe.json`
em `packages/desktop/.e2e-artifacts/issue15-20261012/` na máquina local, além dos
`storage-workers/*.json` do caso do servidor acima.

## 2026-10-12 Implementação da correção mínima

Alvo da correção `56ca74621f0da771728e310e36d967afd5259c6d`; o código relacionado à causa raiz não
mudou. Antes de retornar no ramo de atividade remota sem alvos locais de warmup ativos, o
`resolveStartupWindowBootstrap` do Main cria de forma assíncrona o `conversationWorkspaceDir` já
resolvido a partir do data root, aguardando o diretório ficar pronto antes de entregá-lo ao Host.
O resultado de navegação/warmup retornado continua vazio; não se criam caminhos remotos do usuário, não
se adiciona projeto local e não se toma o foco remoto.
Segue-se o contrato de mkdir já existente para a primeira inicialização e para diretórios locais
inválidos; os erros são propagados diretamente, sem engolir erros nem adicionar retentativas.

Primeiro foram validados os campos de atividade novos, a importação da lista antiga, a preservação do
conteúdo de diretórios existentes e a falha de criação; então foi reexecutado o cenário combinado
original de desktopauthority (ativação remota, aceleração de hardware, política de certificados,
salvamento do diretório de dados, reinício completo a frio). O E2E mantém as asserções de que as
configurações do Source não foram contaminadas e de leitura de configuração após o reinício, e adiciona
evidência de existência antes e depois do cwd padrão do novo root.

Verificação parcial: as três regressões — atividade remota nova e antiga e falha de criação de
diretório — falhavam antes da correção e passaram depois. Os três arquivos `startupWorkspace`,
`hostDatabaseStartup` e `storagePreparationWorker` passaram em 20 itens; os testes afetados passaram em
17 arquivos e 219 itens. Checagem de tipos da raiz, lint (207 avisos preexistentes, 0 error),
arquitetura (0 violação), fixture e verificação de formatação das alterações passaram. O cenário
original no servidor e a regressão de inicialização a frio passaram, conforme a tabela abaixo.

### Reverificação final

Status de implementação: implementada; status de verificação: as verificações necessárias planejadas
passaram. Lote `r3-server-20261012013853643-f32109`, com o mesmo deploy de teste reconstruindo o pacote
de negócio; a entrada foi o ponto de partida da correção mais este patch, com o SHA-256 da lista
completa de fontes:
`8a674355697c004b22a12bbe6e973df9adf75501652f43fbd2d8f01f8810a94a`.

| Cenário           | Resultado         | Comportamento confirmado                                                                                                          |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| desktopauthority | PASS, 107,7 s    | Mantida a combinação original de configurações e o reinício completo; antes do reinício o cwd padrão do novo root não existia, depois existe; as configurações do desktop foram preservadas, o Source não foi contaminado e a cópia do canary teve sucesso |
| coldreconnect    | PASS, 150,0 s    | Recuperação a frio da task remota ativa, abertura sob demanda de outro projeto, retomada da conversa em ambos os lados, desativação da reconexão automática e recuperação manual passaram                     |

O observador do Worker registrou exit=0 antes e depois do reinício, stderr vazio e o último quadro
`startup/storagePrepared`; isso forma o contraste no mesmo cenário com o exit=1, cwd inacessível e
ausência de quadro de controle antes da correção.
Não foi alterada a validação de caminhos da CLI nem o protocolo de armazenamento, não foi ampliada a
extensão da cópia de diretórios e não foram adicionadas retentativas de recuperação.
O E2E é de servidor Linux; os testes focados na máquina local cobrem o comportamento do sistema de
arquivos do macOS, sem extrapolar para um E2E nativo de Windows.
Evidências na máquina local: `summary.json`, `settings-authority.json` e `storage-workers/` em
`packages/desktop/.e2e-artifacts/issue25-fix-20261012/`. A fila, os contêineres de teste e os locks
foram reciclados.
O rollback exige apenas desfazer a preparação de diretório do ramo de atividade remota; os dados dentro
dos diretórios já criados não são removidos no rollback, e a falha original de inicialização voltará a
aparecer.
