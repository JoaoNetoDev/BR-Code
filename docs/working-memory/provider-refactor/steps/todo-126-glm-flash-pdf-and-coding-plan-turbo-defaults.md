# Todo 126: Selo visual GLM, PDF do Flash e padrões Turbo do Coding Plan API

> Status: em 2026-09-11 implementado sob autorização de Goal em lote, com verificação/review parciais aprovados; a aceitação final do lote ainda está pendente e nenhuma configuração online foi publicada.
>
> Data: 2026-09-11

## Complemento de 2026-09-12: Turbo desabilitado por padrão na API comum

O usuário exigiu que o Turbo do Z.AI API / BigModel API fique desabilitado por padrão. Atualmente `GLM-5-Turbo` já é false; foram completadas com false as regras de template exatas de `GLM-5V-Turbo` para `zai-standard-api` e `bigmodel-standard-api`, e o revision do Built-in foi incrementado. Apenas o padrão de ativação muda: nenhum modelo é removido, nenhuma capacidade nem override pessoal é alterado; Coding Plan, Account e terceiros permanecem intactos. Reutiliza-se o parsing de regras existente, sem alterações de UI, protocolo ou migração, e sem publicação automática de configuração online.

Verificação: com o Built-in Source real, checar que os dois Turbos dos dois templates estão desligados, que 5.3/Flash continuam ligados, que a ativação explícita pessoal ainda tem precedência e que o padrão de terceiros sem template permanece inalterado.

Resultado da implementação: revision 22→23, apenas dois `GLM-5V-Turbo.enabled` modificados. Os novos casos de teste reproduziram primeiro as duas padrão true; após a correção, 34 verificações de configuração/integridade/Release passaram; typecheck passou, lint com 0 errors / 42 warnings já existentes, arquitetura com 0 violations. UI/código de execução inalterados, sem E2E de interação adicional; nada foi enviado nem publicado online.

## 1. Contexto e decisão final

Ao inspecionar as configurações de modelo, o usuário levantou questões sobre PDF do Flash, selo visual do GLM e valores padrão de Turbo por pacote. Isso foi reproduzido por meio do Node Source/regras de parsing reais da configuração embutida atual, e não apenas lendo o JSON:

- Imagem e vídeo do GLM-5.3-Flash já estão habilitados nas regras gerais de modelo, mas PDF só está habilitado nas regras de modelo＋API do Anthropic Messages; em Chat Completions e Responses é false.
- Os dois templates de Coding Plan API, `zai-api` e `bigmodel-api`, não têm regra de desligamento padrão do GLM-5-Turbo. Quando uma instância existente mantém ou adiciona manualmente esse modelo, ela herda o `enabled: true` geral.
- A regra geral do GLM-4.7 desliga a visão, e a regra de visão de todos os modelos no site oficial do pacote a liga novamente. **O usuário confirmou que esse comportamento está correto e não será alterado.**
- A regra geral do GLM-5.3 desliga a visão, e o endpoint oficial do pacote a liga. Confirmação mais recente do usuário: a capacidade de entrada de imagem do Coding Plan GLM-5.3 vem da ponte no servidor e não representa visão nativa do modelo; aqui a diferença entre GLM-5.3 e Flash é que hoje só o Flash tem visão nativa. Portanto, **é permitido exibir uma exceção hardcoded no frontend, ocultando o selo visual do Coding Plan GLM-5.3 na página de configurações de modelo e no menu de seleção de modelo, mantendo a configuração de capacidades subjacente inalterada**. Essa decisão substitui a restrição anterior de "não hardcodar selo visual".

Este Todo contém as três modificações confirmadas abaixo e não pode alterar de passagem outras capacidades, padrões ou UI de modelos.

## 2. GLM-5.3-Flash: PDF habilitado por padrão em todos os acessos

Modificar `config/provider/zcode-builtin.json`:

1. Adicionar `supportsPdf: true` em `config.properties.inputFormat` do membro `modelRules` geral existente do GLM-5.3-Flash, junto das capacidades de imagem e vídeo já existentes.
2. Remover a regra especial existente em `modelApiRules` que existia apenas para habilitar PDF do GLM-5.3-Flash em `anthropic-messages`, sem manter declaração duplicada.
3. Reutilizar as expressões de correspondência de modelo do Flash existentes e as regras de caixa/prefixo/sufixo, sem redesenhar a correspondência de aliases de modelo.

Significado após a modificação:

```text
Regra geral de modelo GLM-5.3-Flash
  supportsImage: true
  supportsVideo: true
  supportsPdf: true
          |
  Official e acessos de terceiros, três formatos de API existentes compartilhados
```

- O usuário exigiu explicitamente incluir terceiros; nenhuma lista de endpoints é adicionada nem limitada a algum template.
- Cobre os três formatos de API existentes: Anthropic Messages, OpenAI Chat Completions e OpenAI Responses.
- Não amplia para o GLM-5.3 comum, GLM-4.7 ou outros modelos; não modifica imagem, vídeo nem outras capacidades.
- A configuração pessoal explícita continua prevalecendo pelas regras de override existentes; não se pode limpar a configuração de desligamento manual de PDF do usuário nem forçar reset de configuração manual.
- Este ajuste recomenda declarações de capacidade e não autoriza refatorar a codificação de anexos PDF, limites de leitura ou o Adapter.

## 3. Coding Plan API: GLM-5-Turbo desabilitado por padrão

No mesmo arquivo, em `templateModelRules`, adicionar uma regra exata para cada um dos dois templates:

```typescript
{
  templateId: "zai-api",
  modelId: "GLM-5-Turbo",
  config: { enabled: false },
}
{
  templateId: "bigmodel-api",
  modelId: "GLM-5-Turbo",
  config: { enabled: false },
}
```

- Corresponde aos dois templates de Key manual do Z.AI Coding Plan API e do BigModel Coding Plan API.
- Altera apenas o valor padrão; não remove nem adiciona modelos à lista, não altera IDs de modelo e não impede que o usuário ligue manualmente.
- Ativação ou desativação pessoal explícita continua valendo pela precedência existente; sem migração e sem remoção de overrides pessoais.
- Não altera os Providers pessoal, de equipe, Start ou de horário ocioso da conta via login; não altera os padrões dos templates de API comum nem de acessos de terceiros.
- Não amplia o desligamento padrão por template para uma regra geral de Turbo desligado e não altera as regras exatas de Account.

## 4. Coding Plan GLM-5.3: ocultar o selo visual

> Complemento de decisão de 2026-09-12: [Todo137](todo-137-start-plan-glm53-vision-badge.md) inclui o Start Plan do pacote de experiência no mesmo escopo de exibição; abaixo o escopo de implementação original é preservado.

- Contexto de produto: a ponte no servidor permite que o GLM-5.3 processe imagens, mas o modelo não tem visão nativa; desta vez apenas se corrige o significado comunicado pelo selo, sem revogar a capacidade de uso de imagens já existente.
- Escopo de exibição: a lista de modelos na página de configurações de modelo e o selo visual do modelo correspondente no menu de seleção de modelo. Verificar os pontos de entrada do seletor compartilhado; não é permitido corrigir apenas a página de configurações ou apenas a caixa de chat principal; desktop e Web em celular mantêm exibição consistente.
- Escopo de Provider: conexões de contas de Coding Plan pessoal e de equipe do Z.ai/BigModel, além de fornecedores de Coding Plan API Key manual.
- Combina apenas o GLM-5.3 dentro do escopo acima; o GLM-5.3-Flash mantém o selo visual e outros fornecedores/modelos não são afetados.
- Por requisito de produto, fazer uma exceção de exibição no frontend; as duas páginas reutilizam a mesma decisão de exibição, sem alterar o fato de capacidade genérico; não definir `supportsImage` como false nem filtrar o modelo inteiro para ocultar a marca.
- Upload de imagem, configuração de formato de entrada, suporte a anexos, ponte no servidor e requisições reais ao modelo permanecem como estão. Nenhum Schema de capacidade, campo de protocolo ou migração de dados é adicionado, e essa mudança não é usada para refatorar o sistema de capacidades nativas versus capacidades de ponte.

## 5. Publicação e limites de implementação

```text
Regras embutidas de modelo / API / site / template
                 |
           Regras existentes de override pessoal
                 |
          Parse pelo mesmo Resolver
                 |
         UI existente e cadeia de execução leem
```

- Após concluir as modificações de configuração embutida das seções 2 e 3, incrementar o `revision` do builtin, reutilizando o mecanismo existente de publicação e atualização; na implementação, conferir o revision mais recente e não fixar o número de versão usado nesta investigação. A modificação de exibição da seção 4, puramente de frontend, não requer incremento do builtin revision.
- Não alterar `schemaVersion`, Schema, protocolo, layout de arquivos, tabelas de banco ou fluxo de migração.
- Não modificar a visão do GLM-4.7 nem as regras de site de visão de todos os modelos do pacote oficial; para o GLM-5.3 apenas é permitida a exceção de exibição do selo visual definida na seção 4, sem alterar sua capacidade real.
- Não implementar o ícone de interrogação nem os textos de [Todo125](./todo-125-model-settings-help-copy.md), e não alterar o layout das configurações de modelo.
- Não publicar automaticamente configuração online nem enviar código; esta autorização apenas registra o pendente.

## 6. Implementação e aceitação

Após a autorização de implementação, seguir os requisitos do repositório de teste primeiro e portões de arquitetura. Priorizar a reutilização dos testes existentes em `packages/provider-node/test/` para integridade do builtin, aliases, templates e overrides pessoais.

- [ ] Estabelecer primeiro casos de teste que falham: o PDF padrão do Flash em formato diferente do Anthropic deve ser true; o Turbo padrão dos dois templates de API de pacote deve ser false.
- [ ] Carregar o builtin de fato e fazer o parsing: oficial/terceiros, três formatos de API e aliases Flash existentes de caixa e prefixo/sufixo obtêm PDF=true; o GLM-5.3 comum e o GLM-4.7 não são ampliados.
- [ ] Verificar que PDF=false pessoal explícito ainda prevalece; o modo de configuração manual não é resetado por atualizações recomendadas.
- [ ] Turbo padrão false nos dois templates de Coding Plan API e ainda possível ativar após ativação explícita pessoal; demais modelos, API comum, terceiros e padrões pessoais/de equipe/Start/ocioso de Account inalterados.
- [ ] O resultado de visão de site existente do GLM-4.7 e a configuração de capacidade real existente do GLM-5.3 permanecem inalterados.
- [ ] Cobrir primeiro os casos de exibição: GLM-5.3 de contas pessoais/de equipe e de Coding Plan API Key manual não exibe selo visual na página de configurações nem no menu de seleção de modelo; o Flash no mesmo ponto de entrada continua exibindo, e outros Providers/modelos não são afetados indevidamente.
- [ ] Verificar que a entrada de imagem e a edição de capacidades continuam funcionando conforme a configuração original, sem que a ocultação da marca altere capacidades reais; complementar com verificação de navegador nos dois pontos de entrada de exibição, cobrindo layouts desktop/celular, tema e internacionalização, sem registrar a aprovação de um único componente como aceitação de todas as plataformas.
- [ ] Atualizar as expectativas de testes antigos afetadas pela configuração final e as asserções de revision, completar as regressões relevantes, `pnpm typecheck`, `pnpm lint` e a verificação de arquitetura; manter os E2E relevantes conforme exigido pelo repositório. Validar em lote por risco dos três itens, sem repetir a regressão completa para cada pequena alteração.
- [ ] Registrar com honestidade os resultados da execução e o escopo não verificado. Passar no parsing de regras não significa que um endpoint real de modelo já aceitou PDF, nem que a verificação foi concluída em todas as UIs e plataformas.

## 7. Resultado registrado nesta execução

Os três itens foram implementados: builtin revision 20→21, com a declaração geral de PDF do Flash substituindo a declaração duplicada em Messages; os dois templates manuais de pacote receberam o padrão exato de Turbo false; a UI compartilhada `shouldShowModelVisionBadge`, com o cartão de configurações e todos os pontos de consumo de `buildRegistryModelSelectGroups` conectados.

### Evidências de implementação e revisão

- Teste primeiro vermelho: PDF do Flash fora de Messages, Turbo dos templates de pacote e selos visuais dos três tipos de pacote somaram 5 falhas; após a correção, 6 arquivos com 96 testes unitários passaram. O Built-in Source real do Node/a ordenação das regras cobrem os três formatos, oficial/terceiros, prefixo/sufixo e caixa; overrides pessoais normais e `manual-provider-model` continuam com PDF=false. O Turbo da API comum já era false por padrão, e a premissa incorreta do primeiro rascunho de teste foi corrigida sem alterá-la para true.
- Dois casos de navegador passaram: 390 em chinês claro / 1200 em inglês escuro, cada um verificando conta pessoal/de equipe/Key de pacote manual, ocultando simultaneamente a visão do GLM-5.3 e preservando o Flash na página de configurações e no menu real `ModelConfigSelect`. O `supportsImage` subjacente continua true; o código de upload/codificação/requisição não foi modificado. Capturas em `/tmp/zcode-provider-settings-batch/vision-*.png`.
- typecheck raiz, lint (0 errors / 41 warnings) e arquitetura (0 violations) passaram. Comparação/review com as regras antigas: capacidades de GLM-4.7/GLM-5.3, regras exatas de Account e listas não foram alterados; o `supportsVisionInput` das opções de seleção de modelo serve apenas ao selo e não participa da validação de execução de anexos.
- A verificação de navegador cobre o componente compartilhado isolado e não representa a cadeia completa de um Host/Electron real em celular; nenhum serviço real de PDF foi solicitado e nenhuma configuração online foi publicada. A limitação de fontes chinesas segue o registro deste lote, e a revisão final continua pendente.