# Estratégia de Seleção Inicial no Welcome de Model Provider

## Contexto

A WelcomeScreen hospeda ao mesmo tempo o login OAuth de conta e a entrada de configuração por API Key. As duas entradas têm intenções de usuário diferentes:

- O login OAuth indica que o usuário quer usar os benefícios do plano da conta.
- A entrada de API Key indica que o usuário quer configurar uma API Key da mesma marca.

O modo de conexão grava family mode / selected key e influencia qual grupo de modelos do menu de modelos da caixa de entrada é exibido dentro da mesma family, portanto a inicialização só pode acontecer sob uma intenção de entrada explícita.

A navegação à esquerda da página de configurações de Model Provider serve apenas para selecionar a provider family ou o custom provider. Start Plan / Coding Plan / Team Plan / API Key são modos de conexão dentro da mesma family e devem ser alternados pelo menu "连接方式" na área de detalhes à direita. A entrada da WelcomeScreen precisa decidir ao mesmo tempo a family à esquerda e o modo de conexão à direita; após o login, o provider, os benefícios de plano pessoal, o fallback de benefícios do plano de experiência (Start Plan) e o resultado do plano de equipe são atualizados de forma assíncrona, e se a seleção ocorrer já no primeiro frame da página de configurações, ela escolherá incorretamente a API Key ou o plano pessoal (Coding Plan).

## Regras

A WelcomeScreen não espera a consulta de plano terminar e mantém o ritmo atual de entrada no app. Ela grava apenas uma intenção de seleção inicial de uso único, consumida pela página de configurações de Model Provider.

### Camadas de Navegação e Modo de Conexão

- A navegação lateral à esquerda mostra apenas provider family / custom provider:
  - Z.ai
  - BigModel
  - outros Built-in provider
  - custom provider
- O menu "连接方式" à direita mostra os modos de conexão alternáveis dentro da mesma family:
  - Individual Plan / 个人套餐（个人）
  - Team Plan / 团队套餐（团队，按获取到的团队套餐逐项显示）
  - API Key
- Start Plan / 体验套餐 não é exibido como modo de conexão antes do login; ele só entra no menu de modos de conexão quando, após o login, se confirma que existe o benefício do plano de experiência e não há benefício de plano pessoal/equipe.
- Múltiplos Coding Plans de equipe não geram múltiplas entradas na navegação lateral; eles viram apenas múltiplas opções no menu de modos de conexão à direita.
- Depois que a navegação lateral seleciona a family, os detalhes à direita renderizam o Plan Card ou o formulário de API Key correspondente ao item de modo de conexão selecionado da family atual.

### Entrada de Login OAuth

Quando o usuário escolhe o login OAuth Z.ai ou BigModel pela WelcomeScreen, a página de configurações de Model Provider primeiro seleciona a entrada da navegação lateral da family correspondente e depois, dentro da mesma family, aguarda o estado dos modos de conexão se tornar decidível, selecionando uma única vez pela seguinte prioridade:

1. 个人套餐（Coding Plan，个人）：há benefício de Coding Plan pessoal.
2. 团队套餐（Coding Plan，团队）：o primeiro item de equipe no resultado de obtenção dos planos de equipe.
3. 体验套餐（Start Plan）：há benefício do plano de experiência.
4. 个人套餐（Coding Plan，个人）：quando não há benefício algum, ainda assim cai na entrada pessoal de Coding como fallback.

Matriz de estados completa:

| Start | Coding pessoal | Coding de equipe | Após o login, `modelProviderFamilySelectedKeys[family]` |
| ----- | -------------- | ---------------- | ------------------------------------------------------- |
| Sim   | Sim            | Sim              | Coding pessoal                                          |
| Sim   | Sim            | Não              | Coding pessoal                                          |
| Sim   | Não            | Sim              | Coding de equipe                                        |
| Sim   | Não            | Não              | Start                                                   |
| Não   | Sim            | Sim              | Coding pessoal                                          |
| Não   | Sim            | Não              | Coding pessoal                                          |
| Não   | Não            | Sim              | Coding de equipe                                        |
| Não   | Não            | Não            | Coding pessoal (fallback)                             |

Quando vários planos de equipe estão disponíveis ao mesmo tempo, usa-se o primeiro `subscribed === true` na ordem retornada pelo backend; quando esse time tem vários projetos, usa-se `teamProjects[0]` e, sem ID de projeto, o fallback sucessivo para o `projectId` de nível de product e depois para `"0"`, garantindo uma selected key estável.

A consulta do 体验套餐（Start Plan） depende do resultado do 个人套餐（Coding Plan）. Só se considera que o plano de experiência é decidível depois de confirmar que o plano pessoal não tem benefício e que o plano de equipe está indisponível ou já decidido, e depois que a consulta de fallback do plano de experiência terminar.

A página de configurações não possui mais uma lógica própria de escrita de inicialização do modo de conexão. Ao reabrir a página de configurações ou quando o Team Plan retorna de forma assíncrona, é obrigatório restaurar primeiro o `modelProviderFamilySelectedKeys[family]` histórico; somente quando o usuário troca manualmente o modo de conexão na página de configurações é que a página escreve novos `modelProviderFamilyModes[family]` e `modelProviderFamilySelectedKeys[family]`.

A atualização automática do modo de conexão após reconexão é responsabilidade única do callback OAuth do Root. O OAuth salta para a entrada de login unificada, e a página de configurações pode permanecer montada, ir para segundo plano ou ser desmontada e remontada; por isso, a atualização de selected key em segundo plano após o login bem-sucedido precisa cair no shared settings, em vez de depender de a página de configurações estar montada.

Após o sucesso do callback OAuth, é obrigatório ainda tentar, em segundo plano no Root, atualizar as configurações de modo de conexão da conta atual. Depois que a cadeia do callback concluir o refresh das provider keys, deve-se ler o provider mais recente, o entitlement pessoal Coding/Start e o pricing do BigModel Team, e gravar `modelProviderFamilyModes[family]` e `modelProviderFamilySelectedKeys[family]` pela mesma prioridade. Uma falha nessa escrita em segundo plano não pode reverter o estado de login, mas precisa ser registrada em log; a página de configurações apenas lê a selected key histórica já gravada e não consome mais o initial selection intent para uma segunda sobrescrita.

### Entrada por API Key

Quando o usuário escolhe Z.ai ou BigModel pela entrada de API Key da WelcomeScreen, a página de configurações de Model Provider seleciona a entrada da navegação lateral da mesma family e, nos modos de conexão à direita, seleciona diretamente API Key, sem influência dos benefícios de plano de experiência, pessoal ou de equipe.

O login por API Key só exige gravar `modelProviderFamilyModes[family] = "apiKey"`; a caixa de entrada e a página de configurações, ao ver o modo API Key, exibem diretamente a entrada de API Key da mesma family e não precisam depender do OAuth selected key.

## Limites

- A intenção de seleção inicial é consumida apenas uma vez e, após o consumo, não volta a disputar a escolha manual do usuário por causa de um refresh de entitlement posterior.
- Abrir a página de configurações normalmente não grava a intenção de seleção inicial da WelcomeScreen; continua usando o item selecionado atual, o family mode já salvo e o comportamento de fallback existentes, e não pode reselecionar o modo de conexão à direita pela prioridade dos benefícios de plano.
- A intenção da entrada limita-se à family atual e não faz seleção cruzada entre Z.ai e BigModel.
