# Notas adicionais sobre o código-fonte do ZCode Plan

## Origem

- Repositório de origem: repositório interno `zcode/zcode-server`
- Branch de origem: `main`
- Commit de origem: `b29f7bf78388d137bdf078bb644963bee611c80c`
- Diretório de origem: `internal/application/zcodeplan`
- Local de destino neste projeto: `code/zcodeplan`

## Limites

`code/zcodeplan` mantém os pacotes Go e os caminhos de import internos originais do `zcode-server`, para permitir comparações, migrações ou a implementação posterior de capacidades relacionadas a off-peak task / plan.

A alteração atual apenas anexa o diretório de origem a este projeto, sem integrar esse código Go ao build, ao runtime ou aos fluxos de UI deste repositório.