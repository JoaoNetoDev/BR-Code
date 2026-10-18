# Todo 25: Aposentadoria da Entrada de Produto ZAPI e de Compatibilidades Exclusivas

> Status: concluído
>
> Data: 2026-08-27
>
> Pré-requisitos: baseia-se na cadeia autoritativa ZCode Built-in Config / Registry já concluída no Todo 21; não altera a semântica de seleção de modelos nem de Provider, Model, Account Family ou workspace remoto em geral.

## 1. Decisão de produto

`builtin:zapi` deixa de ser um Provider nos produtos ZCode. A página de configurações, a seleção de modelos, o runtime, a Telemetry, os tipos compartilhados atuais, a documentação atual e os testes
não podem continuar apresentando o ZAPI como uma entrada disponível, e o Renderer também não pode fabricar estaticamente um Provider placeholder quando o Registry do Host de destino não o possui.

Após a remoção, a cadeia de fatos é:

```text
ZCode Built-in Release / Personal Config / Account Overlay
                       |
                       v
              Target Host Registry
                       |
                       v
            Settings / Model Selection

Renderer 不再维护 builtin:zapi 身份或内网可见性门禁。
```

## 2. Escopo da Remoção

- Remover o ZAPI do `BUILTIN_MODEL_PROVIDER_IDS` e do `BuiltinModelProviderId` atuais;
- Remover da página de configurações o ZAPI Preset estático, o estado vazio, o Hook de visibilidade interna, os ícones/nomes/URLs exclusivos e os casos especiais de exibição na seleção de modelos;
- Remover o internal-only gate, o Runtime Override, a injeção do Vite e os testes correspondentes que servem apenas ao ZAPI;
- Remover os rótulos de Telemetry do ZAPI, os casos especiais de family no Composer e outros hardcodes de runtime;
- Os importers de Legacy Provider do Desktop e do CLI, ao reconhecer o histórico `builtin:zapi`, o descartam diretamente, sem migrá-lo para Personal Provider nem para Environment Configured Default; com isso, os antigos casos especiais de Endpoint Anthropic, formato de modelo e normalização de Reasoning do ZAPI são removidos;
- Os Design, instruções de configurações e documentos de produto atuais removem a descrição da entrada ZAPI; Changelog, logs históricos de implementação e planos arquivados continuam preservados como evidência histórica;
- Os testes que usavam ZAPI apenas como um ID de Provider arbitrário passam a usar um ID de teste neutro, evitando que os testes continuem sugerindo suporte do produto.

O `SystemService.probeIntranet` genérico, o endereço de download das dependências internas e o `INTRANET_MACHINE_HOST` não pertencem ao ZAPI e continuam mantidos.

## 3. Limites de Compatibilidade

- Não fornecer alias do ZAPI, entrada oculta, Feature Flag ou caminho de reativação;
- A Bundled Config atual não tem ZAPI, e nenhum Provider tombstone é adicionado;
- Se um Release Remote / Active / LKG contiver `builtin:zapi`, o Release inteiro é considerado incompatível e cai para outros candidatos compatíveis;
- O ZAPI em configurações físicas antigas é ignorado na fronteira do importer de uso único; os demais Providers são migrados como estão;
- O ZCode Built-in Release remoto deve parar de distribuir o ZAPI. O cliente não cria mais entradas fantasma para o ZAPI ausente.

## 4. Aceitação

- O código-fonte atual, as configurações oficiais e a documentação não histórica não contêm mais as entradas de produto `builtin:zapi` / `ZAPI`;
- `isBuiltinModelProviderId("builtin:zapi")` retorna `false`;
- A lista de Settings Preset não contém ZAPI;
- Quando o Legacy Store contém tanto ZAPI quanto Providers comuns, apenas os Providers comuns são importados;
- Desktop, Web e Remote Settings consomem apenas o Registry do Host de destino, sem executar a detecção de rede interna do ZAPI;
- Os testes unitários direcionados, `pnpm typecheck` e `pnpm lint` passam.

## 5. Resultado da Implementação

- A identidade Built-in atual, os Settings Preset, a exibição na seleção de modelos, a Telemetry e o Composer já removeram o ZAPI;
- O internal-only gate exclusivo do ZAPI, o Hook do Renderer, o Runtime Override e a injeção do Vite foram removidos;
- A decodificação do ZCode Built-in Release rejeita candidatos Remote, Active ou LKG que contenham o ID aposentado, evitando que uma configuração remota antiga volte a publicar o ZAPI;
- O Desktop Legacy Store Reader e o importer do CLI mantêm apenas o ID privado retired e descartam antes de qualquer normalização o antigo Provider ZAPI e a seleção padrão;
- Os Providers atuais, a detecção de rede interna, a página de configurações e a documentação de seleção de modelos foram sincronizados, enquanto logs históricos e o Changelog não são reescritos;
- Os testes direcionados de Bootstrap 39/39 e o caso de autoridade remota ZAPI Legacy passaram; a regressão de merge de Provider/Adapter/Bootstrap do CLI após o fechamento do Todo 24 passou 228/228;
- O `pnpm lint` raiz tem 0 error (34 warnings pré-existentes), e o `pnpm typecheck` raiz passou;
- A suíte unitária completa da raiz só foi bloqueada por dois casos ZIP do Windows sem relação, por falta do utilitário de sistema `zip` no host; com a inclusão isolada de um comando compatível, os casos correspondentes passaram 17/17;
- A verificação de formatação direcionada dos arquivos alterados nesta rodada passou; o `pnpm fmt:check` raiz continua bloqueado por arquivos binários já existentes no repositório e por erro de parsing de HTML de exemplo upstream do Electron.