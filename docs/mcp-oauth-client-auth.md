# Autenticação OAuth de Client MCP

> Design posterior: o single-flight de OAuth entre processos e a correção de corridas de refresh estão em `docs/mcp-oauth-two-phase.md` (conexão em duas fases da v4).
> Este documento descreve a forma de configuração, a integridade das credenciais e a fronteira da página de configurações; a forma de provider da conexão em duas fases, o contrato de bloqueio e a classificação de erros seguem aquele documento.

## Contexto

A especificação MCP Authorization de 2025-11-25 define a autorização sobre transports baseados em HTTP:

- O client MCP HTTP/SSE precisa suportar o challenge `WWW-Authenticate`, o OAuth Protected Resource Metadata (RFC 9728), o Authorization Server Metadata/OIDC discovery, os Resource Indicators (RFC 8707) e o header de Bearer token.
- O MCP stdio não segue essa especificação e continua lendo as credenciais das variáveis de ambiente do processo.
- O access token não pode entrar na query da URL e precisa ser enviado por `Authorization: Bearer <access-token>`.

O adapter MCP do ZCode já suporta os transports `stdio`, `http` e `sse`, mas HTTP/SSE antes suportava apenas headers estáticos. Quando um MCP server protegido retorna 401, o cliente precisa conseguir descobrir os metadados OAuth, concluir a autorização do usuário ou a autorização por credenciais de máquina, salvar o token e repetir a requisição; caso contrário, MCP servers OAuth como o Figma remote MCP não funcionam sem configuração adicional.

## Objetivos

Integrar o OAuth por completo à capacidade existente do MCP client:

1. A camada de configuração permite que um MCP server HTTP/SSE declare `oauth`.
2. O agent runtime repassa `oauth` sem alteração, a partir da UI/protocol desktop, da config de CLI e da plugin MCP config, ao MCP adapter.
3. O MCP adapter injeta o `OAuthClientProvider` do SDK para os transports HTTP/SSE, reutilizando a lógica do SDK de challenge 401, discovery de metadados, obtenção de token, refresh, resource parameter e bearer header.
4. O OAuth interativo `authorization_code` usa PKCE, registro dinâmico de client, callback em localhost, autorização no navegador, persistência de token e retry de reconexão, cobrindo MCP servers com autorização de usuário como o Figma remote MCP.
5. `client_credentials` continua suportando OAuth por credenciais de máquina, sem exigir navegador.
6. O MCP stdio não consome `oauth` e mantém o caminho de credenciais por variáveis de ambiente.
7. O teste de ponta a ponta usa um MCP HTTP server protegido local e um OAuth authorization server local para verificar que: uma requisição initialize sem token recebe 401, o cliente descobre os metadados, abre a URL de autorização, recebe o callback code, troca por token, repete com o bearer token e, por fim, o listTools tem sucesso.
8. Quando o authorization server exige interação do usuário, a página de configurações de MCP exibe uma entrada manual "abrir autorização"; por padrão o navegador do sistema não é aberto automaticamente, evitando que refresh de estado, conexão em background ou verificação de startup interrompam a operação atual do usuário.
9. Quando a Session inicia o MCP, o **orçamento de espera do caller** do OAuth `authorization_code` é fixo em 15 segundos; passado esse limite, aquele MCP server é marcado como falho nesta session e o fluxo continua, evitando que uma requisição ao modelo fique bloqueada por vários minutos quando não há autorização humana. Os 15 segundos são apenas o teto de espera deste caller, e não o tempo de vida da transação de autorização: a transação continua viva em background pelo TTL global de 300 segundos e, ao concluir, registra as ferramentas pela reconexão em background. Ver `docs/mcp-oauth-two-phase.md`.

## Configuração

Formas de configuração suportadas:

```json
{
  "mcp": {
    "servers": {
      "protected": {
        "type": "http",
        "url": "https://mcp.example.com/mcp",
        "oauth": {
          "type": "authorization_code",
          "clientName": "ZCode",
          "scope": "mcp:connect"
        }
      }
    }
  }
}
```

Campos:

- `oauth.type`: suporta `"authorization_code"` e `"client_credentials"`.
- `clientId`: OAuth client id; pode ser omitido no OAuth interativo, e quando omitido é obtido por registro dinâmico junto ao authorization server.
- `clientSecret`: OAuth client secret; só é necessário para credenciais de máquina ou para confidential client pré-registrado.
- `scope`: opcional; se o MCP server exigir um scope fixo, recomenda-se configurar explicitamente. Sem configuração, o cliente não especifica scope ativamente e a aprovação depende da política padrão do serviço de autorização.
- `clientName`: opcional, por padrão derivado do nome do MCP server.
- `redirectPath`: opcional, usado apenas por `authorization_code`; o padrão é `/oauth/callback/mcp/<serverName>`, e o redirect URI real usa uma porta localhost aleatória da máquina.

## Entrada de autorização manual

O OAuth `authorization_code` continua sendo mantido pelo agent MCP adapter, que guarda o verifier PKCE, o callback server em localhost e a persistência do token. A UI não guarda token e não afunda o estado OAuth no desktop main, no relay ou no estado de negócio do web remote.

A key de persistência das credenciais é isolada em cinco dimensões: `serverName`, `serverUrl`, `clientId`, `scope` e `redirectPath`; qualquer mudança em um desses campos semânticos de autorização dispara uma reautorização, sem reutilizar token antigo nem informação de client do registro dinâmico.

Quando o MCP adapter detecta que é necessária autorização do usuário, coloca a authorization URL desta autorização pendente no MCP status snapshot, mas por padrão não abre o navegador do sistema automaticamente. `mcp/list`, ao detectar OAuth pendente, deve retornar rapidamente o status atual em vez de esperar o timeout de autorização completo de 5 minutos. Depois de receber esse estado, a página de configurações exibe um botão de abertura manual na linha do MCP server correspondente; ao clicar, a plataforma `openExternal` abre a mesma authorization URL.

O agent runtime continua mantendo a capacidade de injetar explicitamente `openAuthorizationUrl`, para que testes de ponta a ponta ou fluxos de automação específicos possam conduzir ativamente o salto de autorização; sem injeção, o salto de autorização precisa ser disparado por uma ação do usuário na UI.

A authorization URL só é válida durante a autorização pendente atual; depois que o usuário conclui a autorização no navegador, o callback em localhost retorna ao agent, o adapter completa `finishAuth`, salva o token e reconecta. O access token e o refresh token não entram na URL nem são repassados à UI.

## Timeout de início da Session

O runtime da Session e o refresh de estado da página de configurações usam estratégias diferentes de espera pela autorização OAuth:

- O runtime da Session passa um teto de espera de autorização OAuth de 15 segundos em `connectConfiguredServers`. Quando o usuário não conclui imediatamente a autorização no navegador, apenas o MCP server correspondente falha, sem bloquear a requisição ao modelo deste turno e sem encerrar a transação de autorização em background (ver a separação entre orçamento do caller e tempo de vida da transação em `docs/mcp-oauth-two-phase.md`).
- O refresh de estado da página de configurações `mcp/list` não passa o limite da session e segue usando a janela de autorização padrão do adapter, retornando rapidamente a URL ao descobrir uma autorização pendente e continuando a aguardar a conclusão em background.
- Quando a página de configurações e a Session atingem a mesma conexão OAuth pendente, compartilham apenas a authorization URL, o PKCE/state, o callback e o ciclo de vida da conexão subjacente; cada chamador continua usando o seu próprio `oauthAuthorizationTimeoutMs` e `AbortSignal` como limite de espera. Quando um único chamador expira ou cancela, ele retorna o runtime snapshot daquele momento e não pode encerrar a sessão OAuth que outros chamadores ainda aguardam.
- O `timeoutMs` comum do MCP transport restringe apenas requisições de protocolo como connect/listTools/callTool e não deve reelongar a espera de callback OAuth de 15 segundos da session.

## Fronteira de transações de autorização concorrentes

O estado OAuth se divide em estado transacional e snapshot de nível de configuração, e é proibido juntar campos independentes ao longo de ciclos de vida:

- A client information de registro dinâmico e o `code_verifier` PKCE pertencem a uma única transação enquanto a autorização está em andamento. O provider precisa fixar o client desta transação dentro do mesmo ciclo de vida do `state` OAuth; quando `clientInformation()` é chamado repetidamente nas fases de registro do SDK e de troca do authorization code, ele não pode reler o client publicado por outra transação. O resultado do registro dinâmico é também gravado imediatamente na legacy client key, como semente de recuperação para uma nova autorização após a reconstrução do provider; a transação atual continua usando apenas o client fixado em memória e não pode trocar de vínculo por causa de um registro concorrente.
- Depois de trocar o token com sucesso, a client information dinâmica e o par `access_token` / `refresh_token` formam um canonical credential pair de nível de configuração. O par precisa ser gravado na mesma credential key e publicado atomicamente por um read-modify-write com bloqueio entre processos; é proibido continuar sobrescrevendo separadamente as keys compartilhadas `client_information` e `tokens`, pois o client e o token gravados por último poderiam vir de transações diferentes.
- A leitura do canonical pair pelo provider também precisa ser feita por snapshot. `clientInformation()` e `tokens()` do mesmo provider leem o mesmo par, evitando que outro processo troque a geração entre as duas leituras independentes do arquivo. O cache só pode ser marcado como carregado depois que a I/O de credenciais compartilhada, o parse e a derivação do snapshot tenham sido todos bem-sucedidos; um timeout de bloqueio ou uma falha temporária de I/O precisa manter o cache não carregado, para que a próxima chamada do mesmo provider possa tentar de novo.
- Os metadados de discovery continuam sendo cache compartilhado de nível de configuração; o verifier PKCE continua isolado por OAuth `state` sob o prefixo de credencial. Adapters diferentes, portas de callback diferentes ou reconexões concorrentes não podem ler nem escrever a mesma verifier key.

Cada autorização `authorization_code` mantém um `state` aleatório, um verifier PKCE, um callback server em localhost e uma porta dinérica independentes. Quando um chamador expira, cancela ou fecha, ele só pode encerrar o seu próprio callback server e limpar o verifier/client desta transação; não pode limpar outras autorizações pendentes da mesma configuração MCP nem remover incondicionalmente o canonical pair de nível de configuração.

Após invalid client/grant, o SDK chama `invalidateCredentials()` e tenta de novo. O provider só pode apagar o snapshot original canônico que ele realmente leu ou publicou: a remoção precisa comparar o valor atual com o valor esperado dentro do bloqueio do arquivo de credenciais e remover somente em caso de correspondência. Se outro processo já publicou um novo par, o compare-and-delete precisa falhar e preservar o novo valor; em seguida, o provider atual limpa o snapshot local e relê. Comparar apenas `publishedBy` com o state atual é insuficiente para cobrir o refresh, porque uma sessão de refresh legítima consome o par publicado por um state anterior.

A compatibilidade de upgrade adota uma janela de compatibilidade bidirecional: `saveTokens()` publica atomicamente o canonical pair v2 e os espelhos legacy `client_information` / `tokens` correspondentes dentro da mesma região crítica do arquivo de credenciais. O leitor v2 só adota um novo token gravado isoladamente por um processo antigo quando o legacy client e o canonical client coincidem, pois nesse caso é possível confirmar que é o refresh do mesmo client; a ausência do legacy token continua indicando que o processo antigo já invalidou. Se o legacy client e o token mudarem simultaneamente em relação ao canonical, o formato antigo sem generation não consegue provar que os dois vêm da mesma transação, e o leitor v2 precisa preservar o legacy client, descartar o token não confiável e reautorizar, proibindo junções por suposição. O canonical v1 não tem compromisso de espelho e só adota a atualização quando os legacy tokens foram regravados por um processo antigo e a identidade pode ser confirmada. Depois que todas as versões suportadas das credenciais compartilhadas conseguirem ler o canonical, a legacy key é removida por uma versão de migração independente. CLI e desktop podem fazer upgrade de forma independente e ainda assim compartilhar o arquivo de credenciais; portanto, ao encontrar uma canonical version desconhecida, o cliente precisa preservar o valor original e fazer fallback, proibindo tratar o snapshot de uma nova versão como dado corrompido e apagá-lo.

Depois de trocar o token com sucesso ou quando a sessão de autorização é encerrada, o verifier desta transação deve ser limpo. O callback server continua usando `listen(0)` para alocar uma porta aleatória, sem introduzir porta fixa nem exclusão mútua de porta entre processos.

A porta aleatória, o socket em escuta e o `state` OAuth do callback em localhost pertencem ao processo atual; depois que o processo sai, o callback original do navegador não pode mais ser entregue. Reconstruir o provider apenas restaura o client já registrado e inicia uma nova tentativa de autorização, sem prometer a recuperação de uma callback URL já inválida. A limpeza do verifier após a conclusão da autorização é best-effort; uma falha na limpeza precisa registrar log seguro, mas não pode reverter para falha uma troca de token ou um retry de conexão que já tiveram sucesso.

## Integridade do arquivo de credenciais compartilhado

O CLI adapter e o desktop host process leem e escrevem o mesmo `credentials.json`. Toda alteração read-modify-write precisa respeitar as seguintes restrições:

- Toda a região crítica read-modify-write usa o mesmo conjunto de bloqueio de arquivo entre processos; colocar o bloqueio apenas no `writeFile` não impede que um snapshot antigo sobrescreva uma key recém-escrita por outro processo.
- A gravação precisa criar um arquivo temporário no diretório de destino, definir permissão de arquivo privado e então substituir atomicamente por rename; erros transitórios de rename no macOS/Windows exigem retry limitado.
- Apenas `ENOENT` indica um arquivo de credenciais vazio. JSON corrompido, schema inválido ou outros erros de leitura exigem preservar primeiro, de forma idempotente pelo hash de conteúdo, uma evidência `.corrupt-<content-hash>.bak` com permissão `0600`, e só então lançar o erro; o mesmo conteúdo corrompido, lido quantas vezes e por quantos processos, só pode gerar uma única cópia. É proibido rebaixar o conteúdo corrompido para `{}` e continuar salvando, pois isso apagaria todas as credenciais.
- O bloqueio cobre apenas a I/O local de credenciais, e não a espera pela autorização no navegador, o token exchange de rede ou a janela de autorização de 15 segundos da Session.

Logs de diagnóstico de concorrência registram apenas identificadores seguros: PID do processo, adapter instance id, prefixo da credential key, hash curto do OAuth state e a porta de callback. Nunca devem registrar verifier, authorization code, access token, refresh token ou client secret.

## Impacto e fronteiras de casos

O impacto desta correção de integridade fica restrito a `persistence + validation/recovery`, sem alterar a interação da página de configurações, o DTO do MCP protocol, a entrega desktop continuous nem a web-remote replayable.

| Gatilho                                                    | Fronteira de responsabilidade | Resultado que precisa ser preservado                                                                    |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Dois adapters iniciam autorização para a mesma config MCP | Estado transacional OAuth      | Cada state lê seu próprio verifier/client e ambos passam na validação estrita de vínculo PKCE e code/client |
| Duas transações de autorização concluem em sequência e publicam tokens | Snapshot de configuração OAuth | O canonical client e os tokens sempre vêm da mesma transação e não há divergência de identidade em refresh posterior |
| Registro de novo client por processo antigo intercalado com refresh de outro processo antigo | Janela de compatibilidade de versão | Sem generation, tokens cuja origem não pode ser provada são descartados e há reautorização sem juntar identidades diferentes |
| Transação com falha e transação bem-sucedida fecham em concorrência | Invalidação de credenciais OAuth | A parte que falhou só pode fazer compare-and-delete do snapshot antigo que leu, e não pode apagar o novo par publicado pela parte bem-sucedida |
| CLI e desktop host escrevem keys de credenciais diferentes ao mesmo tempo | Persistência de credenciais compartilhadas | As duas alterações são preservadas e não ocorre lost update do arquivo inteiro                              |
| O arquivo de credenciais é JSON inválido ou com schema inválido | Recuperação de credenciais       | A gravação falha, o arquivo original não é sobrescrito e um backup diagnosticável é produzido              |
| Uma única espera de autorização expira ou é encerrada | Ciclo de vida da transação OAuth | Só o callback/verifier deste state é limpo, sem afetar outros states pendentes                            |

A consolidação das instâncias de adapter entre a página de configurações e a Session não faz parte desta correção.

O leader/lease de OAuth entre processos e o single-flight do refresh-token já foram promovidos a definitivo depois de obter evidência de runtime com processos/PIDs reais, e se tornaram o design de conexão em duas fases da v4, descrito em `docs/mcp-oauth-two-phase.md`. Esse design substitui a formulação anterior de "por enquanto não adicionar" desta seção:

- A conexão passiva passa a usar um `AuthProvider` puro, sem listener, sem discovery e sem DCR;
- Todos os refreshs (ativo e reativo) convergem para um único refresh lock entre processos, independente do arquivo de credenciais;
- A autorização interativa é serializada por um lock de autorização dedicado, com single-flight em dois níveis (entre processos e dentro do processo), e o client do DCR permanece apenas em memória durante a transação de autorização;
- O canonical pair ganha um `generation` único por publicação, e a invalidação passa a usar uma transação condicional por generation.

## Fronteira de refresh status-only na página de configurações

- OAuth pendente, o follow-up após o callback de autorização e o refresh de retorno do navegador para o app usam uniformemente `mcp/list mode=status`, lendo apenas o status de runtime sem executar a convergência do conjunto de conexões.
- O `connect` total normal continua responsável por adições, remoções, mudanças de configuração e convergência de servers obsoletos; se um server de mesmo nome não mudou de configuração e já tem um OAuth authorization-code aguardando callback, a convergência repetida precisa reutilizar aquela conexão pendente, sem encerrar o callback/session nem gerar uma nova authorization URL.
- O cache pending/follow-up, o readiness de carregamento da configuração, o enfileiramento de requisições e a mesclagem de respostas precisam estar vinculados a `workspaceKey = workspaceIdentity?.trim() || workspacePath`. Ao trocar de workspace, a configuração e os caches OAuth antigos são limpos imediatamente; um runner do workspace antigo que ainda não enviou é descartado direto, e o resultado de uma requisição já enviada também não pode ser mesclado no novo workspace — menos ainda enviar env, headers ou o OAuth `clientSecret` do workspace antigo para um Agent local ou remoto novo.
- O follow-up é uma janela de retry limitada disparada na borda de desaparecimento do pending; depois de criada, um merge de status snapshot do mesmo workspace não pode limpá-la. A janela só termina quando o retry se esgota, quando há troca de workspace, quando se entra novamente em pending ou quando a interrupção do polling é explícita.
- O polling do estado pending usa um deadline de 5 minutos em tempo de parede, calculado no momento da criação da janela; o deadline é verificado antes de cada agendamento e depois de cada requisição concluída, e a duração não pode ser aproximada pelo número de requisições, para que requisições lentas não ampliem a janela de polling para várias horas.
- O status-only e o connect total usam epochs de requisição independentes; o status-only apenas avança o próprio epoch, sem limpar authorization/tool count, sem projetar outras linhas changed/unknown como connecting e sem invalidar o resultado de um connect em andamento.
- Quando o status-only falha, a página de configurações preserva o status snapshot, a authorization URL e o estado de conexão dos demais MCPs existentes; não pode limpar o snapshot nem marcar erros em lote como se fosse uma falha do connect total.
- Se um Agent antigo rejeitar `mode=status`, o service não pode omitir `mode` e repetir silenciosamente o `connect` padrão; deve retornar um código de erro estável de "status-only não suportado". Depois de reconhecer esse erro, a página de configurações preserva o snapshot de UI existente, interrompe o polling temporizado de pending/follow-up e o refresh de foco, e informa uma única vez ao usuário que é preciso fazer upgrade ou reiniciar e reabrir as configurações de MCP para executar um refresh completo; a sondagem só é liberada após trocar de workspace ou executar com sucesso um refresh total explícito, evitando alertas contínuos ou que o caminho de compatibilidade altere o conjunto de conexões de runtime.

## Fundamentos normativos

- MCP Authorization specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- TypeScript SDK OAuth providers: https://www.npmjs.com/package/@modelcontextprotocol/sdk

## Não objetivos

- Não afundar o token OAuth no desktop main, no relay ou no estado de negócio do web remote; o comportamento OAuth existe somente no transport HTTP/SSE do agent MCP adapter.
- Não criar um Agent runtime separado nem um MCP runtime separado para o `/remote` do celular.
- Não implementar OAuth WebView embutido no renderer nem login em pop-up; a interação continua usando o navegador do sistema + callback em localhost, e o botão da página de configurações apenas abre explicitamente a mesma authorization URL.
- Não adicionar fluxo OAuth ao MCP stdio.

## Verificação

A verificação automatizada precisa cobrir:

- O schema de configuração aceita `oauth.authorization_code` e `oauth.client_credentials` de HTTP/SSE, e rejeita configurações sem os campos obrigatórios.
- O DTO do ZCode Protocol preserva a configuração `oauth` nas cadeias de session create/resume/mcp list.
- O MCP adapter passa `authProvider` para os transports HTTP/SSE, e os headers estáticos são preservados.
- O MCP status snapshot retorna a authorization URL quando há um OAuth authorization_code pendente, e a página de configurações exibe o botão de abertura manual.
- O teste de ponta a ponta confirma que um MCP server Streamable HTTP protegido conecta com sucesso e lista ferramentas após 401 -> redirect de autorização -> callback code -> token -> retry.
- Um authorization server fake estrito devolve um client diferente a cada registro dinâmico e valida o vínculo de authorization code, client, redirect URI e challenge/verifier S256; dois adapters concorrentes precisam concluir a autorização separadamente.
- Depois das transações concorrentes, o canonical client/tokens persistidos precisam vir da mesma transação; um novo provider que faz refresh com esse par não pode voltar a uma autorização duplicada.
- Quando uma transação falha e dispara a invalidação de credenciais, ela não pode apagar o canonical pair recém-publicado por outra transação.
- Escritas concorrentes no mesmo processo e em processos Node independentes no arquivo de credenciais compartilhado não perdem keys.
- O CLI adapter e o desktop credential service, ao encontrar um arquivo de credenciais corrompido, ambos se recusam a sobrescrevê-lo e preservam a evidência `.corrupt-*.bak`.
- Quando a mesma credencial corrompida é lida várias vezes no mesmo processo ou em processos diferentes, o backup é idempotente por conteúdo e tem permissão `0600`; só depois que o conteúdo muda uma nova evidência de diagnóstico é criada.
- Depois que um novo provider publica, um provider antigo ainda consegue ler o legacy pair; e, depois que um provider antigo faz refresh ou invalida, um novo provider não pode continuar lendo o canonical obsoleto.