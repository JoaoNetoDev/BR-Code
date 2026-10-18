# Todo117：Ao Salvar um Provider, Preservar o Domínio da Conta, Completar a Seleção de Plano e Remover a Desativação de Conta

> Estado: em 2026-09-11 a implementação, o review parcial, os testes unitários relacionados e a validação no navegador compartilhado passaram; a aceitação final do lote e o push ainda estão pendentes. A integração real com shared-host / Pro no celular não foi executada e não conta como testada nesta rodada.

> Decisão mais recente (2026-09-11): todos os Built-in Account Provider passam a não permitir desativação, substituindo a regra anterior de "apenas esconder a entrada e manter em vigor um `enabled=false` já existente". Os Provider com Key manual (incluindo as instâncias criadas a partir de templates de preset) continuam permitindo ativar e desativar.

## Contexto e Causa Raiz

O log do Air mostra que, em 15:12:34, depois de salvar um Provider Overlay, `providerFamilyDomain` foi esvaziado a partir de `bigmodel`; em seguida, ao escolher um time, o entitlement era true, mas o domínio da conta continuava ausente e o `current=false` do Account State tornava os modelos do plano não selecionáveis. O log não registrou os parâmetros completos daquele salvamento, portanto não é possível afirmar qual controle o usuário apertou especificamente.

`ModelProviderSection.handleSave()` esvaziava ativamente o domínio da conta com base no `executable` após o salvamento, confundindo a elegibilidade de execução da configuração com a escolha de conexão do usuário. A troca de plano escrevia apenas a seleção de plano, sem conseguir recuperar o domínio da conta; a página de configurações exibia corretamente por meio do fallback da identidade de login, o que também não significa que a escolha persistida no Host esteja completa.

## Mudanças Já Decididas

### 1. Remover a limpeza automática após o salvamento

- O salvamento de Provider apenas salva a configuração, atualiza a visualização existente e faz os refrescamentos necessários; remover o branch que esvaziava o domínio da conta porque o domínio atual não tem Provider executável.
- Limpar o `hasUsableProviderInFamilyDomain`, usado apenas por esse branch, e as dependências inúteis.
- Desativação, ausência de Key, falta de entitlement ou configuração incompleta afetam apenas a elegibilidade de execução, e não alteram a escolha da conta, o timestamp ou a marca de migração.
- A lógica de limpeza da saída normal de login e do desvinculamento é mantida. O mecanismo de merge do Overlay não é modificado.

### 2. Ao trocar de plano ativamente, salvar a escolha completa

```text
用户主动选择 BigModel 团队（包括再次选择当前项）
  → 比较账号域与完整套餐身份
  → 有变化／账号域缺失：同一次设置更新
       providerFamilyDomain = bigmodel
       connectionSelections.bigmodel = 所选团队身份
  → 复用既有 Provider 刷新与公共执行资格判断
```

- A identidade do plano mantém os campos existentes como kind, organização, projeto e produto; a escolha do outro domínio de conta é preservada e nenhuma estrutura de identidade nova é criada.
- "Seleção inalterada" precisa verificar ao mesmo tempo o domínio da conta e o plano; reselecionar o mesmo item pode recuperar o domínio ausente. Quando os dois forem iguais, vale a semântica existente de retry/deduplicação.
- A escrita do domínio da conta segue a convenção existente de timestamp de configuração e marca de migração, sem novos campos de estado.
- É disparado apenas pela escolha ativa; abrir a página, a hidratação automática, o refrescamento em segundo plano e a mudança de entitlement não podem selecionar domínio ou plano automaticamente.
- Complemento da auditoria de implementação: a página atual grava automaticamente um time inválido como pessoal depois que a assinatura de equipe é atualizada. Esse effect conflita diretamente com o item acima, portanto a troca automática e sua função de verificação exclusiva também são removidas; a invalidade de entitlement continua sendo retornada pela verificação pública de elegibilidade, sem usá-la para trocar de plano.
- Quando o alvo está indisponível, a verificação pública apresenta-o como indisponível, sem afrouxar o Resolver, substituir modelos sorrateiramente ou habilitar o Provider.

### 3. Remover a capacidade de desativação total dos Account Provider

- A verificação usa `access.type === "zhipu-account"`, e todos os Account Provider que usam esse tipo não exibem a entrada de ativar/desativar total do Provider na interface de configurações; não se decide por nome nem por hardcode de Provider ID.
- `api-key` e `zhipu-coding-plan-api-key` mantêm o interruptor geral; uma Coding Plan Key manual não equivale a uma conexão de conta.
- O Built-in Account Provider não permite desativação total: a UI não exibe a entrada, a fronteira pública de escrita de configuração rejeita novas operações de desativação, e a resolução pública passa a tratar um `enabled=false` de conta já existente como não mais válido; não se pode apenas esconder o interruptor e deixar um estado de desativação sem como se recuperar. A visualização de configurações e a elegibilidade de execução leem o mesmo resultado, sem fingir na UI que está habilitado.
- Manter o Schema `enabled` na camada externa do Provider genérico; a semântica de ativar/desativar dos Provider com Key manual permanece a mesma; sem novos interruptores de Family, cache de estado ou migração de dados. Os valores de desativação de conta já existentes deixam de ter efeito sem precisar apagar arquivos em massa nem alterar os dados reais de usuários, e a implementação concreta reutiliza as fronteiras públicas de configuração e resolução.
- "Não pode desativar" não significa executável: as verificações públicas de conexão atual, entitled, credenciais, completude da configuração e modelos disponíveis continuam valendo, e `executable=true` não é forçado diretamente para a conta.
- Os interruptores de ativar/desativar de cada linha de modelo permanecem; isso não afeta a execução já fixada em andamento.
- Esta decisão substitui os requisitos anteriores de exibição e de efeito da desativação de contas; ela acompanha o Todo118, e a primeira migração não importa valores antigos de desativação de contas embutidas. Esta rodada também não implementa incidentalmente os ajustes de layout de barra de título, menu e interruptor de Key manual do Todo115.

## Escopo e Aceitação

- Não refatorar conexão única, sincronização de conta, autenticação, Registry, Model Selection ou primeira migração; a escrita/resolução pública ganha apenas a restrição acima de conta não desativável, a primeira migração fica a cargo do Todo118 e nenhum mecanismo de inferência automática novo é adicionado.
- Desktop e Web no celular reutilizam componentes compartilhados e o serviço de configurações, sem novos Host/Agent e sem mudar a fronteira continuous/replayable. Os itens sem teste real ficam registrados explicitamente.
- [ ] Cobrir primeiro com testes: ao salvar um Provider do domínio atual, nos casos de desativação/sem entitlement/incompleto e sem Provider executável, o domínio da conta não é esvaziado automaticamente nem o plano é alterado.
- [ ] Complementar com testes de interação de plano: os dois domínios de conta, reseleção do mesmo item recuperando o domínio ausente, troca de plano/identidade de time, seleção idêntica mantendo a deduplicação; o refrescamento em segundo plano não escreve a escolha.
- [ ] Verificar que, após recuperar a partir do domínio ausente, os modelos de equipe que satisfazem a elegibilidade pública original ficam selecionáveis; sem entitlement ou fora da conexão atual continuam não executáveis, e Provider com Key manual desativado continuam não executáveis.
- [ ] Um `enabled=false` de conta existente não desativa mais o Provider; novas submissões de desativação de conta pela entrada de escrita oficial são rejeitadas, e a visualização de configurações da conta / o resultado público de execução são consistentes, sem passar por uma falsa exibição da UI. Cobrir separadamente pessoal, equipe, Start, conta ociosa e as duas families; `disabled` do próprio modelo permanece válido.
- [ ] Complementar com testes de interação da UI compartilhada: contas sem interruptor geral, os dois tipos de Key manual com interruptor geral e salvamento normal; interruptores de modelo mantendo o comportamento original; cobrir chinês e inglês e as larguras desktop/celular.
- [ ] Implementar as três correções parciais, limpando branches inválidos e dependências; não ampliar a correção para outros problemas existentes.
- [ ] Executar em lote os testes unitários relacionados, o E2E de interação, typecheck, lint e a verificação de arquitetura; revisar novamente com evidências de runtime, sem repetir regressões de grande escala para cada item pequeno.
- [ ] Fazer um review completo de todos os requisitos deste Todo, registrar evidências, limitações não testadas e, somente depois da submissão, marcar como concluído. Ajustes reais na configuração de usuários exigem autorização à parte.

## Implementação e Revisão Item a Item (2026-09-11)

- O salvamento escreve apenas o Provider; a limpeza de domínio por `executable` e os helpers exclusivos foram removidos. A troca ativa de plano escreve, na mesma atualização, o domínio da conta completo / timestamp / marca de migração / identidade original do plano, deduplicando pelo domínio persistido e não pelo fallback de exibição. O caminho original de saída de login foi preservado.
- A regressão em React montado reproduziu adicionalmente "lista de equipes vazia em segundo plano → gravar automaticamente o pessoal"; o effect e as funções exclusivas/testes obsoletos foram removidos. Uma busca em `dep:refs` por todo o domínio encontrou apenas essa chamada de negócio; as referências em teste foram conferidas separadamente com rg. A lista de equipes continua sendo exibida normalmente e a elegibilidade continua vindo do resultado público, sem nova consulta de conta nem troca automática.
- O Resolver público ignora o `false` antigo da conta e o save público rejeita novos `false` de conta; os dados originais não são apagados. A Facade de configurações e o Registry usam o mesmo resultado de resolução. Foram cobertas duas families × quatro modos, sem entitlement / fora da conexão atual, modelo `disabled` e desativação de Key manual.
- 503 testes unitários em lote passaram; em seguida foram complementadas as asserções de motivo de desativação do sistema / ausência de Key e de alteração de projeto de equipe, e 18 testes reexecutados passaram (com sobreposição, não somados). Quatro casos reais de navegador com cards passaram, em chinês/inglês, claro/escuro e tamanhos 390 e 1200: conta sem interruptor geral com os interruptores de modelo preservados, ativar/desativar de Key manual, preservação da Key, link único e retry de erro sem rollback.
- O typecheck da raiz passou, com lint em 0 errors / 41 warnings e arquitetura em 0 violations. Na primeira inicialização do navegador faltou a libatk; executou-se com o uso das dependências isoladas já existentes em `/tmp/zcode-xvfb-LMxR8B/root/usr/lib/x86_64-linux-gnu`; nenhuma configuração de sistema ou de usuário foi modificada.
- Revisão de escopo: não foram alterados Model Selection, objetos de execução, sincronização de conta, merge de Overlay nem o protocolo de controle remoto. Callbacks de página inteira / testes de montagem e a cobertura de navegador dos cards compartilhados não substituem um链路 real de Host/celular; o lote final ainda exige revisão de entrega.