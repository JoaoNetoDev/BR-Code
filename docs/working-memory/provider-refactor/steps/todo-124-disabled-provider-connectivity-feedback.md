# Todo124: entrada de teste de conexão e mensagem de falha de Provider desabilitado

> Status: implementado em 2026-09-11, com review parcial, testes unitários e verificação de navegador compartilhada aprovados; o aceite final do lote e o push permanecem pendentes, e a interoperação real entre múltiplos dispositivos não foi testada.

## Problema

Após desabilitar um Provider, a página de configurações mantém a configuração e a lista de modelos, mas o Resolver deixa de publicar esse Provider para o Registry de execução. O botão de teste da linha do modelo apenas verifica se está testando, se o ID do modelo está vazio e se o callback existe, sem verificar o estado de habilitação do Provider. Ao clicar, o teste de conexão passa pelo caminho oficial de criação de Model, o Registry devolve `provider-not-found` e o usuário vê "fornecedor inexistente", o que facilmente o leva a achar que a configuração foi perdida.

## Mudança de escopo pequeno

1. Quando o teste de conexão confirma que o fornecedor está atualmente não executável, a mensagem é "该供应商当前不可用，无法测试连接" (o fornecedor está indisponível no momento, não é possível testar a conexão), sem continuar interpretando estados como desabilitado como configuração inexistente. Quando o próprio modelo está indisponível, usa-se "该模型当前不可用，无法测试连接" (o modelo está indisponível no momento, não é possível testar a conexão). Atende a chinês e inglês.
2. Quando o Provider está desabilitado, o botão de teste da linha do modelo fica esmaecido, com a dica "请先启用供应商" (habilite o fornecedor primeiro). Isso não altera a configuração do Provider nem as demais operações da linha do modelo.

```text
A página de configurações lê Provider enabled → quando desabilitado, o botão de teste fica esmaecido
                                     |
A chamada de teste chega (por exemplo, o estado muda após o clique) |
                ↓                    |
Validação de elegibilidade para execução pública já existente / cadeia de execução oficial ←--+
                ↓
disponível → teste normal; indisponível → mensagem clara, sem habilitação temporária nem substituição de modelo
```

## Limites de implementação

Contrato de implementação: ler o fato de elegibilidade atual do Settings Facade depois do `waitForProviderOperations` já existente. Verificar primeiro se o Provider existe/está habilitado, depois se o modelo de destino está desabilitado/com problema de configuração, e só então a elegibilidade pública executable; não consultar novamente Key/benefícios. Falhas de elegibilidade confirmadas retornam o code opcional de `ModelConnectivityResult.error` (provider-unavailable / model-unavailable) e a mensagem padrão; a UI localiza conforme o code, e as demais mensagens de erro são mantidas como estão. Esse resultado pertence ao serviço de configurações do App já existente, e o protocolo de execução do Agent não muda; após a verificação, o ambiente de destino continua mantendo a validação oficial final.

- Reutilizar o resultado de elegibilidade de configuração / execução pública já existente, sem reescrever na UI ou no serviço de teste as regras de validação de Key, benefícios e configuração de modelos, e sem adicionar cache de estado ou mecanismo de espera síncrona.
- Tratar a mensagem na fronteira do teste de conexão; não substituir globalmente o `provider-not-found` do Registry e não modificar outros contratos de erro de negócio.
- Não unificar toda falha de teste (falha de rede, de autenticação, de assinatura etc.) como "indisponível"; preservar a informação real de erro. Quando não for possível confirmar que é um problema de elegibilidade, também não se deve reescrever o motivo do erro à toa.
- Não alterar as regras de publicação do Registry, a validação final do ModelFactory ou o princípio de o teste de conexão reutilizar o caminho de requisição oficial; não habilitar o Provider sorrateiramente, não contornar a configuração, não trocar de modelo e não limpar a seleção salva.
- Problemas semelhantes de desabilitar apenas o modelo devem ser verificados durante a implementação; não se deve estender isso para refazer o estado de todos os botões de teste nem todo o sistema de erros.
- A entrada de configurações compartilhada entre desktop e celular permanece consistente; sem alterar layout nem a fronteira de transmissão do remote existente.

## Implementação e aceite

- [ ] Atualizar primeiro as specs de configurações / teste de conexão relevantes, adicionando testes com poder discriminante, e só então modificar o código.
- [ ] Após desabilitar o Provider, o botão de teste não pode ser acionado; ao reabilitar, ele volta a funcionar conforme as condições existentes, sem alterar o estado de habilitação individual dos modelos.
- [ ] Quando a chamada de teste é feita diretamente ou o Provider é desabilitado após o clique, a mensagem de fornecedor indisponível é exibida e nenhuma requisição de modelo que contorne a desabilitação é gerada.
- [ ] O erro de modelo indisponível é distinguível do de Provider indisponível; as mensagens de erro normais e de rede / autenticação / assinatura não são afetadas.
- [ ] O E2E de interação da página de configurações cobre desabilitar, reabilitar e as mensagens, atendendo ao desktop / celular compartilhados e à internacionalização; verificações de ambiente não concluídas são registradas com honestidade.
- [ ] Executar em lote os testes unitários relevantes, a verificação de tipos e o lint, revisando o reuso da decisão pública, a classificação de erros e a ausência de efeitos colaterais de configuração antes de fechar o Todo.

## Pontos de entrada de código

### Implementação e re-revisão desta rodada

- O enabled do Provider é passado do card ao botão de teste pela lista já existente, e a desabilitação afeta apenas o botão de teste; ao reabilitar, o estado e a configuração do próprio modelo são preservados.
- O serviço lê o fato público atual do Settings Facade depois da fila de operações já existente, e não chama o teste oficial quando a elegibilidade não corresponde; erros de elegibilidade conhecidos de Provider/Model retornam um code local e estável para a apresentação em chinês e inglês na UI. Nenhuma cópia da verificação de Key/benefícios, nenhuma alteração global de erro do Registry e nenhuma espera de estado adicional.
- Falhas posteriores da requisição oficial são retornadas como estão, mantendo a validação final do Environment de destino; não se pode prometer que a configuração nunca muda após uma leitura, nem usar isso para esperar consistência forte entre processos.
- 4 casos de falha do serviço ficaram vermelhos primeiro; rodados junto com 119, 74 casos passaram, e após complementar os casos de Provider/Model ausente e de erro de assinatura do upstream não reescrito, os 10 casos do serviço passaram (incluindo sobreposição com o lote anterior). 4 casos de navegador compartilhado passaram, com desabilitar/reabilitar, chinês/inglês, dois temas e tamanhos de celular e desktop testados.
- typecheck/lint da raiz e a verificação de arquitetura passaram; a revisão item a item não gerou desvio de requisição de modelo, habilitação automática, reescrita de seleção nem mudança no protocolo de remote. A interoperação real Host / shared-host de celular não foi testada; o lote final ainda faz a revisão de entrega.

- `packages/ui/src/settings/model-provider-section/ProviderFormControls.tsx`: condição do botão de teste da linha do modelo.
- `packages/ui/src/settings/model-provider-section/InlineEditableProviderCard.tsx`, `ProviderCardSections.tsx`: passagem do estado do Provider e do callback de teste.
- `packages/services/src/model-provider/providerFacadeServices.ts`, `providerSettingsConnectivity.ts`: entrada do serviço de teste de conexão e retorno de erros.
- `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`: complemento dos níveis auxiliares e entrada oficial de teste de conexão.
- `packages/provider/src/resolver.ts`, `registry.ts`: elegibilidade para execução e fatos de validação já existentes; em princípio não são alterados.