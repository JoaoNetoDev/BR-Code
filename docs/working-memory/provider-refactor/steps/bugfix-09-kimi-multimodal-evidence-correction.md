# Bugfix 09: Correção das evidências de capacidade multimodal do Kimi

> Status: concluído
>
> Data: 2026-09-01

## Problema

A Built-in Config grava incorretamente as seguintes capacidades de modelo:

| Model            | Valor atual              | Fato oficial atual                                                            | Valor alvo  |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------- | ----------- |
| `kimi-k3`        | Image=false、Video=false | A Kimi API e o material de lançamento do K3 deixam claro o suporte nativo a visão, com compreensão de imagem e vídeo | true / true  |
| `kimi-k2.7-code` | Image=false、Video=false | O FAQ oficial do Kimi declara explicitamente suporte a Text, Image e Video     | true / true  |
| `k3-256k`        | Image=true、Video=true    | A tabela oficial de modelos do Kimi Code declara Image only                    | true / false |

`packages/provider-node/test/zcode-builtin-integrity.test.ts` também afirmava os dois primeiros valores errados, o que fazia a configuração incorreta passar nos testes de forma estável.

## Causa raiz

A atualização dos materiais Built-in de 2026-08-28 registrou no resumo de pesquisa apenas o comprimento de contexto do K3, sem registrar as capacidades multimodais. Na implementação, "este material não registrou" foi interpretado erroneamente como "o modelo não suporta", fazendo os valores positivos existentes caírem para `false`. Isso não é um problema de Resolver, Overlay ou Adapter, mas uma regra de projeção manual incompleta, das evidências de publicação para a Config.

## Correção

1. Modificar primeiro o teste de integridade, fixando os três fatos oficiais e provando que a Config antiga falha.
2. Corrigir as Model Match Rules correspondentes, sem adicionar código de especialização por Provider/Model.
3. Incrementar a revision Built-in, garantindo que o Config Source em execução consiga observar o novo fato publicado.
4. Adicionar ao design de manutenção Built-in um gate de degradação de capacidade: a ausência de material não pode derrubar uma capacidade positiva já publicada.
5. Registrar esta revisão e as fontes oficiais atuais no relatório de evidências de publicação.

## Superfície de impacto

```text
Built-in Model Match Rules
            |
            v
Effective Model Config
            |
            v
Provider Registry / Active Model.properties
        |                    |
        v                    v
设置页与模型选择器       Runtime 输入检查 / Adapter 编码
```

- Não é adicionado nenhum capability DTO e não se infere capacidade por Model ID no Runtime.
- Active Models já criados continuam congelados; Models criados após o refresh da Config usam os novos fatos.
- A semântica de Desktop continuous, Web Remote replayable, Session Selection e filas não muda.
- Video continua sujeito tanto a `input_format.support_video` quanto à capacidade real de codificação do Adapter.

## Verificação

- Parsing da Built-in Config real: as três capacidades de mídia de K3, K2.7 Code e K3-256K.
- Testes unitários direcionados e typecheck de `@zcode/provider-node`.
- `pnpm typecheck` e `pnpm lint` na raiz.
- Verificação de formatação da Config e da documentação, e `git diff --check`.