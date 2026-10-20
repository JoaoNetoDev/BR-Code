# Detecção do producer de Computer Use

## Regras

A implementação real do Computer Use vem do pacote `@zcode/zcode-cua` (producer) do workspace. A exportação open source
o substitui pelo pacote placeholder `packages/zcode-cua`, que declara `zcodeCuaPlaceholder: true` em `package.json`, com
todas as capacidades em fail-closed.

O pacote placeholder mantém as entradas públicas `build` e `tsconfig.json`, e o build verifica apenas as declarações de tipo
que acompanham o pacote. O `traceId` e os tipos de parâmetro do callback de log são idênticos aos do producer real, de modo
que os chamadores públicos não precisam ramificar por versão de lançamento. O `vitest.config.ts` referenciado pelos testes
unitários da raiz também precisa existir, executando os testes de contrato de indisponibilidade da entrada de execução
placeholder e do broker.

Etapas de desenvolvimento, build e empacotamento que sirvam apenas ao Computer Use real só podem ser executadas depois de
detectar o producer real; quando a detecção falha, a etapa deve ser pulada, para que as entradas da árvore open source não
quebrem por falta dos artefatos privados:

| Etapa                                                                                     | Local                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Build de inicialização de desenvolvimento do Helper no macOS e injeção das variáveis de ambiente do Helper | `scripts/dev-desktop-env.mjs`                        |
| Staging em desenvolvimento das dependências nativas (Sharp) do plugin de Computer Use     | `scripts/stage-dev-cua-plugin-runtime.mjs`            |
| Preparação de recursos de runtime no Windows `prepare:windows-cua-helper`                   | `packages/desktop/scripts/prepare-runtime-assets.mjs` |
| Empacotamento com recursos do Helper no macOS e Helper do Windows, verificação e finalização do Helper após o build | `packages/desktop/electron-builder.config.js`         |

O staging e a verificação do Sharp continuam baseados em "o producer declara a dependência Sharp"
(`isSharpRequiredByComputerUse`), de forma consistente com esta detecção: o producer real declara Sharp, o pacote
placeholder não declara.

## Propriedade e interface

- Única decisão: `readComputerUseProducer` / `isRealComputerUseProducerInstalled` em `packages/desktop/scripts/computer-use-producer.mjs`. Procura, subindo a partir do diretório do pacote do desktop, a instalação mais próxima de `@zcode/zcode-cua` e lê o campo `zcodeCuaPlaceholder` do manifesto.
- A configuração de build faz a avaliação de forma síncrona, com uma única leitura síncrona de arquivo pequeno.

## Aceitação

1. Código fechado (producer real): o comportamento das etapas acima permanece inalterado.
2. Pacote placeholder: os scripts de preparação de `pnpm dev:desktop` carregam, o staging do runtime do plugin em desenvolvimento retorna vazio, o Windows não prepara o Helper e o empacotamento não inclui nem verifica o Helper.
3. Testes unitários: `packages/desktop/test/placeholderProducerDetection.test.ts` cobre os três casos (real, placeholder, não instalado) e o skip de staging.