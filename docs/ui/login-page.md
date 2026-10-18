# Login Page

Na fase de inicialização, se não houver usuário OAuth recuperado e não houver configuração de provedor de modelo disponível, o Root exibe a `WelcomeScreen`.

Todos os pontos de entrada de login dentro do app convergem para a `WelcomeScreen` e reutilizam os fluxos de OAuth e API Key do `LoginPanel`, evitando múltiplas máquinas de estado entre login manual, onboarding de inicialização e conexão de provedor de modelo:

- Onboarding automático de inicialização: `WelcomeScreen`, aberta pelo guard de disponibilidade de provider
- Entrada de login manual: `WelcomeScreen`, aberta a partir da página de configurações ou da ação de login do workspace shell
- Conexão de provedor de modelo: `loginEntryRequest` abre a `WelcomeScreen` e inicia automaticamente o OAuth do provider especificado
- Contêiner do conteúdo de login: usa `bg-background`, `border-popover-border`, `shadow-md`

Após concluir o callback OAuth, salvar a API Key ou clicar em "Pular" no rodapé do formulário de API Key, a página de login fecha e volta à rota normal do Root.

Quando o usuário clica em "Pular" ou entra por outro caminho numa home de rascunho vazia sem modelos disponíveis, a home deve exibir a faixa de erro `modelConfigMissing` já existente, com entradas de upgrade e de configuração de modelo. Essa faixa apenas projeta a readiness local do provider e não dispara início de Agent, criação de deferred draft session, sondagem de rede nem retry de falha de preaquecimento; ela é removida automaticamente depois de salvar um provider/modelo válido e concluir a hidratação do modelo do rascunho.

Quando o rascunho vazio exibe simultaneamente o workspace / Git context header, a faixa de erro deve ficar como uma surface independente acima do shell do card de input, sem ser embutida no card arredondado que envolve o context header e o editor; entre a faixa e o card de input é fixado um espaçamento `mb-6` (24px). A ordem visual é fixa: "faixa de erro -> espaçamento independente -> selecionar workspace / branch Git -> input". Desktop e Web mobile usam a mesma ordem de DOM e a mesma hierarquia de contêiner; o layout responsivo só pode alterar quebra de linha e densidade, nunca mover a faixa de erro para baixo da entrada de workspace nem reintegrá-la ao shell do card de input.

O formulário de login por API Key exibe à direita a entrada de link externo `Get API Key` quando o campo está vazio; depois que o usuário digita ou preenche a API Key, a entrada é ocultada, evitando que o link ocupe o espaço de edição da chave. O destino do link acompanha o provider selecionado:

- Z.ai: `https://z.ai/manage-apikey/apikey-list`
- BigModel: `https://bigmodel.cn/apikey/platform`

Ao entrar pela primeira vez no formulário de login por API Key, o valor padrão do provider depende apenas do `locale` já resolvido pelo App: chinês simplificado (`zh-CN`) seleciona BigModel por padrão, inglês (`en-US`) seleciona Z.ai por padrão. Como o `locale` já contém o resultado da resolução da preferência "seguir o sistema", o formulário não lê separadamente o idioma do sistema nem o histórico de configuração de provider. Essa regra cuida apenas da inicialização do formulário; depois que o usuário troca o provider manualmente, a seleção atual não pode ser sobrescrita por causa da difusão de idioma.

O link externo deve ser aberto via `IPlatformService.openExternal()`, mantendo o comportamento do shell do desktop e o `window.open` da Web consistentes. O campo continua com tipo senha e com submissão por Enter; o botão de link serve apenas para navegar e obter a chave, sem participar do fluxo de salvamento.

O botão de cancelar do formulário de login por API Key exibe, no rodapé, um botão de link "Pular". Pular grava apenas `providerFamilyDomain`, `providerFamilyDomainUpdatedAt` e `providerFamilyDomainMigrated` correspondentes ao provider selecionado, para confirmar o domínio de execução de Z.ai / BigModel; não salva API Key, não dispara o evento de sucesso de login por API Key e não modifica `modelProviderFamilyModes`.

Depois que o onboarding automático de inicialização é concluído, há um novo caminho direto para o usuário: se nenhum workspace estiver aberto, o Root usa o conversation descriptor injetado pelo Main e, quando necessário, garante de forma idempotente a existência de `<dataBaseDir>/.zcode/workspace/default` via `fileService.ensureConversationWorkspace()`. Esse workspace fornece um cwd real, mas a UI mantém o estado "projeto não selecionado", permitindo que o usuário converse diretamente sem passar pela página de seleção de projeto. Se o usuário pular o login e ainda não houver modelo disponível, essa home de rascunho exibe a faixa `modelConfigMissing` conforme a regra anterior.

Depois que o login manual e a conexão de provedor de modelo são concluídos, apenas a `WelcomeScreen` é fechada e a interface original é restaurada; nenhum workspace padrão é criado.