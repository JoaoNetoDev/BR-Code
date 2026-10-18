# Relatório de auditoria de segurança (2026-06-09)

## Escopo da auditoria

- Repositório: `/Users/dev/workspace/z-code`
- Alvo da varredura: código-fonte, configurações, scripts, exemplos em documentação, arquivos atualmente rastreados pelo Git, parte do histórico Git e a árvore de dependências de produção.
- Foco: vazamento de AK/SK, armazenamento de credenciais, exposição via Electron/IPC, interfaces Web/controle remoto, execução de comandos, redação de logs em logs, vulnerabilidades de dependências.
- Não realizado: teste de invasão real, verificação de runtime via CDP/captura de pacotes, auditoria do código do lado servidor de relays de terceiros.

## Comandos executados

- Varredura por regras com `rg`: AK/SK, tokens OpenAI/GitHub/Google/AWS/Slack, blocos de chave privada, APIs perigosas, IPC, CORS, execução de comandos.
- Varredura de padrões sensíveis nos arquivos atualmente rastreados com `git grep`.
- Varredura de padrões sensíveis no histórico Git com `git log -G`.
- Auditoria de vulnerabilidades nas dependências de produção com `pnpm audit --prod --json` (executada com rede).
- `pnpm lint`
- `pnpm typecheck`

## Conclusão geral

Nenhum AK/SK, chave privada ou chave de longo prazo de fornecedor de nuvem em texto claro com alta confiança foi encontrado nos arquivos atualmente rastreados. As ocorrências com aparência de chave são principalmente placeholders de documentação, valores falsos de teste e amostras de teste redigidas.

Há quatro classes de riscos reais que exigem tratamento prioritário:

1. As dependências de produção apresentam 19 vulnerabilidades high, 42 moderate e 4 low, concentradas em `axios`, `protobufjs`, `basic-ftp`, `fast-uri`, `mermaid`, `dompurify` e `hono`.
2. Os scripts de publicação ainda trazem embutidos o usuário padrão do Docker registry e a senha padrão `123456`, o que constitui um caminho de credenciais fracas potencialmente abusáveis.
3. O servidor HTTP Web não tem autenticação em `/ws` e `/api/connect-remote`; se for vinculado a um host não local ou exposto por um proxy reverso, expõe diretamente a capacidade de serviço de workspace local/remoto.
4. O fallback secret de criptografia de credenciais é derivado de `platform + homedir + username`, o que não resiste a um processo local do mesmo usuário nem à descriptografia offline após o acesso ao arquivo de configuração.

## Detalhes das descobertas

### P0: dependências de produção apresentam vulnerabilidades de nível high

Evidências:

- `pnpm audit --prod --json` retornou: `critical=0`, `high=19`, `moderate=42`, `low=4`.
- Total de dependências de produção: 1246.

Resumo dos módulos de alto risco:

| Módulo | Versão atual | Caminho | Resumo do risco | Versão sugerida |
| --- | --- | --- | --- | --- |
| `axios` | `1.13.6` | `packages__desktop>@larksuiteoapi/node-sdk>axios` | vários casos de prototype pollution, vazamento de credenciais de proxy, sequestramento de requisição, ReDoS/DoS | `>=1.16.0` ou atualização pelo dependente |
| `protobufjs` | `7.5.5` | `packages__desktop>@larksuiteoapi/node-sdk>protobufjs` | gadget de geração de código após prototype pollution, DoS recursivo, caminho de opção inseguro | `>=7.5.8` |
| `basic-ftp` | `5.2.2` | `apps__zcode-cli>proxy-agent>pac-proxy-agent>get-uri>basic-ftp` | servidor FTP malicioso pode provocar DoS de memória/buffer de resposta no cliente | `>=5.3.1` |
| `fast-uri` | `3.1.0` | `apps__zcode-cli__packages__adapters>@modelcontextprotocol/sdk>ajv>fast-uri` | confusão de authority/path percent-encoded, podendo afetar decisões de SSRF/path traversal | `>=3.1.2` |

Outros pontos relevantes moderate/low:

- `mermaid@11.14.0`: injeção de CSS/HTML, DoS em Gantt, caminho `packages__ui>@streamdown/mermaid>mermaid`, sugerido `>=11.15.0`.
- `dompurify@3.3.3`: múltiplos bypass de sanitizer, caminho `packages__ui>@streamdown/mermaid>mermaid>dompurify`, sugerido `>=3.4.0`.
- `hono@4.12.12`: vários problemas moderate/low em JWT scheme, cookie/header, bodyLimit e injeção de JSX, caminho `apps__zcode-cli__packages__debug>hono`, sugerido `>=4.12.21`.
- `electron@41.0.3`: advisories Electron low/moderate, caminho `packages__desktop>@arms/rum-electron>electron`, sugerido `>=41.1.0`.

Sugestões de correção:

- Priorizar uma avaliação de viabilidade de `pnpm update axios protobufjs basic-ftp fast-uri mermaid dompurify hono electron --latest -r`.
- Para dependências transitivas como `@larksuiteoapi/node-sdk`, `@modelcontextprotocol/sdk` e `@streamdown/mermaid`, priorizar a atualização das dependências diretas; se não for possível a curto prazo, usar `overrides` do pnpm para fixar a versão com patch e rodar regressão.
- Antes da correção de Mermaid/DOMPurify, manter a renderização de Mermaid estritamente em sandbox ou desativar a renderização de diagramas não confiáveis.

### P1: scripts de publicação Docker trazem credenciais fracas padrão embutidas

Evidências:

- `scripts/docker-build-and-push-web-remote-control.sh:6-8`
- `scripts/docker-build-and-push-web-remote-control-test.sh:6-8`
- `scripts/docker-build-and-push-web-remote-control-v3.sh:6-8`

Situação atual:

- O usuário padrão é um e-mail pessoal.
- A senha padrão é `123456`.
- Os scripts apenas imprimem um aviso, mas continuam com o `docker login`.

Risco:

- Se o registry ainda aceitar essa senha, qualquer pessoa que obtenha o script consegue enviar imagens.
- Mesmo que a senha já tenha expirado, isso incentiva o uso indevido de credenciais fracas em CI/local e cria nos logs a expectativa errada de que a senha padrão funciona.

Sugestões:

- Remover o usuário padrão e a senha padrão, exigindo `DOCKER_REGISTRY_USERNAME` e `DOCKER_REGISTRY_PASSWORD`.
- O caminho de senha padrão deve falhar diretamente, sem permitir que o login prossiga.
- Rotacionar as senhas das contas de registry relacionadas e verificar os pushes recentes no repositório de imagens.

### P1: o servidor HTTP Web expõe capacidade de RPC/conexão remota sem autenticação

Evidências:

- `packages/server/src/http.ts:80-92`: `/ws` cria um ChannelServer local de serviço, sem autenticação.
- `packages/server/src/http.ts:95-114`: `/api/connect-remote` recebe parâmetros de conexão remota, sem autenticação.
- `packages/server/src/http.ts:159-188`: `/ws/remote/:id` obtém a conexão por id aleatório, sem verificação adicional de identidade.
- `packages/server/src/entry-http.ts:6-7`: porta padrão 3030, sem restrição explícita de hostname.

Risco:

- Se esse server for vinculado a um endereço não loopback, a um mapeamento de porta de container, a um proxy reverso interno ou a um ambiente de debug exposto, um atacante consegue se conectar ao serviço RPC e alcançar ainda mais capacidades de serviço como file/system/terminal/git.
- `/api/connect-remote` pode ser usado para iniciar tentativas de conexão SSH/WSL/Docker, formando superfície de sondagem lateral ou exposição de credenciais.

Sugestões:

- Fazer `createHttpServer` vincular explicitamente `127.0.0.1` por padrão.
- Introduzir um bearer token aleatório local ou um session token vinculado à origem; `/ws`, `/api/connect-remote` e `/ws/remote/:id` devem ser todos validados.
- Se o modo Web for usado apenas para desenvolvimento local, indicar "não expor à rede pública" nos logs de inicialização e na documentação, e desabilitar entradas sem autenticação nas builds de produção.

### P1: o fallback secret de criptografia de credenciais é derivável

Evidências:

- `packages/services/src/credential/providers/credentialCipherProvider.ts:23-37`
- `apps/zcode-cli/packages/adapters/src/auth/credential-cipher.ts:87-100`

Situação atual:

- O AES-256-GCM usa IV aleatório, e a escolha do algoritmo é razoável.
- Se `ZCODE_CREDENTIAL_SECRET` não estiver definido, a chave é derivada de `platform + homedir + username`.

Risco:

- Um processo local malicioso do mesmo usuário, um processo local que obtenha o diretório de configuração ou um ambiente que tenha vazado o home path/username podem todos derivar a chave offline.
- Isso não equivale ao nível de proteção do keychain do SO ou do `safeStorage` do Electron.

Sugestões:

- No lado Desktop, migrar preferencialmente para o `safeStorage` do Electron ou para uma chave gerenciada pelo chaveiro do sistema.
- No fallback de CLI/host, gerar ao menos uma master key aleatória de uso único, protegida separadamente por permissões do SO, evitando a derivação a partir de strings previsíveis.
- Fazer migração na leitura das credenciais antigas `enc:v1` para o novo formato de versão.

### P2: o `openExternal` do Electron tem uma entrada IPC não validada

Evidências:

- `packages/desktop/src/preload/index.ts:309`
- `packages/desktop/src/main/desktopMainIpcRemote.ts:90-92`

Situação atual:

- O renderer pode enviar qualquer string para o main via `window.zcode.openExternal(url)`.
- O main chama `shell.openExternal(url)` diretamente, sem allowlist de protocolos.
- Outro caminho de popup de webview já possui validação `isAllowedEmbeddedBrowserNewWindowUrl`, o que mostra que o projeto já tem um padrão de proteção adjacente.

Risco:

- Se um XSS no renderer, um tratamento malicioso de markdown/link ou um script de supply chain conseguir chamar a bridge, pode acionar handlers de protocolo não desejados.
- O impacto é limitado pelas políticas de tratamento de protocolos do Electron/SO, mas deve haver uma allowlist como última defesa no processo main.

Sugestões:

- Implementar de forma unificada `openExternalSafe(url)` no processo main, permitindo apenas `http:`/`https:` e, se necessário, os deep links customizados explicitamente necessários ao projeto.
- Registrar um log warn para os itens rejeitados, sem registrar a query completa e sensível da URL.

### P2: a URL do QR code do controle remoto Web carrega `passHash`

Evidências:

- `packages/shared/src/web-remote-control.ts:254-283`
- `packages/desktop/src/main/webRemoteControlRelayAuthProvider.ts:17-22`

Situação atual:

- `passHash = sha256(password)`, e o parâmetro do QR code se chama `hash`.
- A prova de autenticação posterior usa `HMAC-SHA256(passHash, nonce|role|deviceSid)`.

Risco:

- `passHash` é na prática um segredo equivalente a bearer, e não um hash comum inutilizável; capturas de tela do QR code, histórico do navegador, logs de proxy e vazamento por Referer podem entregar ao atacante uma credencial de pareamento reutilizável.
- Já existem as semânticas `resetPairing`/`leaked-qr`, o que mostra que o cenário de vazamento foi considerado, mas a query da URL ainda amplia a superfície de vazamento.

Sugestões:

- Trocar o `passHash` de longo prazo do QR code por um pairing token de curto prazo e uso único, com a credencial persistente negociada ou emitida por relay/device após o pareamento bem-sucedido.
- Definir um tempo de expiração para o QR code e fazer o relay validar `t` e o consumo único obrigatoriamente.
- Remover o parâmetro `hash` da barra de endereços imediatamente após a entrada no mobile.

### P2: CORS global no server Hono de debug

Evidências:

- `apps/zcode-cli/packages/debug/server/index.ts:29-31`
- `apps/zcode-cli/packages/debug/server/index.ts:107-119`

Situação atual:

- O host padrão é `127.0.0.1`, um bom design para reduzir o risco.
- `app.use("*", cors())` habilita acesso cross-origin para todas as APIs de debug.

Risco:

- Se o usuário expuser o server de debug com `host=0.0.0.0` ou por meio de um proxy reverso, qualquer página web pode ler informações de traces/network capture.
- A API de debug contém ativos sensíveis de debug, como trace, requisições de rede e certificado CA.

Sugestões:

- Por padrão, permitir no CORS apenas a origin da UI local; ao expor fora do loopback, exigir um token explícito.
- Para endpoints sensíveis como `/api/network/ca.pem`, adicionar um token local ou um secret aleatório gerado na inicialização.

### P3: o `.env` local atual contém uma API Key real da OpenAI, mas não é rastreado pelo Git

Evidências:

- O `.gitignore` já ignora `.env`.
- `git ls-files` não inclui `.env`.
- Existe `OPENAI_API_KEY` no `.env` local, de comprimento 56. O relatório não registra o valor original.

Risco:

- Atualmente não está no repositório, mas existe uma chave real no workspace local; cópias posteriores, empacotamento, saída em logs ou commit manual ainda podem vazar.

Sugestões:

- Confirmar se a key ainda é necessária; se não for, removê-la imediatamente ou migrá-la para o armazenamento de credenciais do sistema.
- Se a key foi usada em testes ou pode ter sido exposta por terminal/logs, recomenda-se rotacioná-la.
- Manter `.env` ignorado; ao adicionar um `.env.example`, escrever apenas placeholders.

### P3: o histórico Git já contatou campos OSS de placeholder em `.env.production`

Evidências:

- `.env.production` atualmente contém apenas constantes de links de produção e o client id público do OAuth, sem guardar a escolha atual de ambiente do produto.
- `git log -- .env .env.production .env.local .env.e2e.local` mostra 5 entradas de histórico relevantes.
- No commit `60345957e`, o `.env.production` continha `OSS_ACCESS_KEY_ID` e `OSS_ACCESS_KEY_SECRET`, ambos de comprimento 7, com formas mascaradas `yo***ak` / `yo***sk`, o que indica com maior probabilidade valores de placeholder e não AK/SK reais.

Risco:

- Não foram encontrados AK/SK reais da OSS, mas arquivos de ambiente já entraram no histórico de versões, o que mostra que o processo já permitiu configuração sensível no Git.

Sugestões:

- Se não for possível confirmar com certeza absoluta que esses valores são placeholders, tratá-los como vazamento e rotacionar as credenciais OSS relacionadas.
- Adicionar secret scanning em pre-commit/CI, por exemplo gitleaks ou trufflehog.

## Controles positivos confirmados

- O `.gitignore` já ignora `.env`, `.env.local` e `.env.*.local`.
- A exportação de logs possui lógica de redação de campos sensíveis, cobrindo token, authorization, password, api key, query de URL etc., com comentários de bugfix e testes relacionados a UTF-16.
- A janela principal do Electron usa `contextIsolation: true` e `nodeIntegration: false`.
- O caminho de popup de webview já tem allowlist de URL e política de negação de window open.
- Senhas SSH remotas e passphrases de chave privada são salvas pelo credential service, sem gravação direta no histórico do workspace.

## Resultados de verificação

- `pnpm lint`: passou, 0 error, 74 warning (todos warnings de lint preexistentes de variáveis/imports não usados etc.).
- `pnpm typecheck`: passou.
- `pnpm audit --prod --json`: falhou com código de saída 1 por haver vulnerabilidades; a auditoria com rede retornou a lista de vulnerabilidades com sucesso.
- `git status --short`: limpo antes da auditoria; o arquivo deste relatório é a única novidade desta rodada.

## Prioridade sugerida de correção

1. Vulnerabilidades de dependências: priorizar `axios`, `protobufjs`, `basic-ftp`, `fast-uri`, `mermaid`/`dompurify`.
2. Remover as credenciais fracas padrão dos scripts de publicação Docker e rotacionar as contas de registry relacionadas.
3. Adicionar bind local e autenticação às entradas HTTP/WS de `packages/server`.
4. Reestruturar a master key de credenciais: migrar do fallback derivável para o chaveiro do sistema ou para uma master key aleatória.
5. Validar de forma unificada o protocolo de URL do `openExternal` no processo main.
6. Trocar o QR code do controle remoto Web por um token de curto prazo e uso único, e limpar a query da URL.
7. Adicionar secret scanning no CI para impedir que `.env*` e chaves de alta confiança entrem no repositório.