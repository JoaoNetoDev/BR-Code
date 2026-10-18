# Registro de Problemas de Experiência em Provider Settings (2026-08-27)

## 1. Finalidade

Este documento registra os problemas encontrados durante a primeira rodada de experiência prática em macOS no mac Pak do Provider Refactor. Princípios de tratamento:

- Problemas que não alteram as abstrações existentes de Provider / Model Config, Overlay ou Registry são corrigidos diretamente e fixados por testes;
- Problemas que envolvem Account Overlay, direitos de plano ou a fonte de verdade sobre disponibilidade de modelos são apenas registrados com evidências de runtime e limites de código, aguardando decisão;
- Não mascarar problemas de domínio com fallbacks de UI, habilitação forçada ou bypass do Resolver.

## 2. Corrigidos diretamente

| Problema | Causa raiz | Contrato após a correção |
| --- | --- | --- |
| Nomes duplicados de Providers históricos bloqueiam salvamentos não relacionados | Ao salvar, a validação de unicidade era reaplicada a todo o conjunto de Effective Providers, e duplicatas legadas da migração bloqueavam qualquer Provider | Só é proibido que a mudança de nome deste salvamento introduza duplicatas; duplicatas históricas existentes não bloqueiam outros salvamentos |
| Base URL vazio impede salvar o rascunho de Provider | O Renderer serializava entrada vazia como `baseURL: ""`, sendo rejeitada pelo Schema de URL antes mesmo de o Resolver avaliar a completude | Valor vazio não grava `baseURL`; o Provider pode ser salvo mas não executado, e URL inválida não vazia continua sendo rejeitada |
| A linha inteira de Provider / Model não pode ser arrastada | O Provider depende de um grip separado; o Pointer Sensor customizado do Model misinterpretava o `role=button` de nível de linha adicionado automaticamente por `useSortable` como um controle interativo | O nome, o ícone e a área em branco não interativa de Provider e Model podem iniciar o arraste da linha inteira, exceto controles reais; a seleção de texto é proibida durante o arraste |
| O diálogo de modelo consegue atravessar e arrastar o modelo de fundo | O Radix Dialog renderiza via Portal, mas os eventos do React ainda sobem pela árvore de componentes até o ativador de DnD da linha do modelo | Dialog content, overlay e regiões explícitas com `data-no-model-drag` não conseguem iniciar a ordenação de fundo |
| Informações e interruptor da linha do modelo desorganizados | Resumo e ações não tinham limites de layout estáveis | O Context vem logo após o Model ID; o interruptor fica fixo na extremidade direita da linha do modelo; a linha do modelo não oferece "restaurar padrão" por campo individual |
| Exibição duplicada da ativação do Provider | A etiqueta de status e o botão de ação ocupavam espaços separados | Um único botão expressa o estado atual e executa a alternância |
| O editor de modelo disfarça valores herdados como entrada Personal | O Draft era inicializado com o Effective Config; o JSON ainda exibia valores somente-leitura duplicados | Quando a entrada Personal está vazia, o valor herdado aparece apenas como placeholder; a seção de JSON somente-leitura duplicada foi removida |
| Editor de modelo com hierarquia profunda e próximo de tela cheia | Campos comuns ficavam misturados ao colapso "Avançado", e a altura máxima do diálogo ficava próxima de toda a viewport | "Avançado" foi removido; no desktop usa-se uma altura máxima média centralizada com rolagem apenas na área de conteúdo |
| Ordem dos campos do editor de modelo não corresponde à frequência de uso | Max Output e formatos de entrada/saída ficavam depois de capacidades e do JSON complexo | `Model ID/Ativado -> Context -> Max Output -> Entrada -> Saída -> Capacidades -> Configuração complexa` |
| Só é possível restaurar valores herdados campo a campo | Faltava um ponto de entrada para limpar o Personal Overlay no nível do modelo | O Footer oferece "Restaurar tudo para o padrão", limpando o Personal Model Config Overlay daquele modelo antes de o usuário salvar |
| Providers nacionais aparecem no fim do menu de adição | O menu usava diretamente a ordem da configuração Built-in, e a ordem antiga colocava Providers estrangeiros primeiro | A configuração Built-in e o menu de adição listam primeiro os Providers nacionais e depois os estrangeiros |

## 3. Verificação da origem do Personal Config e dos nomes Official

O backup pré-migração mantido na máquina Pro e o backup anterior à limpeza comprovam:

```text
旧 ~/.zcode/v2/config.json.provider
        |
        | Provider V1 importer
        v
新 config.json.providers + modelConfigRules
```

O Personal Config antes da limpeza não era o conteúdo do novo Official Config em si, mas o resultado deixado pelo migrador depois de projetar a configuração antiga no novo Personal Overlay, contendo simultaneamente:

- As configurações de Providers `builtin:*` editáveis na versão antiga;
- Providers customizados criados pelo usuário;
- Overrides Personal do usuário sobre a ordem dos Providers padrão, a associação de modelos e os atributos dos modelos.

Portanto, o Coding Plan duplicado nas capturas é um resíduo da migração, e não o Official Config atual criando novamente um Provider com o mesmo nome. Os labels de Provider do `config/provider/zcode-builtin.json` atual foram verificados como únicos; Z.ai / BigModel usam nomes diferentes para API, Individual, Team, Start e Idle Plan. A limpeza do Personal Config executada para continuar a experiência manteve um backup com timestamp, recuperável.

## 4. Aguardando decisão: Team Plan válido, mas exibição de Account Provider / direitos indisponível

### 4.1 Fatos de runtime

O `~/.zcode/v2/logs/2026-08-27.log` do Pro mostra, após a mesma seleção de Team Plan:

- O Settings persistiu `bigmodel -> team-coding-plan`, incluindo product, organization e project;
- A validação de projetos do Team Plan acertou o projeto selecionado, com a lista de organizações não vazia;
- A interface de quota do Team Plan retornou sucesso de negócio e havia dados de cota;
- Mas o entitlement de Usage registrou `organizationId/projectId` como `null` para `account:bigmodel-team-coding-plan`, e em seguida reportou nenhuma autorização disponível;
- O Registry, antes disso, só publicou um Personal Provider; não foi observado nenhum Team Account Provider entrando no conjunto executável.

Isso prova que "a conta realmente tem um Team Plan" e "a página exibe falha na obtenção" não são um conflito de veracidade sobre a mesma requisição upstream, mas uma quebra no momento em que o fato da seleção do plano entra em consumidores diferentes.

### 4.2 Cadeia atual

```text
setting.json
providerFamilyConnectionSelections.bigmodel
{ kind: team, organizationId, projectId, productId }
          |
          +-------------------------------+
          |                               |
          v                               v
Account Provider Resolver          Settings Usage entitlement
  -> Family availability             -> 从 ProviderSettingsView
  -> Team project/quota 成功             反查 Account Access
  -> 生成 Account Overlay             -> 实测得到 null org/project
          |                               |
          v                               v
Effective Provider / Registry       “暂时无法确认 Coding Plan 权益”
```

O próprio `createAccountProviderConnectionResolver()` lê diretamente a Family selection e, só após disponível, cria o `ZhipuAccountAccessConfig` com escopo Team. Já o `resolveAccountProviderAccess()` do Renderer só aceita resultados que já apareceram em `ProviderSettingsView.effectiveConfig.access` e que passam pelo Schema completo de Account Access. Ou seja, a UI de entitlement reaproveita a saída do Account Overlay como entrada de seu próprio acesso; assim que o Overlay não publica um access completo, a página não consegue usar a Team selection que já existe no `setting.json` para explicar a causa da falha.

### 4.3 Correções que não podem ser adotadas diretamente

- Não é possível forçar no Renderer a marcação do Provider como enabled só porque a requisição de quota do Team teve sucesso; isso burlaria o Account Overlay.
- Não é possível deixar a UI de Usage montar por conta própria um novo `accessId` ou Account Config; isso criaria um segundo conjunto de fatos de Account Access.
- Não é possível recorrer a um Provider ID fixo ou ao modelo padrão quando o Registry está vazio; isso quebraria a fronteira de identidade de Provider / Model.

### 4.4 Questões a alinhar posteriormente

1. Em qual etapa entre a Team selection e a publicação do Account Overlay o access completo é perdido; é necessário adicionar evidência observável à publicação do Connection Result / Overlay e reproduzir a medição.
2. O entitlement de Usage deve continuar consumindo o Effective Account Access ou deve consumir o fato de seleção do domínio de conexão da conta; as responsabilidades precisam ser unificadas, sem montagem paralela por parte de cada um.
3. Quando o Account Provider já foi validado como disponível mas não entrou no Registry, como a Settings View deve apresentar simultaneamente o diagnóstico de "plano válido" e "Provider não executável", em vez de exibir uniformemente uma falha na obtenção.

Até que essas questões sejam decididas, esta rodada não modifica o Account Overlay, o accessId, as restrições de associação de modelos por plano ou a semântica de integridade do Registry.