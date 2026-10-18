# Todo 41: modelos em destaque e refresh de atributos do Built-in Provider

> Status: concluído
>
> Evidência: [`builtin-provider-model-evidence-2026-08.md`](../research/builtin-provider-model-evidence-2026-08.md)
>
> Correção posterior: o julgamento deste Todo de que o MiniMax M3 teria «endpoint oficial não confirmado, desativado por padrão» foi refutado pelo documento oficial atual de
> chamada de modelos; a conclusão final e a revisão 4 estão em [`Todo 43`](./todo-43-models-api-evidence-and-minimax-m3-correction.md).

## 1. Objetivo

Com base no site oficial dos fabricantes, em descobertas de busca e nos fatos de produto do ZCode já
confirmados em 2026-08, elevar
`config/provider/zcode-builtin.json` para a revisão 3: completar os modelos atualmente em destaque/únicos, corrigir capacidades
determinadas, expressar o enabled por padrão com a Provider-Model Exact Rule e fazer com que a ordem física dos membros do Provider corresponda à seção enabled.

Esta rodada aceita um resultado conservador, ainda que imperfeito; não se escreve suposição não verificada como estado
ativado. As APIs de validação de modelos continuam sendo calibradas depois com modelos independentes.

## 2. Resumo de impacto

### 2.1 Classificação das mudanças

- `option-source`: Built-in Provider Map e Built-in Model Config Rules.
- `draft-default`: fatos de Effective Model padrão vistos na página de settings ao adicionar/editar um modelo.
- `validation`: integridade do Registry, compatibilidade de Adapter e validação de capacidades de mídia/requisição.
- `persistence`: publicação da mudança de revisão; a estrutura de armazenamento do Personal Overlay não muda.

### 2.2 Estado e cadeia de execução

```text
Built-in revision 3
├─ Provider members / initial order
└─ Model Config Rules / exact enabled
              |
              v
Account Overlay
              |
              v
Personal Overlay
              |
              v
Effective Provider + Effective Model Config
              |
              v
Registry -> Active Model -> Adapter
```

Não altera Session Selection, fila, Compact, Memory, Subagent, Desktop continuous, Mobile replayable nem
workspace identity. O Active Model continua congelando o Effective Model Config no momento da criação do turno.

### 2.3 Principais sementes de implementação

- `config/provider/zcode-builtin.json`
- `packages/provider-node/test/zcode-builtin-integrity.test.ts`
- `docs/working-memory/provider-refactor/design/registry/zcode-builtin-provider-config.md`
- `docs/working-memory/provider-refactor/research/account-provider-and-builtin-config-review.md`

O ambiente atual não tem ferramenta de codegraph chamável; nesta rodada foram usados, em seu lugar, o Config oficial, os testes de integridade
do Resolver, os invariantes existentes de `capability.provider-registry` no Feature Graph e uma auditoria de referências com `rg`. Nada
exigiu mudar a propriedade de estado ou a cadeia assíncrona.

## 3. Decisões

1. O `glm-5.3` da API de Account comum permanece Text-only; ausência de erro não é evidência visual.
2. O Plan Provider continua fornecendo Image/Video para os membros reais por meio da Provider-scoped Match Rule.
3. Individual/Team passam a incluir `GLM-5.3`, com a ordem fixa 5.3, 5.3 Flash, 5.2, 5-Turbo.
4. Os membros Start continuam restritos pelo upstream de Account; nesta rodada não são expandidos estaticamente.
5. Adicionados Kimi K2.7 Code e Qwen 3.8 Max/Flash; completados os fatos estáticos do MiMo v2.5 Audio.
6. Na época, o MiniMax M3 foi tratado como candidato não confirmado e desativado por padrão; esse julgamento histórico foi corrigido pelo Todo 43 e não é mais a base de manutenção atual.
7. O enabled por padrão usa a Exact Rule `provider-model` já existente; nenhuma prioridade, ordenador ou terceira Rule é adicionada.
8. A renomeação de `supportsStructuredOutput` pertence ao Todo 39; nesta rodada apenas se corrigem os fatos de forma conservadora segundo a semântica de «JSON Schema estrito», sem misturar migração de campos.

## 4. Testes primeiro

Primeiro expandir o teste real de integridade do Built-in, de modo que a revisão 2 falhe:

- a revisão é 3;
- a ordem dos membros dos quatro Providers Individual/Team e as capacidades de imagem/vídeo do Plan;
- 5.3 Text-only da API comum, 5.3 Flash com imagem/vídeo;
- existência dos membros em destaque de cada fabricante e correção dos atributos-chave de context/max output/mídia;
- os modelos enabled de cada Provider formam um prefixo contíguo em `builtinModelIds`;
- substituídos/alias/candidatos não comprovados ficam disabled por padrão;
- cada membro Built-in tem enabled explicitamente definido pela Exact Rule daquele Provider;
- o Resolver, após completar os materiais de acesso, continua com zero issues, e a ordem dos membros do Registry bate com o arquivo.

Depois fazer a alteração mínima no Built-in Config para que os testes passem. Não é permitido adicionar modelId/Provider ID hardcoded ao código de produção.

## 5. Verificação e aceitação

1. `pnpm --filter @zcode/provider-node test`
2. `pnpm --filter @zcode/provider-node typecheck`
3. `pnpm --filter @zcode/provider test` e typecheck
4. `pnpm typecheck`
5. `pnpm lint`
6. Verificação de formatação relacionada e `git diff --check`
7. Buscas confirmando que não restaram fatos de modelos remotos antigos, hardcode de modelId em runtime ou um segundo conjunto de DTOs de capacidade.

Como não houve mudança em código de interação de UI nesta rodada, não se adiciona Desktop E2E; a página de settings e o seletor leem a revisão 3 pela
projection existente do Registry, e apenas se faz regressão de invariantes. No commit, apenas o Todo 41, os documentos de evidência/design, o Built-in Config e os testes
correspondentes são staged, preservando as alterações de outras tarefas no workspace.

## 6. Registro de implementação

- O Built-in Config foi elevado para a revisão 3: 21 Providers, 131 Match Rules e 179 Provider-Model Exact Rules.
- GLM-5.3 foi adicionado a Individual/Team; os fatos visuais da API de Account comum e do Plan foram separados.
- Kimi K2.7 Code e Qwen 3.8 Max/Flash foram adicionados, e os fatos estáticos do MiMo v2.5 Audio foram completados.
- As regras antigas de DeepSeek/Qwen não fazem mais o JSON Object passar por Schema estrito; o Responses Endpoint oficial do DeepSeek foi promovido separadamente.
- Todos os membros Built-in têm um único Exact enabled, e os membros enabled formam um prefixo contíguo de `builtinModelIds`.
- Verificação aprovada: testes e typecheck direcionados de Provider/Provider Node, testes de Provider Runtime, typecheck da raiz, lint da raiz
  (apenas os warnings já existentes no repo) e a suíte unitária completa (1492 files passed, 12730 tests passed).