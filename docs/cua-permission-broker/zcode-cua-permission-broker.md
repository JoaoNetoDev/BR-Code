# ZCode CUA Permission Broker

## Limite de produto

### Overrides de migração do node_repl em 2026-08

O CUA não registra nem inicia um MCP `zcode-cua` independente. O modelo vê apenas as ferramentas do `node_repl` compartilhado (três no momento em que este texto foi escrito;
`js_reset` e `js_add_node_module_dir` foram removidos em 2026-09-18, restando apenas `js`);
`computer-use-client.mjs` injeta `agent.computerUse` dentro do Worker, e as requisições são roteadas, por uma bridge local com autenticação de uso único, até a `CuaControlPort` do shared-host. O socket/token do broker são restaurados apenas para o subprocesso confiável do node_repl;
a antiga entrada de injeção de argv/env do CUA, os antigos aliases de MCP e a antiga configuração de server são todos descartados pelo bootstrap;
as descrições nas seções históricas sobre "injetar o server zcode-cua" são mantidas apenas como modelo de ameaça anterior à migração, e não como caminho de execução atual.

O caminho de desktop permanece `desktop-continuous`, e o caminho de celular só pode se anexar como `web-remote-replayable` a um host de desktop já existente.
Helper, TCC, validade de frames, kill switch, input hold e `possibly_sent` continuam executados dentro do runtime; relay/main não hospeda esse estado.

O CUA de produto roda por meio do `ZCode Computer Use.app` assinado. O ZCode inicia esse helper com um socket Unix recém-gerado e um token de autenticação, aguarda o `broker_info` e injeta as credenciais no host do `node_repl` compartilhado; a CuaControlPort do host é a única bridge de execução entre SDK e Helper.

O broker precisa falhar de forma fechada (fail closed):

- Se o helper estiver ausente, não puder ser iniciado, rejeitar o token ou não ficar saudável, o ZCode não deve injetar credenciais do broker.
- Se `broker_info.bundle_id` estiver presente e não for `dev.zcode.cua-helper`, a inicialização do produto deve falhar com `CuaHelperError`; um warning não é suficiente, porque as concessões do TCC pertenceriam à identidade de processo errada.
- O modo de produto desktop mantém o Helper como proprietário do TCC. Python/uvx nunca deve se tornar o dono implícito das permissões.
- O token do broker é uma **credencial bearer com escopo restrito ao server MCP `zcode-cua` alvo**. Ele deve ser injetado no `env`/args do próprio server, não deve ser **retido/herdado** no env global de runtime do agente e não deve alcançar outros servers MCP, hooks ou subprocessos de Bash/ferramentas (um token vazado permite que qualquer processo do mesmo agente controle o Helper dono do TCC — o confused-deputy que este design previne). A única exceção é uma entrega _transitória_ e delimitada no caminho global da CLI: `node.ts` coloca socket/token no env de spawn do agente, mas a sanitização da entry da CLI **os captura em um store privado do processo e os apaga de `process.env` antes de qualquer código de bootstrap/ferramenta rodar** (veja a descrição dos dois caminhos abaixo) — de modo que nunca ficam retidos no env global de runtime nem são herdados por nenhum filho. `sanitizeZCodeRuntimeEnv` remove `ZCODE_CUA_PERMISSION_BROKER_TOKEN`/`_SOCKET` de todos os envs de filhos abertos (e do passthrough de env de ferramenta), enquanto o resolver desktop/CLI os reinjeta apenas no env do server `zcode-cua`. Dois caminhos de entrega, ambos seguros quanto à sanitização: (a) um `zcode-cua` **iniciado pelo desktop** recebe socket/token pelo `env` por server em `mcpServers` do `session/create` (spread _depois_ de `buildMcpStdioEnv`), sem tocar em `process.env`; (b) um `zcode-cua` declarado no **`~/.zcode/cli/config.json` global** chega no `process.env` do filho da CLI, onde a sanitização da entry da CLI **captura** o socket/token em um store privado em memória _antes_ de apagá-los de `process.env`, e o resolver de bootstrap da CLI lê esse store (não `process.env`) para injetá-los no env do server `zcode-cua`. Ler `process.env` diretamente falharia de forma fechada aqui: sem o tuple capturado do broker o `zcode-cua` global é **omitido por completo**, em vez de iniciado cru. Um token gravado em disco (o `--token-file` de uso único) é uma exposição de mesmo UID, então o broker adiciona **verificação de par** como segunda barreira obrigatória em produto. Como `--launcher-pid` é fornecido pelo chamador, a barreira de ancestralidade só significa alguma coisa uma vez que o launcher seja _comprovadamente_ o ZCode — caso contrário um atacante poderia passar o _seu próprio_ pid como `--launcher-pid`, gerar seu próprio `--token-file`, fazer `open` do `ZCode Computer Use.app` já autorizado e conectar a partir da sua própria árvore de processos. Por isso o Helper primeiro verifica, via `SecCodeCheckValidity` nativo no processo de `--launcher-pid` (`verifyProcessCodeSignature`), que o launcher satisfaz o requisito de assinatura de código do ZCode — `anchor apple generic and identifier "dev.zcode.app" and certificate leaf[subject.OU] = "8A5X4JJ39T"` (bundle id + Team-pin, sobrescrevível via ambiente com `ZCODE_CUA_LAUNCHER_BUNDLE_ID` / `ZCODE_CUA_HELPER_TEAM_ID`). Só então aceita uma conexão cujo par (a) tem o uid atual e (b) está na árvore de processos desse launcher ZCode verificado (`getpeereid` nativo + `LOCAL_PEERPID`, percorridos até `--launcher-pid`). Resultado: um processo de mesmo UID fora da árvore do ZCode _genuíno_ é rejeitado, e um launcher pid autodeclarado/forjado não pode se passar pelo ZCode. O modo de produto **falha de forma fechada** se alguma barreira não puder ser estabelecida (`--launcher-pid` ausente ou não verificável, uma build nativa sem `verifyProcessCodeSignature`/`getPeerCredentials`, ou um launcher que não corresponde ao requisito do ZCode). Residual (registrado como issue #7): um irmão genuíno descendente do ZCode que lê ativamente o token-file dentro da sua breve janela de uso único ainda está dentro da árvore aceita; fechar isso completamente exige fixar o token ao pid exato do `zcode-cua` (um vouch/reverse-handshake), continuação desta barreira de ancestralidade + identidade do launcher + escopo de env do token acima.
- O requisito de código padrão do launcher é `anchor apple generic and (identifier "dev.zcode.app" or identifier "dev.zcode.app.preview") and certificate leaf[subject.OU] = "8A5X4JJ39T"`. Isso substitui a string de requisito exclusiva de produção mantida na narrativa histórica de modelo de ameaça acima. Não deve ser ampliado para um requisito apenas de Team, porque outro app assinado pelo mesmo Team não é um launcher CUA autorizado. `ZCODE_CUA_LAUNCHER_BUNDLE_ID` permanece um override de desenvolvimento, de id único.
- O Helper é um sujeito de autorização **exclusivamente macOS local de desktop**. Um host `desktop-attached-remote` (mobile `/remote`, workspaces SSH/WSL/container) NÃO deve auto-instalar nem iniciar o Helper, rodar o reaper de órfãos ou ligar o resolver MCP de produto — sessões remotas se anexam pelo host de desktop compartilhado, em vez de erguer uma cadeia de permissões separada no remoto. `createLocalServices` garante isso via `shouldCreateDefaultCuaProductHelper` (false para `desktop-attached-remote`). Suporte remoto a macOS, caso algum dia seja adicionado, precisa antes de um spec próprio de instalação/autorização/UI/falha.
- O CUA de produto é habilitado por padrão nas plataformas de desktop suportadas. `ZCODE_CUA_PRODUCT_HELPER=0|false|off`
  é o kill switch explícito; o modo desabilitado não tem pegada alguma: sem objeto host, varredura de reaper de órfãos,
  injeção de resolver, processo Helper ou prompt de TCC. O Helper continua sob demanda e é instalado
  no primeiro uso de CUA a partir da cópia assinada dentro de `ZCode.app/Contents/Resources/cua-helper/`; a produção nunca
  o baixa e falha de forma fechada se esse bundle estiver ausente ou inválido.
- **Reverificar antes de cada lançamento (não só na instalação).** A instalação verifica o bundle e remove seu xattr de quarantine, de modo que `open` não o reavalia pelo Gatekeeper. Verificar apenas na instalação checa um inode, enquanto um `launch` posterior poderia executar outro — um atacante de mesmo UID pode sobrescrever `…/computer-use/ZCode Computer Use.app/Contents/MacOS/…` depois da instalação e fazer com que ele seja iniciado com TCC (as barreira de par/token decidem apenas _quem conecta_, não _qual binário iniciou_). Por isso `cuaHelperHost.doStart` reexecuta `verifyInstalled` (signature / Team / bundle / version) no `Helper.app` resolvido imediatamente antes de `launcher.launch`, minimizando a janela TOCTOU; uma verificação que falha nunca lança.
- Uma execução direta da CLI `zcode` (não iniciada pelo ZCode desktop) que tenha um `zcode-cua` global mas nenhum socket de broker resolvível **omite `zcode-cua` (fail-closed) no macOS**, em vez de rodá-lo sem o broker possuído pelo Helper. Isso é incondicional — não exige `ZCODE_CUA_PERMISSION_BROKER_UNAVAILABLE` definido. Um `zcode-cua` cujo próprio `env` por server já carrega o socket do broker (caminho desktop `session/create`) é mantido; o dev local pode optar por rodar cru com `ZCODE_CUA_HELPER_ALLOW_UNAUTHENTICATED_LOCAL=1`.
- O matcher de `zcode-cua` (`@zcode/shared` `mcp.ts`, fonte única de verdade para ambas as entradas de injeção) precisa reconhecer toda forma que resolve para o pacote real — incluindo `python -m zcode_cua.server` (submódulo com ponto) e caminhos locais com separador final (`…/zcode-cua/`) — porque uma correspondência perdida é fail-open (nenhum broker injetado → dono TCC cru), enquanto um over-match é fail-closed (injeção inofensiva de broker).

## Contrato de Resultado de `open_application`

`open_application` tem permissão para reportar sucesso de dispatch do LaunchServices antes de a lista de aplicações AX ter sido atualizada. Isso evita um falso negativo em que um navegador abre visivelmente uma URL, mas o resolver AX imediato ainda não encontra o processo.

O resultado tem três níveis de confiança:

- **AX resolvido:** `pid` é positivo e vem do resolver de aplicações AX.
  Esta é uma referência de app com escopo de processo.
- **Hint de pid de lançamento:** `pid` é positivo e vem do hint de launcher da
  plataforma. No macOS, quando `bundle_id` é fornecido, o hint deve resolver primeiro o
  `CFBundleExecutable` do bundle e só então buscar o PID desse executável. Não deve
  usar o `name` de exibição como fallback para um lançamento de bundle, porque isso
  pode selecionar um processo em execução sem relação.
- **Confirmação apenas de dispatch:** `pid` é `null`, com o `bundle_id` e/ou `name`
  solicitado. Isso prova apenas que o LaunchServices aceitou a requisição de abertura.
  Os chamadores não devem tratar isso como referência com escopo de processo para
  teclado/input no escopo do app. Devem reobservar ou resolver por bundle/nome antes
  de enviar input com escopo de processo.

Falha real do launcher ainda falha de forma fechada com `permission_denied`. Somente um
dispatch bem-sucedido pode produzir uma confirmação com `pid:null`.

## Diagnósticos do Sujeito de Autorização

`broker_info.authorization_subject` e `request_access.owner` expõem a identidade de runtime que o macOS verá nos prompts de Accessibility, Screen Recording e Automation.

O broker_info padrão do helper deve incluir os campos que podem ser obtidos de forma confiável sem dependências extras:

- `kind`
- `bundle_id`
- `display_name`
- `version`
- `pid`
- `app_bundle_path`
- `code_signing_identifier`
- `team_identifier`
- `signature`
- `stable_identity`
- `warnings`

Em builds macOS empacotadas, `code_signing_identifier` e `team_identifier` vêm de `/usr/bin/codesign -dv --verbose=4`. Em desenvolvimento ou testes não-macOS, dados de assinatura ausentes são permitidos, mas devem ser reportados como diagnósticos em vez de fingir silenciosamente que a identidade é estável.

## Modos de consulta do status de permissão

O status de permissão no macOS tem dois modos deliberadamente diferentes:

- Opções omitidas ou `includeFunctionalProbes:false` é somente leitura. O montagem de Settings, o polling por timer,
  o foco de janela e a atualização comum usam este modo e nunca devem fazer captura de pixels.
- `includeFunctionalProbes:true` é uma sonda de pixel ativa. A superfície de Settings pode solicitá-la apenas
  uma vez, após um retorno explícito de permissão ou um restart bem-sucedido do Helper.

O renderer faz coalesce de requisições de atualização concorrentes com semântica de OU. No máximo uma consulta enfileirada carrega
a flag ativa; atualizações somente leitura posteriores não podem apagá-la. Uma mudança de workspace/contexto invalida a
requisição enfileirada e qualquer resultado tardio. Depois que um resultado ativo estabelece prontidão, o snapshot
sticky-ready local do renderer pode preservar esse resultado enquanto o polling subsequente permanece somente leitura.
Anexação remota/mobile nunca origina essa sonda e nunca cria um Helper.

## Contrato do SDK node_repl compartilhado

O `@zcode/zcode-cua-plugin` incluído é um pacote de skill/docs/SDK. `scripts/computer-use-client.mjs`
faz bootstrap de `agent.computerUse` dentro de cada Worker `node_repl` compartilhado novo. Nunca expõe ao Worker socket/token/módulos nativos do broker; o host compartilhado valida o contexto de requisição autenticado e
delega ao runtime fixado `@zcode/zcode-cua`. Não existe um launcher MCP CUA independente nem uma projeção
`mcp__computer-use__*` visível ao modelo. A proveniência de release continua pertencendo ao bundle SEA assinado,
a codesign/notarização e às barreiras existentes de atestação do Helper/runtime.

O wrapper agora é um script de SDK e não constrói um `dist/mcp/server.js` de CUA. Somente o Browser Use é dono do server MCP `node_repl` incluído; o seeding de CUA copia `scripts/computer-use-client.mjs`, docs e Skill.
Não restaure uma entrada de manifest `mcpServers` de CUA nem um segundo launcher.

`stable_identity=true` significa que a identidade de runtime é um app bundle assinado cujo signing identifier corresponde ao bundle id esperado e tem um team identifier. Caso contrário, `warnings` deve explicar qual sinal está ausente ou divergente.