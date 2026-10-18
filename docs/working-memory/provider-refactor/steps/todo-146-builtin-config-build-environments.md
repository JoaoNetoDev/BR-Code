# Todo146: empacotar a configuração Built-in de Provider por ambiente de produto

Status: implementado, com a verificação de build deste ciclo e a revisão concluídas.

> Decisão posterior: o Todo147 passou a ter o arquivo de produção como única fonte de edição, e o script deriva a URL da conta de teste e as regras de site.
> A expressão "duas initially idênticas" abaixo registra apenas o estado na conclusão deste Todo e não exige mais manutenção independente posterior.

## Escopo já decidido

- A configuração oficial mantém `config/provider/zcode-builtin.json` e ganha `zcode-builtin.test.json`.
  O conteúdo inicial e o revision são exatamente iguais, permitindo manutenção independente posterior.
- A seleção é feita por `ZCODE_ENV` em tempo de build, e não por branch nem por inferência de `NODE_ENV=production`.
- Desktop, CLI, SEA, HTTP Server, Server remoto e Server CLI compartilham o mesmo ponto de entrada de seleção e validação do build.
- O caminho do recurso de saída e o Schema de runtime não mudam, sem novo Overlay, sem migração de configuração pessoal e sem publicação de configuração online.
- A configuração precisa ser atualizada mesmo ao reutilizar o JS antigo da CLI; o Turbo registra o ambiente e as entradas de configuração no cache.
  O tar remoto continua reutilizando o hash de conteúdo já existente, sem construir cache em duplicidade.

Contrato detalhado: [empacotamento para dois ambientes](../../../builtin-provider-config-build-environments.md).

## Aceitação

- [x] Diferenças de ambiente e mudanças de conteúdo no mesmo ambiente chegam ambas ao recurso de configuração final / artefato embutido.
- [x] Ausência, JSON corrompido ou erro de Schema causam falha direta do build, sem usar silenciosamente a outra configuração.
- [x] Cobertura de JS reutilizado, recursos SEA e pontos de entrada de Desktop e Server; caminhos corretos em modo de desenvolvimento e empacotado.
- [x] As duas configurações reais são inicialmente idênticas e ambas passam pela decodificação completa.
- [x] Tipos, Lint, testes afetados, build e revisão geral concluídos; registradas as limitações de empacotamento em máquina real não cobertas.

## Verificação e revisão de 2026-09-14

- 13 novos itens do contrato de build passaram: Release temporário com conteúdos diferentes, seleção de ambiente, ausência e corrupção,
  atualização no mesmo ambiente, refresh após reutilizar JS, build real do CLI, recursos SEA e a execução do próprio config do tsup após empacotamento.
  O contrato Node foi incluído na regressão diária por meio de um caso encapsulado em Vitest.
- 11 arquivos Vitest relacionados, 103 itens passando (incluindo a entrada do contrato Node acima); verificações de tipo, formatação e arquitetura passaram,
  Lint com 0 erros e 42 avisos já existentes.
- 50 testes existentes de CLI build / SEA passaram e 1 falhou: a extração de closure de SEA/TUI não encontra
  `@zcode/shared/src/index.ts`. O mesmo erro foi reproduzido em uma baseline limpa de `hotfix/3.12.2`, sem ampliar a correção desta vez.
- O build real passou: CLI desktop-agent, main/host/preload/scheduler do Desktop, HTTP Server, Server remoto e Server CLI.
  O JSON final colocado ao lado da CLI é byte a byte idêntico ao arquivo-fonte selecionado.
  Os três JS finais de Server foram analisados e confirmaram que a string embutida é idêntica ao JSON selecionado.
- O dry-run do Turbo confirmou que as duas configurações e as ferramentas comuns entram em inputs e que test/production geram hashes diferentes.
  A declaração de cache amplia apenas as duas tarefas de empacotamento da CLI, evitando que pacotes dependentes comuns recompilem inteira por causa de mudanças no JSON.
- Na execução real foi descoberto que o tsup faz inlining da dependência de configuração e reloca `import.meta.dirname`: passou-se a carregar dinamicamente a ferramenta comum de build,
  e foi adicionada uma regressão para o carregador de configuração real, sem depender de inferência por caminho somente leitura.
- As duas configurações estão ambas na revision 26, com SHA-256 de bytes
  `9aae91bac60f689edf8265806aba2317f1eac12b5793f32be14bdac462651e2d`.
- A revisão confirmou: não alterar a injeção de ambiente no runtime, a prioridade da atualização online, os dados do usuário nem a cadeia de mensagens continuous / replayable.
  Não foram executados instaladores completos assinados de macOS/Windows, o executável SEA completo nem a aceitação de instalação em máquina real;
  não há mudança de interação de UI e nenhum E2E de interação de desktop foi adicionado. Nada foi enviado ao remoto e nenhuma configuração remota foi publicada.