# A página de gerenciamento de dispositivos não consegue mostrar os dispositivos existentes e a entrada de desconexão quando o RPC remoto fica travado

Status: fixed; real SSH E2E verified (2026-09-26)

## Expectativa e realidade

Enquanto a requisição remota ainda não retornou, o usuário precisa conseguir executar a desconexão manual por meio dos registros de dispositivos já salvos.
No branch atual, ao entrar na página de configurações «Conexão remota», são exibidas apenas as preferências de conexão e o botão de nova conexão; a lista de dispositivos existentes fica vazia e não é possível desconectar um Source já existente.

Esse problema bloqueia a aceitação real de R3A-PRV-13 «desconectar enquanto a sincronização ainda não retornou»; não se pode liberar a resposta e só então clicar em desconectar, nem chamar o comando interno por fora da UI e considerar esse caminho como aprovado.

## Evidências reais

- Baseline de negócio: `54ece08f23f79ae54aea1f51e0d941497d627392`, sem modificação da implementação de negócio.
- Lote: `r3-server-20260924172343371-384821`, manifesto do código de teste `0fa28903814184a7dedf86882691a963d75096178722f4369add693a7f858462`.
- O Source realmente deletou o Provider especificado; a resposta SSH do produto Desktop foi retida pelo proxy em 11772 bytes, e o túnel de replay do modelo e a sonda de controle usaram conexões diretas independentes.
- A contagem de resultados do Main era 7 antes e depois do commit, e o resultado desta execução ainda não havia chegado; o `remoteSessionId` original permanecia vinculado.
- Após abrir o gerenciamento de dispositivos e esperar 30 segundos, não foi encontrado o ponto de entrada «Desconectar» do dispositivo salvo, e o teste falhou.
- O [quadro de vídeo de cerca de 20 segundos antes da falha](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-management-stalled.png) mostra a área de dispositivos vazia. Esse quadro está antes da ação de limpeza, e não representa o estado vazio após `clearAppData`.
- O [vídeo original](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-failure-smoke-01.webm) e os [fatos da injeção controlada](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-failure-smoke-01-facts.json) preservam o processo de falha.
- O lote independente `r3-server-20260924181553216-617c6a` (manifesto de teste `dd76d5be828b2dc4014c4fafc7b4c44630a963ecb1ad7b02ffeb7068d634964b`) provou primeiro que, em um link saudável, o dispositivo existente e o botão de desconexão estão disponíveis. Depois disso foram retidos 17200 bytes, a contagem de resultados do Main permaneceu em 18 e a falha ocorreu novamente após 31.247 segundos. A cena da falha confirma que o registro de Source local ainda existe, enquanto a página deixou de mostrar apenas as preferências de conexão e a nova conexão.
- A [página do link saudável](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-management-before-hold.png) e a [página após o travamento](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-management-pending-failure.png) foram coletadas diretamente pelo caso antes da limpeza; os [fatos completos](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/provisioning-failure-smoke-03-facts.json) também provam que a falha de escrita de PRV-12 só gera aviso, o feedback de sucesso local foi obtido, a conexão foi mantida e o novo salvamento após a recuperação foi concluído.

## Localização no código

1. `packages/desktop/src/host/sourceServerManagementService.ts:getSnapshot` lê primeiro o diretório local, depois espera `readMigrationCounts` e só então retorna o snapshot inteiro.
2. `readMigrationCounts` aguarda, para um Source online, dois RPCs remotos: `getFailedPathCount()` e `getAbandonedPathCount()`; essa leitura não tem prazo independente nem resultado degradado.
3. `packages/ui/src/hooks/useSourceServerManagementSnapshot.ts` inicia o snapshot como null e só exibe os dados quando `getSnapshot()` inteiro termina.
4. Os dispositivos existentes e o botão de desconexão de `SourceServerManagementPanel` são gerados a partir do snapshot, e por isso ficam bloqueados junto com a requisição pendente das estatísticas de migração.

A cadeia de chamadas acima é consistente com a lista vazia observada; na medição real há apenas um Source, e a extensão do impacto com múltiplos Sources ainda não foi verificada.

## Limites da correção e aceitação

O diretório local e o estado da conexão devem permanecer legíveis, e a indisponibilidade das estatísticas remotas de migração não deve bloquear a desconexão manual. O estado das estatísticas precisa expressar claramente que os dados não foram obtidos, sem falsificar zero.
Após a correção, reexecutar o caso de resposta controlada, preservando as precondições de Source já submetido e Main ainda sem o resultado, e então desconectar pela UI real verificando a liberação do RPC antigo, a modificação offline e a configuração mais recente após a reconexão.

## Correção da causa raiz e verificação (2026-09-26)

Após autorização explícita do usuário para a correção da causa raiz, foi removida a espera do `getSnapshot()` pelas estatísticas remotas. O serviço de gerenciamento do Host retorna primeiro o snapshot consistente do Directory e do Manager locais; a [projeção de estatísticas](../../../packages/desktop/src/host/sourceServerMigrationCounts.ts) lê as contagens de forma independente conforme a conexão física atual, e `loading` / `unavailable` / `requires-connection` nunca carregam valores zero falsificados.
Somente `available` contém contagens reais validadas por schema, e o total de nível superior agrega apenas esses itens conhecidos.

```text
Directory / Manager → snapshot local consistente → lista de dispositivos e botão de desconexão
RPC de estatísticas da conexão atual → conclusão independente → checagem de conexão e validade da projeção → generation / evento de diretório → complementação das estatísticas
```

Há no máximo um conjunto de requisições de estatísticas em trânsito por conexão; a falha de um item também espera o fechamento do outro item do mesmo conjunto. As requisições em trânsito invalidadas são fundidas em uma leitura posterior, e não acumulam requisições pendentes por eventos consecutivos de diretório. Resultados antigos após troca de geração, remoção ou `dispose` não são publicados; mudanças no diretório e novas tentativas ou abandonos de migração invalidam as contagens. Entrar explicitamente na página ou atualizá-la solicita estatísticas novas, enquanto atualizações disparadas por evento apenas leem a projeção já existente, evitando formar um laço de realimentação. Esse parâmetro opcional da requisição e o estado de retorno são validados estritamente no contrato compartilhado.

A correção não alterou o apply do Provider, a persistência de identidade, o protocolo remoto de Server/Agent ou o roteamento desktop continuous / mobile replayable. A projeção de estatísticas existe apenas na memória do Host, sem adicionar formato persistente ou migração; o rollback exige desfazer junto a implementação do Host, o contrato de gerenciamento compartilhado e o hook de UI, o que restauraria o risco original de bloqueio pelas estatísticas remotas.

Evidências de verificação:

- A fixture de UUID válido executada no serviço de gerenciamento antigo fez as 4 regressões falharem; após a correção, os 10 arquivos de teste relacionados passaram, com 121 itens. Isso cobre Source lento não bloqueando outro Source, desconexão manual, fusão de leituras, estado de erro, atualização explícita, fusão de atualizações em trânsito, troca de geração de conexão, remoção de Source, `dispose` e resultado tardio. As falhas previamente causadas pela fixture de UUID inválido não contam como evidência de causa raiz.
- Checagem de tipos, checagem de tipos de E2E e checagem de arquitetura passaram; o lint ficou com 0 erros e 65 avisos preexistentes.
- A versão final foi executada com o baseline de negócio `362a5dd23304d1aed78d8e961bc12e3205123909` mais o patch de correção, e o SHA-256 do manifesto de entrada é `bd8b2ccd0a86748a035cb2c7794df41ce3d25512c616035141158c529aa9c22c`.
  Os lotes `r3-server-20260926013327721-60bf25`, `r3-server-20260926014117100-b67658` e `r3-server-20260926014430621-fefb7b` tiveram todos os `provisioning` em PASS, com cerca de 215, 187 e 184 segundos, respectivamente. O primeiro lote também validou `devicerow` e `uninstall`, ambos em PASS.
- As três rodadas confirmaram que o Source foi submetido, a contagem de resultados do Main continuou inalterada e o proxy ainda reteve cerca de 17 KB de resposta; em seguida a desconexão manual foi feita pela UI original. O caso original não alterou as asserções nem liberou a resposta antecipadamente: a modificação offline não foi enviada, a reconexão sincronizou as duas modificações, a restauração do workspace A/B e a recuperação da falha de escrita de PRV-12 foram concluídas.

O E2E real cobre os dois workspaces de um Source; o isolamento mútuo entre múltiplos Sources é provado pelos testes unitários do serviço de gerenciamento real.
Após o desligamento lógico, o proxy ainda pode encaminhar bytes SSH criptografados que estavam em buffer anteriormente, e portanto isso não pode ser descrito como «todos os bytes transmitidos foram descartados»; o contrato de ciclo de vida de rejeição do RPC antigo é coberto separadamente pelos testes de conexão real em `serverRemoteConnectionLifecycle.test.ts`.
Esta correção não afirma que outros problemas de negócio ou a cobertura de plataformas de editor nativo foram concluídos.
