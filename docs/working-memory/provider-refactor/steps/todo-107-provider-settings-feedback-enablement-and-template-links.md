# Todo 107: Feedback nas Configurações de Provider, Estado de Ativação/Desativação e Entrada de Templates

> Status: implementação, testes de admissão de composição e verificação de navegador em dois
> tamanhos/tema concluídos. 2026-09-10. Evidências de implementação/testes, revisão de limites item a
> item e limitações reais de ambiente estão em
> [revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## 1. Panorama dos Itens desta Rodada

| Todo                                                  | Escopo                                                                                     | Status                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| [105](./todo-105-account-provider-model-list-trim.md) | remoção de GLM-5-Turbo e GLM-5.2 da lista predefinida de Account Provider pessoal/equipe | implementado                    |
| [106](./todo-106-mcs-capability-rule-correction.md)   | escopo de suporte a MCS, capacidade padrão do Opus 4.8, MCS nativo e busca em Start/ocioso, uma URL com uma regra de site | implementado |
| Este Todo                                               | feedback de exclusão, botão de fechar do teste de conexão, arrastar vertical, entrada de API Key, enabled de Provider e luz de status unificada | implementado; escopo de verificação na revisão de entrega |

Os requisitos específicos de 105 e 106 estão em seus respectivos documentos e não são duplicados
aqui como outra lista de aceitação. O 106 foi implementado de acordo com o novo princípio
"configuração mainstream, oficial em primeiro lugar, sem reduzir a capacidade padrão por causa de
terceiros defasados" do [Design V2](../design-v2/design.md).

Os itens deste Todo já concluíram as decisões centrais de produto. Se, durante a implementação,
alguma interface existente não couber ou for necessário mudar semântica já confirmada, a diferença
concreta deve ser registrada separadamente, sem rediscutir o que já foi decidido.

## 2. O Feedback de Exclusão de Modelo Precisa Corresponder à Operação Real

Fenômeno: após excluir um modelo com sucesso, é exibido "Salvo com sucesso". Atualmente, o caminho
de exclusão em `InlineEditableProviderCard.tsx` reaproveita o texto de salvamento de
`runSaveOperation`.

- Reaproveitar o mecanismo de feedback de operação existente, mas distinguir textos de em
  andamento, sucesso e falha para exclusão, ajustando chinês e inglês juntos; a operação de salvar
  continua usando o texto de salvamento.
- Preservar a identidade do Provider/modelo alvo; não é permitido excluir A e exibir o resultado de
  B.
- A retentativa após falha deve repetir a operação de exclusão original, sem virar salvamento e sem
  afetar os avisos das outras operações.
- Exibir sucesso somente quando a exclusão realmente deu certo; em caso de falha, manter o erro atual
  e a semântica existente de retentativa.
- Não adicionar um sistema paralelo de Toast, nem refazer a transação de salvamento como
  pretexto para consertar textos.

## 3. Entrada de Fechamento Consistente no Aviso de Teste de Conexão

- Tanto sucesso quanto falha oferecem botão de fechar; rótulos de acessibilidade completos em
  chinês/inglês.
- Não oferecer um "x" de fechamento durante o teste, para não sugerir que ele cancelaria o teste.
- Manter a duração de desaparecimento automático original: 3,5 segundos no sucesso, 8 segundos na
  falha e sem desaparecimento automático enquanto em andamento.
- O fechamento manual remove apenas o aviso correspondente; não cancela a requisição nem afeta o
  teste ou o feedback de outros modelos.
- Manter o comportamento de substituição da mesma identidade de teste (pending → success / failure)
  e a limpeza atual dos timers, sem introduzir uma segunda fonte de estado.
- Não modificar o Prompt de teste de conexão, a autenticação, a seleção de modelo ou o conteúdo da
  requisição já decididos.

## 4. Ordenação de Providers Limitada ao Arrasto Vertical

Fenômeno: arrastar uma linha de Provider para a direita a move para fora da área visível e, ao
soltar, ela volta. A transformação de arrasto existente não restringe o eixo horizontal, e o
contêiner de navegação recorta o conteúdo que transborda.

- A navegação de Providers continua suportando ordenação vertical, mas o deslocamento visual do
  arrasto fica limitado ao eixo vertical, sem permitir arrastar para a direita e não ver mais o item.
- Reaproveitar o mecanismo de arrasto atual e sua restrição vertical, sem resolver cancelando todo o
  overflow do painel nem ampliando o flutuante.
- Preservar o conjunto de membros ordenáveis já existente, a persistência e a semântica de cancelamento;
  o grupo de conta não pode ganhar capacidade de ordenação não autorizada por causa disso.
- Preservar a seleção por clique, a ordenação por teclado e os limites de eventos de teclado de
  campos/modal; considerar também a rolagem por toque no celular, sem deixar que a ordenação engula a
  rolagem vertical normal.
- Este item trata da ordenação da navegação de Providers e não se expande para reescrever o arrasto da
  lista de modelos.

## 5. Completar a Entrada "Obter API Key" dos Templates Predefinidos

Os templates de API comum e de Coding Plan da Zhipu/Z.ai, a assinatura de Key de plano manual e as
entradas de obtenção pessoal/equipe ficam a cargo do
[Todo111](./todo-111-zhipu-coding-plan-api-key-and-standard-api-templates.md) seguinte. A regra geral
de entrada deste ponto continua válida; a atribuição específica de template e a escolha de link dessas
duas empresas seguem o Todo111, evitando nova configuração errada com base nos nomes dos dois
templates anteriores.

- Somente templates predefinidos oferecem esta entrada; para qualquer Provider criado pelo usuário, o
  URL não é adivinhado.
- Não esconder a entrada com base em já ter preenchido a API Key: com ou sem Key, a URL declarada pelo
  template fica acessível.
- Verificar um a um o estoque de templates atualmente mantido, completar os itens faltantes e
  esclarecer a cobertura do Kimi citado no feedback; não basta corrigir uma empresa e anunciar que
  tudo está pronto.
- Prioridade de URL: página oficial e estável de gerenciamento/criação de API Key → entrada do console
  oficial → página oficial com instruções de como obter a Key. Exigir login é normal e não se deve
  exigir que a interface de gerenciamento abra de forma anônima.
- Distinguir site nacional/internacional e entradas de planos diferentes; não reaproveitar URLs privadas
  que contenham usuário, organização, projeto, Token ou estado de login temporário.
- Registrar a base oficial e a data de verificação de cada URL; não adivinhar um endereço apenas para
  "completar". Se não houver uma página de gerenciamento direta confirmável, adotar a entrada oficial de
  nível superior acima e explicá-lo com honestidade.
- O URL permanece na única origem, que são os metadados atuais do template; a UI o lê e o abre pela
  interface da plataforma, e nenhuma outra tabela de endereços de marca é mantida no componente.
- Verificar também a exibição e a abertura no desktop e na Web do celular; esta rodada não estende o
  login de conta nem o fluxo de obtenção automática de Key.

## 6. Restaurar `enabled` de Provider e Unificar a Luz de Status

### 6.1 Campo e Limites de Escrita

- `enabled` pertence ao Provider concreto, no nível externo, junto de `providerId` e `providerName`,
  e não fica na configuração de modelo nem em `config` aninhado; não é um interruptor geral de Account
  Family.
- O interruptor do usuário é salvo pelo mecanismo de escrita de settings existente no Overlay/regra
  externa do Provider concreto; reaproveitam-se os mecanismos de conflito de versão, refresh e
  dispatch, sem escrita direta de arquivo nem armazenamento independente novo.
- Um Provider sem `enabled` definido é habilitado por padrão, determinado de forma unificada pela
  camada de config/parsing; nenhuma UI pode fazer seu próprio fallback, e o campo novo não pode
  desabilitar todos os Providers existentes.
- Reaproveitar a semântica atual de Schema/Overlay externo, sem engenharia de compatibilidade para
  configurações intermediárias de erro que nunca chegaram a produção.
- Desativar não exclui o Provider, não limpa Key/endereço/configuração de modelos, não desativa
  modelos um a um, não desconecta o plano e não apaga nenhuma Model Selection persistida.
- Reativar preserva o enabled original de cada modelo, e a elegibilidade para execução é novamente
  determinada pela resolução comum.

### 6.2 Única Fonte de Julgamento

```text
Provider enabled + integridade da configuração + executabilidade do modelo + entitlement da Account / fato da conexão atual
                              |
                      Resolver comum
                              |
                   Provider enabled / executable
                              |
            +-----------------+-------------------+
            |                 |                   |
         Desativado    Ativado e executável  Ativado, mas não executável
           Cinza             Verde                   Amarelo
```

- Acesso comum por API Key: reaproveitar o julgamento existente de integridade de configuração e de
  pelo menos um modelo habilitado e executável; não adicionar a condição de só ficar verde após um
  teste de conexão bem-sucedido, nem aplicar verificação de entitlement de conta.
- Acesso por Account: manter no julgamento comum pré-requisitos de execução da conta, como entitled.
  A restrição current da arquitetura de conexão única continua válida, e não se implementa o Draft de
  múltiplas conexões do Todo101 neste Todo.
- A UI apenas mapeia o resultado comum para cores, sem percorrer novamente Keys, entitlements de plano
  ou listas de modelos para criar um segundo julgamento.
- O ponto do grupo de conta usa o resultado comum do Provider concreto correspondente à conexão atual,
  e o `statusActive` do menu de plano não passa a ser elegibilidade para execução.
- Verde indica que a configuração e os fatos de conta atuais satisfazem os pré-requisitos de
  execução, sem garantir que o remoto nunca falhará; amarelo não significa necessariamente ausência de
  plano, e nenhuma causa específica de falha é inventada.
- Verificar integralmente se o novo enabled é consistente na lista de candidatos, na publicação do
  Registry, na View das escolhas já existentes e na verificação final de execução; uma escolha já
  salva não pode ser removida por estar temporariamente não executável.

### 6.3 Exibição do Interruptor e Limite de Execução

- O interruptor fica na área de nível de fornecedor do Provider externo, sem se misturar ao interruptor
  de algum modelo específico.
- O interruptor do grupo de conta controla apenas o Provider concreto correspondente à conexão atual, e
  o usuário deve perceber que o que está sendo controlado é o plano atual; não há desligamento em
  cascata de toda a família BigModel/Z.ai.
- Desativar afeta a elegibilidade para execução posterior e a publicação de modelos executáveis; não
  descarta modelos já vinculados, não interrompe tasks em execução e não substitui modelos por conta
  própria.
- Cinza/amarelo/verde também fornecem texto ou descrição de acessibilidade precisa, e não apenas cores;
  seguir DESIGN.md, cobrindo temas claro e escuro e telas estreitas.

## 7. Aceitação e Granularidade de Execução

- [x] Sincronizar as specs atuais relevantes antes da implementação; primeiro adicionar testes
      diferenciadores e só então alterar o código. Reaproveitar componentes, Facades e Resolver
      existentes, sem criar uma cadeia de julgamento paralela.
- [x] Feedback de operação: exclusão/salvamento com sucesso e falha, identidade na retentativa de
      exclusão, fechamento manual em sucesso e falha, feedback paralelo de múltiplos modelos, limpeza
      de timers.
- [x] Ordenação da navegação: arrasto horizontal óbito continua visível, ordenação vertical pode ser
      salva, cancelamento não escreve nada, teclado e rolagem por toque não regridem.
- [x] Links de template: cada template existente tem destino, exibe com ou sem Key, Provider
      autocrado não adivinha link, endereços nacionais/internacionais estão corretos.
- [x] Provider: habilitado por padrão, desativado explicitamente, configuração incompleta, sem modelo
      executável, API Key pronta, Account com/sem entitlement e conta diferente da atual — a página de
      configurações e o resultado comum de execução são consistentes.
- [x] Desativar e reativar não perde Key/estado dos modelos/escolha salva; o interruptor do plano
      atual fica isolado dos demais; tasks em execução não são interrompidas.
- [x] E2Es de interação de UI correspondentes, cobrindo desktop/Web do celular, temas claro e escuro e
      chinês/inglês. Para mudanças em campos de serviço, verificar se o sincronismo existente de
      Host/Worker continua completo, sem refazer a arquitetura de sincronização.
- [x] Verificação por lotes significativos (feedback e arrasto, entrada de template, ativação e
      ativação/desativação de Provider); typecheck, lint, testes unitários relevantes e verificação de
      desktop necessários compartilhados, sem rodar regressão completa a cada pequena alteração.
- [x] A revisão do lote completo cobre os requisitos decididos, os limites de escrita e as abstrações
      de Provider/Selection; as partes não verificadas em ambiente real são indicadas com honestidade,
      sem substituir "está registrado" por conclusão.

## 8. Exclusões Claras / Adiamentos

- **Corte de banners**: o usuário já pediu para ignorar por enquanto, e não é pré-requisito de
  encerramento deste Todo; o [registro de investigação Pro](./investigation-provider-feedback-clipping-20260910.md)
  continua como "não reproduzido, causa raiz não confirmada", e não se pode mexer por conta própria em
  blur, camadas ou estilo de corte e declarar a correção.
- **Ainda pedir aprovação após "acesso total"** e **botão de criação ociosa cinza mesmo com Coding
  Plan**: o usuário explicitamente os ignora e eles não entram nesta rodada de investigação ou
  implementação.
- Não alterar a semântica de troca de plano, não implementar múltiplos Account Providers
  simultâneos, não limpar dados reais de usuários e não publicar nem fazer push automaticamente.