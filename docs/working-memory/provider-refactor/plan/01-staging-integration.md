# Fase A: plano de integração do staging mais recente

> Status: concluído
>
> Última atualização: 2026-08-25
>
> Entradas: Provider Refactor `4e8064f8d5`, `origin/staging` `8a7eca86aa`

## 1. Objetivo

Fundir o staging mais recente no Provider Refactor, formando uma única linha de base de integração usada em conjunto pelos subsequentes portões de automação, pela verificação de artefatos reais e pelo encerramento final.

Esta fase faz apenas a integração semântica do staging e suas correções de regressão diretas; não amplia o desenho dos objetivos do Provider, não implementa antecipadamente a construção de portões de CI da Fase B e não entra na verificação com contas reais e artefatos formais.

## 2. Fatos anteriores à integração

- O Provider Refactor atual tem 172 commits exclusivos em relação ao staging mais recente; o staging tem 88 commits exclusivos.
- O workspace atual está em detached HEAD; o `provider-refactor-m2` local está ocupado por outro worktree. Esta fase não move nem sobrescreve as referências de branch do outro worktree.
- A mescla virtual prévia conhecia dois conflitos de texto:
  - `packages/services/src/zcode-agent/zcodeAgentService.ts`
  - `packages/ui/src/v4/SessionPane.tsx`
- Os demais arquivos de protocolo, autenticação, Session, Trajectory, Telemetry e UI modificados por ambos, mesmo quando mesclados automaticamente, exigem revisão semântica.

## 3. Invariantes

Após a mescla, deve continuar valendo:

1. Do Host ao Worker sincroniza-se apenas o Account Provider Config; não se restaura a sincronização completa do Local Provider Registry.
2. Os fatos estáticos de Provider/Model vêm somente de ZCode Built-in Config, Account Provider Config, Personal Provider Config, Built-in Model Config Rules e Personal Model Config Rules.
3. O Core executa modelos somente via ModelFactory/Model; não se restauram Model Connection Port, ModelRef, o Registry de execução do AI SDK ou o mapa de capacidades de Runtime.
4. Não se infere, em código de produção, reasoning, formatos de entrada/saída ou outras capacidades estáticas de modelo a partir de um modelId específico ou do tipo de Provider.
5. O comportamento de produto, a evolução de protocolo e a telemetry do staging devem ser preservados, mas sem o custo de restaurar dependências de Provider já aposentadas.
6. As fronteiras de mensagens existentes de Desktop continuous e Web Remote replayable não mudam por causa desta mescla.

## 4. Tratamento dos conflitos conhecidos

### 4.1 `zcodeAgentService.ts`

O resultado correto combina as semânticas válidas de ambos os lados:

```text
staging cold-open timing / telemetry
                 |
                 v
conversation subscribe
                 |
                 v
ensureAccountProviderConfigSynced
                 |
                 v
Worker 使用自己的 Built-in + Personal 与同步得到的 Account Config
```

- Preservar o cold-open timing e a telemetry adicionados pelo staging.
- Preservar o `ensureAccountProviderConfigSynced` do Provider Refactor.
- Não restaurar o `ensureLocalProviderRegistrySynced` da linha de base antiga do staging.

### 4.2 `SessionPane.tsx`

- Incorporar o comportamento de Platform/open telemetry adicionado pelo staging.
- Preservar o resultado do Provider Refactor que removeu o `modelProviderService`.
- A UI não readquire a posse do Provider Registry nem dos fatos de runtime de Model.

## 5. Revisão dos arquivos mesclados automaticamente

Para os arquivos modificados por ambos sem conflito de texto, revisar por domínio:

- Protocol: schema estrito, direção dos campos e coerência entre chamadores local/remoto.
- Auth: Account Access e a injeção de credenciais em tempo de request permanecem em cadeia única.
- Transcript/Session: cold resume, hydration e restauração de histórico mantêm a ordem já estabelecida.
- Trajectory/Usage: continuam atribuídos ao Model realmente executado, sem reler a seleção padrão mutável da Session.
- UI: as novas interações do staging não restauram o antigo Provider Service, DTOs antigos ou uma segunda cópia do estado de modelos.
- Feature Graph: não registrar novamente abstrações de modelo já removidas como fatos de produção atuais.

## 6. Ordem de execução e verificação

```text
fetch latest staging
        |
        v
merge --no-ff origin/staging
        |
        v
解决文本冲突 + 复核自动合并文件
        |
        v
先运行冲突相关定向测试
        |
        v
旧符号 / hardcode / Config 双轨扫描
        |
        v
typecheck + lint + affected tests
        |
        v
记录结果并完成 merge commit
```

Se a mescla introduzir regressão real de comportamento, primeiro adicionar um teste que reproduza o problema e só então modificar o código de produção.

## 7. Condições para pausar e discutir

Pausar a implementação e pedir arbitragem se ocorrer qualquer uma das seguintes situações:

- Um novo comportamento do staging exigir restaurar a sincronização completa do Provider Registry entre processos.
- O staging introduzir novas fontes de fatos estáticos de modelo, configuração remota de modelos ou hardcode de modelos específicos.
- A mescla exigir mudar a ordem de Overlay ou as responsabilidades de Account, Personal e Built-in.
- As mudanças de protocolo do staging não puderem coexistir com os contratos existentes de identidade de Active Model, Access em tempo de request ou seleção de modelo.
- A correção precisar ser ampliada para Remote Provisioning, Queue comum ou ciclo de vida da seleção de modelo.

Conflitos de código comuns, adaptações de teste e correções de compatibilidade que não alterem o desenho existente não constituem ponto de arbitragem humana.

## 8. Critérios de conclusão

- O staging mais recente resultou em um merge commit explícito.
- Os dois conflitos conhecidos foram resolvidos combinando as semânticas deste plano.
- Os arquivos sobrepostos mesclados automaticamente passaram por revisão semântica.
- As abstrações antigas de Provider/Model, projeções de capacidade e hardcode de modelos específicos continuam zerados.
- Os testes relacionados a conflitos, typecheck, lint e os testes afetados passam.
- O resultado da execução da fase, o que ainda pertence às fases B/C/D e quaisquer falhas de baseline já existentes foram registrados.

## 9. Resultado da implementação

Em 2026-08-25 o `origin/staging` `8a7eca86aa` foi fundido no Provider Refactor. Os conflitos reais de texto coincidiram com a pré-análise, apenas:

- `packages/services/src/zcode-agent/zcodeAgentService.ts`
- `packages/ui/src/v4/SessionPane.tsx`

O `zcodeAgentService` preservou o session open timing do staging e substituiu sua antiga sincronização completa do Provider Registry pela única barreira de ordem permitida na fronteira Host/Worker: o Account Provider Config. O `SessionPane` preservou a telemetry de Platform/session-open do staging sem restaurar o `modelProviderService` aposentado.

Os arquivos sobrepostos mesclados automaticamente foram revisados em grupos de Protocol, Auth, Transcript, Trajectory, UI e Feature Graph. A varredura do código de produção não fez reaparecer:

- `ensureLocalProviderRegistrySynced`
- `ModelConnectionPort` / `ModelConnectionInfo`
- `AiSdkModelRegistry`
- `ZCodeModelRef`
- `ModelInputMediaCapabilities` ou mapa de capacidades de Runtime
- estratégias de execução que identifiquem intensidade de reasoning ou capacidades de formato estático por modelo específico

Resultados da verificação desta integração:

- Testes direcionados de conflitos e de session-open telemetry: 6 arquivos, 73 aprovados.
- Testes direcionados dos arquivos sobrepostos de CLI Adapter/Bootstrap: 3 arquivos, 224 aprovados.
- `pnpm typecheck` da raiz passou.
- `pnpm lint` da raiz passou, 0 erros; warnings já existentes não foram tratados como novos erros desta integração.
- `pnpm test:unit` da raiz: 1466 arquivos aprovados, 1 pulado; 12416 testes aprovados, 25 pulados.
- `git diff --check` e `oxfmt --check` dos arquivos relacionados passaram; os arquivos OpenAPI novos do staging também foram formatados.

O `pnpm fmt:check` de nível de repositório continua sendo bloqueado pelo arquivo com encoding `apps/zcode-cli/tests/gb2312.js` já existente e pelas marcações ilegais do HTML de fiddle Electron vendorizado. Todos os arquivos novos, de resolução de conflito e de ajuste direto desta fase passaram individualmente na verificação de formatação; o baseline de formatter de todo o repositório não é corrigido nesta Fase A modificando fixtures de terceiros, e segue registrado como problema de baseline de portão para a Fase B.

### Pendências repassadas para a Fase B

O typecheck completo do sub-workspace de CLI ainda não consegue produzir um resultado válido no estado atual de instalação. Executar o `tsc` de Adapter/Bootstrap diretamente lê primeiro o `dist` antigo das dependências; ao construir na ordem de dependência do Turbo, o `@zcode/contracts` por sua vez resolve do workspace raiz para Zod v4, enquanto esse pacote de CLI declara e depende de Zod v3. Os erros de tipo resultantes em Plugin, Workflow, Workspace Hook e Tool Display não são falhas do caminho de conflito de Provider, mas sim evidência direta de que o install/lock/portão do sub-workspace de CLI não está fechado.

Este problema não é contornado nesta Fase A modificando código-fonte de negócio. A Fase B deve primeiro restaurar uma instalação reproduzível do workspace de CLI e a resolução de dependências, e então incluir build/typecheck/test de Core, Adapter e Bootstrap nos portões automáticos de bloqueio.

## 10. Arbitragem do escopo de recuperação do staging (2026-09-06)

A seguir está a arbitragem vigente em 2026-09-06; não é a lista de pendências atuais. As relações de substituição posteriores estão no fim desta seção.

Naquele momento, dois grupos de comportamento do staging ficaram explicitamente não restaurados:

1. `SessionPane` sincronizar novamente o Provider Registry remoto antes do envio. A sincronização atual já é disparada no ambiente remoto ao estabelecer, ao salvar Provider e ao mudar conta/credenciais; um atraso breve ao enviar imediatamente após salvar é comportamento aceitável e não se adiciona barreira de sincronização pré-envio.
2. Correção automática de Provider/Model de Sessions existentes após mudança na conexão da conta. No futuro poderão coexistir múltiplos estados de conexão, e mudança de conexão não equivale a invalidação do modelo da sessão existente; não se restauram Account-first, fallback de primeiro modelo nem lógica de troca automática.

Encerramento posterior: a fronteira de não restaurar a barreira pré-envio do item 1 continua valendo; o item 2, a reescrita em lote orientada por evento antigo, não foi restaurada, mas a resolução válida da escolha existente já foi unificada em Todo87/96/99, e não se pode recusar com base nisso a correlação de conta na nova arquitetura. Não se restaura Account-first nem fallback de primeiro modelo; também não se pode tratar o fallback histórico de `Configured Default` como contrato atual. A separação entre intenção de salvamento e resultado efetivo, bem como as fronteiras de commit estabelecidas, seguem válidas, e o plano de múltiplas conexões permanece apenas como o rascunho Todo101.