# Integridade da exportação open source

## Escopo

A partir do `staging` mais recente, criar uma branch de correção e corrigir a ferramenta de
exportação, os tipos de placeholder, a documentação e os metadados de testes.
A lógica de execução da aplicação, os valores de protocolo, a temporização das requisições, o
comportamento da UI e as asserções de teste permanecem inalterados.

## Contrato

1. O pacote placeholder de Computer Use oferece pontos de entrada públicos de build e checagem
   de tipos, e o tipo do callback de log é consistente com o producer real;
   o build apenas valida o que é declarado junto ao pacote, sem produzir capacidade nativa; manter
   o ponto de entrada do projeto de testes unitários raiz e validar o comportamento do placeholder.
2. A identificação de testes órfãos casa por nome de arquivo completo ou caminho, e não pode
   apagar um teste público por causa de um nome de arquivo idêntico como substring.
3. O catálogo público de casos, a matriz de cobertura e os testes de fixtures de conta continuam
   sendo exportados; o conteúdo exclusivo da versão oficial vai para os arquivos temáticos já
   existentes.
4. A documentação e os comentários usam descrições do comportamento deste projeto, removendo
   caminhos pessoais, contas e comparações com outros produtos; nomes de protocolo, provider e de
   importações compatíveis são preservados.
5. O gate de concorrentes identifica nomes completos, permite terminologia explícita de paginação e
   chaves de protocolo; menções descritivas a produtos na mesma linha continuam sendo bloqueadas.
6. O `providerFixtures` do manifesto E2E aponta para fixtures upstream existentes; specs candidatos
   não são movidos e o estado de promoção não é alterado.
7. As correções de identificação de licença ficam vinculadas à versão exata do pacote e ao texto
   original do publicador; não se pode usar uma whitelist ampla nem atualizar hashes para mascarar
   lacunas de material.
8. A versão mais recente do README open source é consistente com a versão de origem.

### Admissão de preexistentes em um histórico Git independente

O lint e a checagem de arquitetura após a exportação não podem depender de objetos Git não
publicados. O exportador primeiro valida que os commits de admissão existentes pertencem ao ref de
origem especificado; depois gera um manifesto fixo de blobs Git e modos de arquivo para o código
fonte que, após a exportação, ainda corresponde à versão de admissão, preservando ao mesmo tempo os
caminhos upstream recém-publicados.
A política open source usa esse manifesto, e o código fechado continua usando a admissão por
commits original; as duas origens não podem ser habilitadas ao mesmo tempo.

O manifesto descreve apenas os arquivos publicados nesta rodada, não expõe caminhos excluídos e não
aceita automaticamente arquivos reescritos.
Os caminhos novos seguem a data de vigência das regras do ref de origem especificado; a data do
commit de exportação não pode fazer com que caminhos preexistentes e não retroativos voltem a entrar
no escopo de admissão.
Caminhos antigos que entram pela primeira vez no histórico público guardam separadamente o
conteúdo e o modo fixos, apenas restaurando a atribuição de data que existia no histórico de
origem; eles não participam da admissão de limite de linhas do lint.
O verificador compara simultaneamente a área de stage e a área de trabalho; edições após o commit,
restaurações após o stage, renomeações, mudanças de modo e arquivos não rastreados não herdam
isenção.
A admissão de preexistentes só reaproveita as regras originais de `max-lines` e `unmanaged-new-file`, e não
isenta outros erros de lint ou de estrutura de módulo.

```text
ref de origem especificado + commits de admissão já mesclados → exportador → manifesto fixo de conteúdo e modo dos arquivos públicos
                                           ↓
área de stage + área de trabalho em um histórico open source independente → comparação literal → regras originais de lint / arquitetura
```

A regressão deve rodar em um repositório Git novo, provando que a verificação funciona sem objetos
de commits fechados, e cobrindo o caso de saída da admissão após modificação.
O `vitest.config.ts` do pacote placeholder apenas monta o projeto de testes unitários, registrando
essa configuração de teste por caminho exato; não se expande para os arquivos de implementação do
producer.

## Aceitação

- Primeiro reproduzir o build/tipos do pacote placeholder, a remoção indevida de testes órfãos e os
  falsos positivos de termos; depois validar as correções.
- Reexportar: os hard gates ficam zerados; a documentação e os testes públicos existem e a pilha de
  patches está vazia.
- Em uma árvore open source independente com instalação congelada, executar o ponto de entrada de
  build, a checagem de tipos da raiz e da CLI, o lint, os testes unitários completos e a auditoria
  do manifesto de cobertura.
- No código fechado, executar a checagem de arquitetura, os testes afetados, a checagem de tipos e
  o lint. A verificação de fixtures cobre todos os manifestos modificados.
- A checagem básica de licença e a checagem estrita de material são reportadas separadamente; lacunas
  de material já existentes não contam como corrigidas.
