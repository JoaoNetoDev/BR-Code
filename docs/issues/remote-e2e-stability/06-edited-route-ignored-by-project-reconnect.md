# Após alterar o endereço SSH, a reconexão no painel lateral ainda usa a rota antiga

Status: done

## Expectativa

O guia de testes SSH do Desktop, em "Gerenciamento de dispositivos e conexões", exige que as
alterações de endereço e credenciais passem a valer na próxima conexão; deixar o campo em branco
mantém as credenciais originais.
A conexão atual pode continuar em uso; a próxima reconexão a partir do projeto original deve usar
o Connection Profile salvo.

## Reprodução e evidências

- Baseline de negócio `a13999a28927f629d0c64080a5096cf8b4f23bae`, com build do servidor já verificado.
- case `conversation-session-ssh-remote-connection-management.test.ts`, cenário de edição.
- Os lotes `r3-server-20261009183107835-42af65` e `r3-server-20261009221305938-a3e800`
  de `connection-management` falharam na asserção da contagem real de conexões da nova rota.
- Abri A/B no mesmo dispositivo; nas configurações, alterei o nome da rota, o nome do dispositivo e a
  porta SSH para o proxy de encaminhamento deste case, deixando a senha em branco.
  O session do projeto original manteve os valores originais e a contagem de conexões do novo proxy
  ficou em 0, o que está de acordo com "vale na próxima conexão".
- Desconectei ativamente o dispositivo e reconectei a partir do projeto original. O projeto reobteve o
  session, mas a contagem de conexões do novo proxy continuou em 0.
- A escrita das configurações nos logs originais do Desktop prova que a porta do Profile foi atualizada;
  o log de reconexão continua conectando na porta original.
  Depois disso, a porta antiga ainda foi registrada como um segundo Profile. A asserção que falhou não
  foi relaxada.

## Localização estática do ciclo de regressão original

`reconnectRemoteWorkspaceHistoryEntry` cria o alvo de reconexão a partir de `sessionEntry.target`.
`loadSourceServerProfileCredentials`, ao ler o Profile vinculado ao histórico, obtém apenas as
credenciais, sem usar o host/port/método de autenticação mais recentes do Profile como alvo de conexão.
Dessa forma, o snapshot histórico da Tab e o Profile podem formar dois fatos de rota diferentes.

O lote `r3-server-20261009223735233-3b63ee` já esperou explicitamente a liberação do attachment antigo
para repetir a execução, e a contagem de conexões do novo proxy continuou em 0; isso descarta a
influência do timing assíncrono do botão. A implementação de negócio não é modificada nesta tarefa.
A rota padrão e a remoção de dispositivo têm cenários independentes; não se pode, com base nessa
falha, pular o restante da aceitação de gerenciamento.

## Correção da causa raiz (2026-10-10)

Ponto de partida da correção `1ed4575f887edcc73ee3924ffd6df85d2e60aafe`, com o mesmo código de negócio
de reconexão da baseline de testes original.
A sonda do módulo real atual já reproduziu o problema: depois de o Profile atualizar a porta, a
reconexão do projeto original ainda envia a porta antiga e gera um segundo Profile;
conectar pela página de configurações conforme o Profile usa a nova porta, e alterar apenas a senha
também é lido pela reconexão do projeto original.

A correção age na resolução do alvo de reconexão no Renderer, lendo o Profile SSH completo conforme o
vínculo histórico do projeto original, mantendo inalterados o diretório, a identidade de Source, a
seleção da rota original e o ciclo de vida do Host. O session antigo serve apenas como entrada de
compatibilidade para históricos sem Profile; quando não há referência a novas credenciais e a
configuração de autenticação é a mesma, a referência de credenciais antiga é preservada, sem reutilizar a
senha da chave privada que já foi trocada. Mantém-se a reutilização das credenciais do solicitante pelo
sibling e a ordem de recuperação no mesmo dispositivo após falha de admission de diretório.

```text
salvar: Profile (autoridade da configuração de conexão) é atualizado, o session online atual não reinicia
reconectar: identidade do projeto + path -> Profile vinculado original -> target SSH mais recente + credenciais -> ponto de entrada de conexão do Host original
sucesso: preenche de volta o novo session / target, a identidade original do workspace não muda, nenhuma rota antiga é adicionada
```

Resultados da verificação:

- Foram adicionados 8 testes de comportamento de reconexão; antes da correção, 6 falharam e 2 casos
  de controle normais passaram; depois da correção, todos passaram.
  Cobrem recuperação manual/automática, novo endereço/novo usuário, troca de chave privada,
  compatibilidade com credenciais antigas, rejeição quando faltam credenciais novas, seleção da rota
  vinculada original e reutilização de credenciais do sibling.
  Os dois testes que antes cobriam apenas o helper de credenciais foram substituídos por testes
  públicos de comportamento de reconexão.
- `pnpm test:unit:affected --base 1ed4575f887edcc73ee3924ffd6df85d2e60aafe`:
  371 arquivos do Vitest / 4378 casos e 28 auditorias Node passaram; a suíte unitária completa da raiz
  não foi executada.
- A checagem de tipos da raiz, a checagem de tipos do E2E, o lint e as checagens de arquitetura e de
  fixture passaram; o lint mantém as 81 advertências já existentes.
  A verificação de formatação do código alterado e a verificação de diff passaram. Os avisos de formato
  de tabela e de terminologia de nomes de branch já existentes na especificação de design são
  consistentes com a baseline; esta cláusula não introduziu novos problemas de formato ou terminologia.
- macOS Electron -> contêiner SSH Linux independente, `R3_CONNECTION_MANAGEMENT_CASE=edit`:
  `desktop-e2e-20261010-route-fix` **1/1 PASS**. A nova porta recebeu 1 conexão e a autenticação
  teve sucesso com a senha em branco; as identidades dos projetos A/B foram preservadas, B recebeu um
  novo session; o Profile original foi mantido e a contagem de Profiles ativos do dispositivo é 1.
  A asserção original de "contagem real de conexões do novo proxy > 0" foi mantida, e foram adicionadas
  asserções de recuperação do sibling e de que nenhuma rota antiga seja adicionada.
- O `connection-management.json`, o `test-results.ndjson`, os logs de execução e o
  `build-source-evidence.json` desse run foram mantidos em `.e2e-artifacts`. O status do build é
  `fresh-stable`; o SHA-256 do código-fonte do módulo de reconexão foi conferido contra o workspace
  final, e o resultado da conferência está em `route-fix-verification.json`.

O E2E completo desta rodada reexecutou apenas a variante de edição; as variantes de lifecycle de
rota padrão/remoção mantêm o registro de aprovação original.
A troca de chave privada é coberta por teste unitário da função real de reconexão; não foi executado um
E2E SSH real com chave privada; não foram reexecutados o host desktop nativo do Windows, o host desktop
Linux ou o relay do celular de ponta a ponta.
Nada é alterado nos caminhos de reconexão de WSL/Docker/Server, no RPC, no owner do Host ou nos limites
continuous/replayable; não houve promoção manual nem admissão em CI.
