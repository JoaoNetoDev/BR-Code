# Plano geral de fechamento de lançamento da refatoração de Provider

> Status: fase A concluída; implementação automatizada da fase B concluída, com os E2E críticos
> aguardando o gate humano
>
> Última atualização: 2026-08-25

## 1. Posicionamento do plano

A arquitetura alvo e os Todo 00 a Todo 10 da refatoração de Provider já foram concluídos. Este plano
não desenha outra arquitetura de Provider nem reabre questões já decididas; ele é responsável por
levar o branch atual grande de "implementação principal concluída" até "aceitável como Release
Candidate".

Todo o trabalho restante é agrupado em quatro categorias, avançadas nesta ordem:

```text
Branch atual da refatoração de Provider
        |
        v
A. Mesclar o staging mais recente
        |
        | formar uma única baseline de integração
        v
B. Completar testes automatizados e gates
        |
        | a máquina passa a provar continuamente o correto das cadeias críticas
        v
C. Concluir a validação em ambiente real e dos artefatos de release
        |
        | provar que os artefatos de build, as contas e o caminho de upgrade são realmente utilizáveis
        v
D. Concluir o fechamento de engenharia e de documentação
        |
        v
Provider Refactor Release Candidate
```

Cada fase gera antes de começar o plano detalhado, a superfície de impacto e a checklist de validação
daquela fase. Este plano geral fixa apenas a direção, as fronteiras de fase e os critérios de
conclusão, evitando fixar de antemão soluções de correção específicas quando ainda não há evidência de
execução.

## 2. Princípios gerais

1. **O resultado da mesclagem com o staging mais recente é a única baseline de aceitação.** Um
   resultado que passa isoladamente no branch atual não substitui a verificação da árvore de merge
   final.
2. **Preservar a arquitetura única de Provider/Model já consolidada.** A mesclagem e as correções não
   podem reintroduzir o antigo Provider Registry, o Model Connection Port, o ModelRef, o mapa de
   capability de runtime ou políticas hardcoded por modelo específico.
3. **As correções de código continuam com teste primeiro.** Regressões recém-descobertas são fixadas
   primeiro com teste unitário ou E2E, e só então o código de produção é alterado.
4. **Validação automática e validação real são separadas.** Testes unitários e checagem de tipos
   provam contratos estáticos; artefatos formais, contas reais e dados reais de upgrade provam que o
   sistema pode ir a produção. Um não substitui o outro.
5. **Toda falha precisa ter atribuição clara.** Um teste crítico que falha só pode ser corrigido, ou
   demonstrado como baseline existente no staging mais recente com uma conclusão explícita de
   tratamento; não pode ser ignorado em silêncio por ser ocasional, historicamente existente ou
   temporariamente difícil de reproduzir.
6. **Fechamento fase a fase.** Só se entra na fase seguinte depois que a fase anterior produziu um
   resultado e uma evidência estáveis, evitando perder uma baseline atribuível ao mesclar staging,
   alterar gates e investigar problemas de conta real ao mesmo tempo.
7. **Não ampliar o escopo da refatoração.** Remote Provisioning, filas de tarefas comuns, ciclo de
   vida de seleção de modelo, `modelContextBudget.strategy` e novas capacidades de produto não fazem
   parte deste plano.

## 3. Fase A: mesclar o staging mais recente

### Objetivo

Absorver no branch atual as mudanças de produto e de infraestrutura do `origin/staging` mais recente,
formando a baseline de integração usada por todas as validações posteriores.

### Trabalho principal

- atualizar as referências remotas e confirmar a diferença de commits entre os dois lados;
- mesclar o staging mais recente;
- resolver conflitos de texto um a item conforme o Provider Design atual, sem substituir o julgamento
  semântico pela escolha simples de um dos lados;
- revisar arquivos de protocolo, autenticação, Session, Trajectory, Telemetry e UI que foram mesclados
  automaticamente mas modificados pelos dois lados;
- varrer novamente as abstrações de Provider/Model já aposentadas, as projeções antigas de
  capability e os hardcodes por modelo específico, confirmando que o staging não trouxe as cadeias
  antigas de volta para o código de produção;
- executar checagem de tipos, testes unitários direcionados e checagens estáticas capazes de detectar
  rapidamente quebras de integração.

### Fronteiras semânticas conhecidas hoje

- do Host para o Worker só se sincroniza o Account Provider Config; não se restaura a sincronização
  completa do Local Provider Registry;
- a telemetry de cold-open nova do staging pode ser mantida, mas isso não autoriza restaurar as
  dependências de UI do `modelProviderService` já removido;
- todo fato de modelo novo do staging precisa entrar no Built-in Provider Config ou no Built-in Model
  Config Rules existentes, sem criar outra fonte de verdade remota ou de runtime.

### Critérios de conclusão

- o staging mais recente já está no branch atual;
- todos os conflitos foram resolvidos pela semântica de design e têm proteção de teste;
- o workspace de mesclagem está limpo e os gates rápidos passam;
- as abstrações antigas e os hardcodes por modelo específico continuam zerados.

## 4. Fase B: completar testes automatizados e gates

### Objetivo

Fazer com que o sistema automatizado cubra de fato a implementação central da refatoração de Provider e
consiga impedir que regressões em Core, Adapter, Bootstrap ou no Built-in Config físico entrem no
fluxo de release.

### Trabalho principal

- adicionar testes permanentes que carregam diretamente o `config/provider/zcode-builtin.json` real,
  validando por varredura a composição de membros do Provider, a resolução das Model Rules e a
  integridade do Effective Model Config;
- usar o Built-in Config real para provar que os três caminhos de API Key, Account e Request Auth
  chegam ao Adapter pelo Resolver, pelo Registry e pelo ModelFactory;
- auditar o uso do mesmo Active Model por requisição comum, Compact, Memory, Subagent e Off-Peak,
  preenchendo apenas os pontos de teste que realmente faltam;
- validar e promover, após passar por review humano, os quatro E2E críticos: identidade de Provider,
  cold start do Registry, subagent ocioso e filtro de candidatos;
- rodar typecheck, testes direcionados e regressão completa dos pacotes relacionados à refatoração de
  Provider; problemas de ambiente são registrados separadamente e não são ampliados para uma reforma
  de infraestrutura de todo o repositório.

### Critérios de conclusão

- o typecheck e os testes críticos dos pacotes centrais da refatoração de Provider podem ser executados
  de forma estável em um ambiente de repositório suportado;
- todas as suítes críticas passam na árvore de integração mais recente;
- todas as falhas restantes têm evidência reproduzível, atribuição clara e conclusão de tratamento
  escrita;
- a integridade do Built-in Config físico é protegida por teste permanente e não depende mais de
  auditoria manual por script.

## 5. Fase C: concluir a validação em ambiente real e dos artefatos de release

### Objetivo

Provar que o artefato de release real, as contas reais, o servidor real e os dados históricos reais
funcionam conforme a nova arquitetura.

### Cadeia de validação

```text
Código-fonte e Built-in Config
        |
        +--> Artefatos formais de Desktop (macOS / Windows / Linux)
        |
        +--> Standalone CLI / SEA
        |
        +--> Server / Remote bundle
        |
        v
Instalação e cold start
        |
        v
Provider / Account / Request Auth reais
        |
        v
Requisições de modelo, tratamento de erro, Usage e upgrade de dados históricos
```

### Trabalho principal

- construir e instalar os artefatos formais de Desktop, Standalone CLI, Server e Remote;
- verificar que todos os artefatos conseguem localizar e carregar o `zcode-builtin.json`;
- usar um Provider de API Key real para verificar configuração, verificação de conectividade e
  requisições de modelo;
- usar contas reais de Start Plan, Individual, Team e Off-Peak para verificar login, refresh, logout,
  troca de conta, Request Auth dinâmico e comportamento de rejeição pelo servidor;
- verificar que requisição comum, Compact, Memory, Subagent e tarefas ociosas usam o Provider, o modelo
  e o contexto de acesso corretos;
- usar um banco de dados histórico real para verificar a migração de schema, a consulta de Usage
  histórico e as fronteiras de rollback necessárias ao release;
- executar os E2E críticos de Desktop/CLI de Provider.

### Critérios de conclusão

- os artefatos formais das plataformas suportadas podem ser instalados, iniciados e executar requisições
  de modelo;
- os caminhos críticos de Provider dos tipos API Key e de conta passam na verificação com servidor
  real;
- o resultado do upgrade de dados históricos está correto e as fronteiras de release e rollback estão
  claras;
- não existe contrato de Provider que só valha em fixture de teste unitário e seja impossível em um
  deploy real.

## 6. Fase D: concluir o fechamento de engenharia e de documentação

### Objetivo

Remover estruturas residuais que já não têm responsabilidade real, para que código, Feature Graph,
Design, registros de implementação e conclusões de release descrevam todos o mesmo sistema já
implantado.

### Trabalho principal

- limpar cascas de Runtime que apenas encapsulam o ModelFactory e ainda mantêm estados artificiais
  de inicialização/destruição;
- limpar resíduos de nomenclatura como `official`, que já saíram do domínio de Provider Config;
- atualizar no Feature Graph os símbolos removidos, as cadeias de chamada e as origens de capability;
- marcar explicitamente como evidência histórica os "fatos atuais" que já caducaram em reviews,
  roadmaps e pesquisas, evitando conflito com o estado concluído;
- corrigir formatação, exports inúteis, comentários desatualizados e outros problemas de higiene de
  código;
- esclarecer a janela de versões de compatibilidade do legacy importer, sua condição de saída e a
  responsabilidade pela remoção futura;
- consolidar testes finais, validação real, limitações conhecidas e riscos de release, formando o
  registro de aceitação do Release Candidate.

### Critérios de conclusão

- não existe no código de produção uma segunda semântica de negócio de Provider/Model nem ciclo de
  vida mantido apenas pela arquitetura antiga;
- o Feature Graph e o Design atual estão consistentes com o código de produção;
- toda fronteira legacy tem um motivo de existência e uma condição de saída explícitos;
- o commit final passa pelo gate completo de release, o workspace está limpo e as evidências de release
  são revisáveis.

## 7. Itens confirmados como não-problemas

- o Built-in Model Config atual não define `support_pdf` ou `support_audio` como `true`; esse é um fato
  de configuração já confirmado e não um item pendente de decisão deste plano;
- o legado `modalities`, `supportsImages`, `supportsPdf`, `supportsVideo` só pode existir nas
  fronteiras de importer/reader de uso único; enquanto não voltar para a Config, o Registry ou o Runtime
  formais, não conta como dualidade de produção;
- Remote Provisioning e a sincronização de configurações remotas são capacidades de produto
  independentes e não pertencem a este fechamento de lançamento da Provider Refactor.

## 8. Próximos passos

A fase A foi concluída conforme [`01-staging-integration.md`](./01-staging-integration.md). Os testes
permanentes, a auditoria de cobertura do Runtime e a regressão completa da fase B foram concluídos
conforme [`02-provider-automation-proof.md`](./02-provider-automation-proof.md); o fixture contract dos
quatro E2E críticos passou, mas ainda precisa de review humano e da conclusão do replay formal e do
Docker admission em um ambiente com Xvfb ou Docker. Antes de esse gate ser concluído não se faz passar
por cobertura formal, e a fase C não é antecipada.