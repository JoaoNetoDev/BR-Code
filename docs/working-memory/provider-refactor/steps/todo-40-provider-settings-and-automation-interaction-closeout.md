# Todo 40: Fechamento das interações de Provider Settings e Automation com modelos

> Atualização de atribuição de verificação (2026-09-09): as faltas de teste residuais, falhas e promoções manuais deste artigo foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente aqui; as evidências históricas são mantidas e a transferência não significa que os testes passaram.

> As faltas de E2E gráfico de Desktop posteriores são fechadas uniformemente pelo Todo 78, e este Todo deixa de ter cronograma próprio.

> Status: concluído (E2E de Desktop em máquina real bloqueado pela ausência de `xvfb-run` no ambiente Linux atual)
>
> Data: 2026-08-28
>
> Origem: experiência prática de Provider Settings, entrada de upgrade do Team Plan e regressão de criação de tasks em Automation

## 1. Objetivo

Este Todo fecha cinco problemas de interação que já tinham decisão, sem adicionar abstrações intermediárias de Provider, Model ou Automation:

1. Restaurar na entrada de upgrade do Coding Plan a intenção original de três dimensões: Family, Audience pessoal/equipe e Team Plan específico;
2. Restaurar o `max-w-4xl` padrão na página de configurações do Provider, mantendo apenas o alargamento do `max-w-2xl` padrão no diálogo de Model Config;
3. Remover o `modelsReadOnly`, que amarrava edição de modelo, ativação, adição/remoção e teste de conexão em um único item;
4. No Account Provider, ocultar apenas Endpoint, API Schema e credenciais de conta, mantendo nos modelos a capacidade padrão de edição de Effective Model;
5. O Automation deixa de ter o estado virtual `inherit/default model`; a criação de task passa a fixar diretamente o modelo e o reasoning específicos.

## 2. Intenção de upgrade do Coding Plan

```text
Selected Account Provider
├─ provider family  -> Z.ai / BigModel
├─ plan audience    -> personal / team
└─ team plan key    -> Team Plan específico（somente entrada de equipe）
          |
          v
CodingPlanUpgradeDialog
          |
          v
Embedded Website URL / Bridge
```

- O Team Provider ID precisa entrar na fronteira de normalização da entrada de upgrade do Coding Plan e não pode ser normalizado para `null` na entrada do diálogo; isso não deve adicionar o Team Provider aos candidatos de navegação estática de planos;
- `providerId` continua determinando a Family no site oficial;
- `initialAudience` continua determinando a página pessoal ou de equipe;
- `initialTeamPlanKey` continua expressando o plano de equipe específico clicado pelo usuário;
- O Status Card não pode escrever todas as entradas de upgrade/renovação como `personal` fixo;
- O WebView precisa receber explicitamente a intenção de início da compra; o `purchase_audience` do Telemetry não pode servir como protocolo de roteamento;
- A entrada de gerenciamento continua usando o endereço de gerenciamento pessoal/equipe do Family Spec, separada da responsabilidade do WebView de compra.

## 3. Comportamento de modelos na página de configurações do Provider

```text
model.builtin
├─ true  -> Model ID fixo, não removível
└─ false -> Model ID editável, removível

todos os modelos
├─ podem editar o Personal Model Config Overlay
├─ podem alternar enabled
├─ podem participar da ordenação
└─ podem ser testados quando existe um handler de teste oficial
```

- Remover `modelsReadOnly` e toda a sua passagem do Account Detail até o Model Row;
- Remover da UI os gates de adivinhação do teste de modelo baseados em API Key do formulário, `readOnly` e `model.executable`;
- O botão de teste só aparece quando existe capacidade de teste oficial e só é desabilitado enquanto a requisição está em andamento;
- Falhas de execução retornam um erro claro pela cadeia oficial de teste de Model/Registry;
- As páginas Account Team / Individual / Start não exibem Endpoint, API Schema nem credenciais de conta;
- A lista de modelos do Account Provider exibe diretamente o Effective Provider Config e permite a edição padrão do Personal Overlay;
- O Built-in API Key Provider ainda pode exibir e travar o Endpoint/API Schema de propriedade Built-in, e a capacidade de somente leitura por campo não é removida.

## 4. Layout

- A página de Provider Settings recupera a largura de conteúdo compartilhada `max-w-4xl`;
- O diálogo de Model Config mantém `max-w-2xl`, sem continuar alargando;
- Não corrigir o scroll interno do diálogo ou do detalhe alargando a página inteira;
- Desktop, Web e janela estreita continuam usando o responsivo e a estrutura de scroll independente existentes.

## 5. Modelo concreto no Automation

```text
Target Host ModelSelectionView ready
              |
              v
preferredSelection
              |
              v
providerId / modelId específico
              |
              v
reasoning padrão do Option Spec do modelo
              |
              v
salvar o modelSelection completo
```

- Remover `INHERIT_MODEL_VALUE` e os textos "modelo padrão/seguir o Workspace";
- Na criação de task, em registros de edição antigos sem modelo e após trocar o Workspace alvo, a seleção concreta é inicializada com o `preferredSelection` do Host alvo;
- A UI sempre exibe o modelo e o reasoning específicos;
- Depois que o usuário escolhe o modelo, atualizações posteriores da View não sobrescrevem mais;
- Sem `preferredSelection`, mantém-se um estado explicitamente não submetível e não se cria um default implícito;
- A entrada Create sempre grava o `modelSelection` completo; Update continua permitindo `null` apenas como valor explícito de limpeza do protocolo existente,
  e este formulário não gera mais esse valor;
- Quando o modelo selecionado muda, o reasoning é corrigido conforme o Option Spec do modelo alvo; o Automation usa o nível padrão do modelo e não
  reutiliza a regra de nível mínimo das tasks de modelo auxiliar.

## 6. Testes e critérios de conclusão

- Testes unitários provam que um Team Provider pode abrir o WebView com a Family, o Audience e o Team Plan Key correspondentes;
- Testes unitários provam que a intenção de início de URL de Z.ai / BigModel e personal / team não se mistura;
- Testes unitários de Provider provam que modelos de Account são editáveis, ativáveis e testáveis, e que modelos Built-in continuam não removíveis e com ID imutável;
- Testes unitários de Automation provam a inicialização por `preferredSelection`, a persistência da escolha concreta, a troca de Workspace e o estado de falha sem modelo disponível;
- E2E de Desktop cobre a entrada de upgrade de equipe, a edição/teste de modelos de Account e o envio de Automation sem seleção manual de modelo;
- Executar os testes unitários afetados, o typecheck do E2E de Desktop, o `pnpm typecheck` da raiz, o `pnpm lint` e `git diff --check`;
- A revisão confirma que não existe novo DTO de permissão de Provider, sentinel de modelo padrão nem um segundo conjunto de fatos de modelo.

## 7. Resultado da implementação

- A entrada de upgrade do Coding Plan recuperou `providerId + audience + teamPlanKey`, e Z.ai / BigModel e as entradas pessoal/equipe não se misturam mais;
- A página de configurações do Provider recuperou `max-w-4xl`, e o diálogo de Model Config manteve `max-w-2xl`;
- Foram removidos `modelsReadOnly` e a pré-julgamento na UI do teste de modelo sobre API Key do formulário, estado somente leitura e `executable`;
- O Account Provider continua ocultando Endpoint, API Schema e credenciais de conta, mas os modelos usam as capacidades padrão de edição, ativação e teste;
- O Automation removeu o estado virtual `inherit/default model`, usando o preferred do Host alvo para inicializar e salvando o modelo e o reasoning concretos;
- Os modelos Built-in continuam garantidos por `model.builtin` separadamente: ID imutável e membro não removível.

## 8. Registro de verificação

- Testes unitários direcionados de Provider / Coding Plan / Automation: 318 aprovados;
- Unit completo: 1492 arquivos de teste, 12730 casos aprovados, mais 1 arquivo de teste / 25 skips pré-existentes;
- TypeScript de `packages/ui`: aprovado;
- TypeScript do E2E de Desktop: aprovado;
- `pnpm typecheck` da raiz: aprovado;
- `pnpm lint` da raiz: 0 erros (33 warnings pré-existentes);
- Verificação de formatação dos 28 arquivos desta rodada: aprovada; o `pnpm fmt:check` da raiz foi bloqueado pelo `gb2312.js` binário já existente no repositório e pelo HTML inválido do Electron fiddle, sem relação com os arquivos desta rodada;
- `git diff --check`: aprovado;
- O E2E de Desktop do Automation concluiu a build de produção, mas na etapa de inicialização do WebDriver não foi possível criar uma session do Chrome por falta de `xvfb-run` na máquina;
  esse é um bloqueio do ambiente de execução de testes, não uma falha de asserção de cenário. A interação em máquina real ainda precisa ser executada em macOS com ambiente gráfico ou em Linux com Xvfb instalado.