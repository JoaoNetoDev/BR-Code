# Falta um ponto de entrada de confirmação para a troca de identidade após desinstalar e reinstalar

Status: done

> Baseline de validação histórica: 2026-09-25. A correção do ponto de entrada de confirmação deste
> documento ainda tem valor, mas a premissa de que "reinstalar preservando os dados necessariamente
> gera uma nova identidade" foi substituída pela decisão do usuário registrada em
> [Issue 08](08-reinstall-history-visible-in-new-device.md) em 2026-10-10.
> Hoje, reinstalar no mesmo dispositivo preserva identidade e histórico; apenas a substituição em um
> ambiente de dados independente valida confirmação/cancelamento/arquivamento. Os lotes antigos abaixo
> não representam a aprovação da nova semântica.

## Evidências atuais

O baseline de negócio `54ece08f23f79ae54aea1f51e0d941497d627392`, o lote de servidor
`r3-server-20260924033117390-ff1bf4` chegou a reportar PASS em `uninstall`, mas o
[fato de execução](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/uninstall-full05.json)
registrou outro caminho:

1. Instalação inicial pelo assistente oficial, seguida de desinstalação via dois DELETE via CLI; os
   arquivos de runtime foram removidos, o config e as sentinelas de dados do usuário foram preservados.
2. Ao conectar novamente, foi solicitada a confirmação da troca de identidade, conforme o
   [limite de identidade de instalação do Source](../../architecture/r3-source-server-remote-architecture.md).
3. O botão "reinstalar e conectar" da página de configurações foi clicado. Após 30 segundos o painel de
   diretórios ainda existia, o botão do projeto original estava disabled e não havia mensagem de erro.
4. O teste antigo removia em seguida todas as conexões, criava uma nova conexão SSH, obtinha um novo
   installationId e só então declarava PASS.

O passo 4 prova que a instalação do zero funciona, mas não prova que o ponto de entrada de recuperação
do passo 3 funciona. Por isso o caso antigo mascarava o problema desse ponto de entrada.

## Correção do teste e o que falta validar

`conversation-session-r3-uninstall.test.ts` foi alterado para esperar diretamente que esse ponto de entrada
conclua a instalação, escolha o diretório original e restaure a session.
Em caso de falha, o painel de diretórios e os fatos da instalação são preservados e o resultado é FAIL
direto; o teste não apaga mais o dispositivo, troca o caminho e reporta sucesso.

A 10ª rodada `r3-server-20260924063933344-38f7b4` aguardou até o timeout no passo 1 do assistente,
apesar de o remoto já ter um novo installationId.
A conferência do código mostrou que a página de configurações chama `onCreateConnection` sem Profile,
que apenas abre o assistente; quem de fato submete a conexão é o `onSelectProfile(preferred)` do cartão
de dispositivo do assistente. Essa rodada omitiu a seleção da linha salva, portanto esse timeout não
pode ser classificado diretamente como defeito de negócio.
A ação já foi incluída. Na 11ª rodada `r3-server-20260924070140735-f6bd8f`, o
[fato de execução](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/uninstall-recheck11.json)
confirma que tanto o ponto de entrada das configurações quanto a linha salva foram clicados e, em
seguida, na etapa de estabelecimento do vínculo, o prompt "请在连接管理中确认身份换代" apareceu novamente.
O `current.json` remoto e o novo installationId já existiam, enquanto o config e as sentinelas de dados
do usuário foram preservados; o ponto de falha é a restauração da conexão, e não se pode descrever isso
como se a instalação não tivesse sido executada.

O lote de coleta de evidências complementar `r3-server-20260924091134245-eb60d2`, ao receber o erro de
identidade novamente, na verdade fechou o assistente e retornou ao gerenciamento de conexões.
O [fato de execução](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/uninstall-coverage-next.json)
mostra que a página continua marcada como "remoto desinstalado" e as únicas ações visíveis são
"reinstalar e conectar" e "remover todas as conexões", sem nenhum ponto de entrada de confirmação da
troca de identidade.
Isso é consistente com o código-fonte: o botão de confirmação existe apenas na lista de linhas de
Profile, e essa lista é ocultada quando `installState === "uninstalled"`.
O fluxo de recuperação exige confirmar a identidade, mas a página indicada não oferece um ponto de
entrada utilizável; já há evidência de execução e a implementação do produto não foi modificada.

A aceitação deve manter simultaneamente o allowlist e o preservedPaths de
[R3A-UPG-09](../../testing/r3-remote-automation-case-matrix.md), a conciliação do novo installationId
com os dados do usuário, e validar que a ação de recuperação da página de configurações é realmente
eficaz. A implementação de negócio não foi modificada.

## Correção da causa raiz e validação (2026-09-25)

Esta seção substitui o estado de "implementação de negócio não modificada" vigente durante a investigação
acima. O usuário autorizou explicitamente a correção deste problema.

A causa raiz está em [SourceServerManagementPanel](../../../packages/ui/src/settings/SourceServerManagementPanel.tsx):
o botão de confirmação existe somente nas linhas, um Source desinstalado oculta as linhas e a linha
preferida não está entre as outras linhas recolhidas, o que faz com que, mesmo quando o Host já reportou
`identity-change-pending`, continue não havendo ponto de entrada de confirmação. O contrato de proteção
de identidade e de substituição atômica do Host em si não precisa mudar.

Agora o cartão de dispositivo exibe primeiro a ação de confirmação da linha realmente pendente, e
múltiplas linhas pendentes ficam diretamente visíveis. Todos os pontos de entrada reutilizam o diálogo
de confirmação original e `management.confirmIdentityChange`; cancelar não altera o vínculo, a falha
exibe o erro e mantém o ponto de entrada, e o sucesso consome o snapshot devolvido pelo Host. Nenhum
atalho foi usado para contornar as fronteiras de segurança, como alterar `installState`, apagar o
dispositivo antigo, aceitar automaticamente a nova identidade ou repetir a operação.

```text
Antes: novo installationId → Host identity-change-pending → a UI oculta a confirmação → impossível recuperar
Agora: novo installationId → confirmação no cartão de dispositivo → usuário aceita → substituição atômica no Host → escolher o diretório a partir do novo dispositivo
```

Os testes de regressão, no componente original, provaram primeiro 5 falhas com as 18 existentes
passando; após a correção foi adicionada a cobertura de múltiplas linhas, e 125 verificações de UI
relevante, diretórios do Host, gerenciamento de conexões e serviços passaram. Há asserções de
comportamento para cancelamento, desabilitado durante a requisição, ausência de repetição automática em
caso de falha, linha preferida e não preferida, e installed/uninstalled. Checagem de tipos, checagem de
tipos do E2E e checagem de arquitetura passaram; o lint reportou 0 erros.

Os testes reais usaram um servidor de teste dedicado e um contêiner SSH Linux independente, com o
baseline de negócio `54ece08f23f79ae54aea1f51e0d941497d627392` mais esta correção. No lote válido
`r3-server-20260925030830182-0375bb`, `uninstall`, `devicerow` e `uipairwise` foram todos PASS; o
SHA-256 da lista completa de entradas é
`55c831c21489c120f7a3e82ba8346c389892bade3121890c39d2b8e69263d596`.
`uninstall` verificou que cancelar não altera a linha original, que após a confirmação a linha antiga é
arquivada e o histórico antigo é preservado, além de novo installationId, nova session, preservação
de config/dados do usuário e a seleção do diretório original a partir da nova linha salva. O caminho de
apagamento do dispositivo não foi exercitado, que segue pelo fluxo de primeira conexão.

A mesma versão de entradas também passou uma vez em contêineres novos em
`r3-server-20260925031220129-dab784` e `r3-server-20260925031504324-c14318`, totalizando três PASS
completos, com durações de aproximadamente 203, 158 e 158 segundos (a primeira rodada rodou em
paralelo com o caso adjacente).

O primeiro lote candidato `r3-server-20260925030033171-139169` já passou pela confirmação de
identidade, mas o novo DOM click de menu adicionado no E2E não acionou o menu do Radix, e o FAIL geral
foi preservado. Após passar a usar o clique via WebDriver, com o helper de SSH já existente, os lotes
completos acima passaram; nenhuma alternativa de negócio foi acrescentada para mascarar esse erro
operacional do teste.

O escopo é apenas a UI de gerenciamento de conexões do desktop; o gate `isDesktop` do `SettingsPage`
impede que o caminho replayable do celular use esse painel. Protocolo, persistência de identidade,
Host/CLI e regras de migração de dados não foram alterados. O rollback exige apenas reverter esta
correção de UI; não há mudança de formato de dados que precise ser revertida, mas o problema original
de ausência do ponto de entrada de confirmação volta a ficar exposto.
