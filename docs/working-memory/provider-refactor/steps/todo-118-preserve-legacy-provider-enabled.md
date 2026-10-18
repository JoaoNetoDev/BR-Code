# Todo118: preservar o estado de ativação do usuário na primeira migração de Provider

> Status: em 2026-09-11 a correção da primeira importação foi implementada, com testes direcionados e review local aprovados; a aceitação conjunta de «conta não desativável» acompanha o Todo117, e a aceitação final do lote completo ainda está pendente. Nenhuma configuração real de usuário foi modificada.

> Decisão mais recente: todas as desativações antigas dos Providers de conta embutidos são canceladas e não é permitido desativá-los; não se espera mais distinguir se essa desativação foi gerada pelo usuário ou pelo sistema. Providers de Key manuais mantêm a capacidade de ativar/desativar, e instâncias criadas por template não equivalem a contas embutidas. As restrições vigentes de escrita/resolução de contas são assumidas pelo Todo117; este item é responsável pela primeira migração.

## Problemas confirmados

Tomando `origin/staging_backup` como baseline do formato antigo. A configuração antiga guarda o `enabled` externo do Provider, e o leitor consegue lê-lo corretamente tanto de fora quanto do antigo `zcode.enabled`. Atualmente, `importLegacyPersonalProviderConfig()` não copia esse campo ao criar a nova regra de Provider, e o Resolver comum usa `rule.enabled ?? true`.

```text
config antiga enabled=false
  → o leitor preserva false
  → o importador perde enabled
  → a regra nova fica sem enabled
  → o Resolver habilita por padrão
```

Já foram feitas verificações em memória, sem rede, chamando o importador e o Resolver reais: quando o valor antigo de um Provider customizado é `false`, `true` ou ausente, o resultado da importação fica sempre sem `enabled` e o resultado da resolução é sempre `true`. Não é uma exibição falsa da UI, e não exige modelos especiais nem operações complexas para ser disparado.

Pontos de entrada relacionados:

- `packages/services/src/model-provider/legacyZCodeConfigProviderReader.ts`
- `packages/services/src/model-provider/legacyPersonalProviderConfigImporter.ts`
- `packages/provider/src/resolver.ts`
- `packages/services/test/legacyPersonalProviderConfigImporter.test.ts`
- `packages/services/test/legacyProviderUpgrade.test.ts`

## Escopo e limites da correção

1. Providers customizados: preservar a intenção antiga de ativação, gravando o `enabled` explícito no nível **externo** da nova regra de Provider, no mesmo nível de `providerId`, sem gravá-lo em `config` nem em regras de modelo. `false` e `true` são preservados como estão, e ausente continua ausente; não se modifica o comportamento padrão unificado do Resolver.
2. Não converter a desativação do Provider em desativações individuais de modelos, não limpar Key, membros de modelo ou histórico de Selection, e não afetar execuções em andamento já fixadas. Não se aproveita para modificar o domínio de contas, pacotes ou direitos.
3. Identidades antigas de conta embutida: não importar `enabled=false`, e deixar de distinguir desativação feita pelo usuário de desativação gerada pelo sistema por falha de login, conexão ou direito. O Provider de conta é reconstruído conforme a configuração atual, continuando sujeito a conexão, direitos, credenciais e elegibilidade de execução de modelos; não significa execução forçada.
4. As identidades de API antigas `builtin:bigmodel / builtin:zai` seguem a fronteira já estabelecida no Todo35 — migrar apenas a Key e não resgatar o `enabled` antigo —, e este item não amplia a migração de identidades. Após a migração, as instâncias com Key manual continuam podendo ser ativadas/desativadas pelo usuário; outras instâncias manuais criadas por templates de preset também não se enquadram na regra de conta não desativável.
5. Este item corrige primeiro a primeira importação. Configurações novas de Key manual já migradas não podem ser sobrescritas automaticamente a partir do arquivo antigo: uma divergência entre o `enabled` antigo e o novo pode conter alterações ativas feitas após a migração. O `enabled=false` de contas já migradas deixa de valer graças à nova semântica unificada do Todo117, sem depender de reexecutar a migração ou reler o arquivo antigo. O remendo de Providers manuais já migrados não é implementado automaticamente por este item.
6. A configuração antiga original é preservada, sem sobrescrita nem escrita dupla; não se adiciona releitura de campos antigos em runtime. Omissões na migração do nível de raciocínio são corrigidas pelo Todo121 e não entram neste item.

## Aceitação e revisão

- [ ] Adicionar primeiro testes com poder discriminante: Provider customizado antigo com `false`/`true`/ausente, lendo o arquivo antigo, importando, salvando o formato novo, relendo e passando pelo Resolver em toda a cadeia, cada resultado conforme o esperado.
- [ ] Usando fixtures offline com placeholders de Key válidos e configuração completa de modelos, provar que `false` não publica modelos executáveis; `true` e o padrão continuam sujeitos às condições comuns de integridade de configuração, sem afrouxar a elegibilidade de execução por estar habilitado.
- [ ] Cobrir a prioridade de leitura entre o `enabled` externo antigo e os campos estendidos antigos, verificando que o novo campo fica fora da regra, que o Schema o aceita e que o conteúdo da configuração original não muda.
- [ ] Conferir os ramos de API/conta embutida: a API antiga migra apenas a Key; a desativação antiga de conta não é importada e a presença ou ausência de `systemDisabledReason` não bloqueia nada. Verificar em conjunto com o Todo117 que a conta não pode ser desativada e que a ativação/desativação da Key manual e de cada modelo não é afetada.
- [ ] Manter o limite da primeira importação: quando a configuração nova já existe, não reimportar e não sobrescrever a ativação/desativação ativa do usuário após o upgrade.
- [ ] Revisar e atualizar as expectativas dos testes antigos de migração; testes existentes que passam `enabled=false` sem afirmar a ativação/desativação não podem continuar servindo como evidência de que esse comportamento funciona.
- [ ] Concluir em lote os testes unitários relacionados, typecheck, lint, checagem de arquitetura e o review completo; registrar as verificações executadas e as limitações não testadas. Na fase apenas de documentação, não se executa regressão de produto.

A declaração de conclusão precisa distinguir: a primeira migração preserva a ativação de Providers manuais, as contas embutidas cancelam a desativação, e o remendo de usuários manuais já migrados está fora de escopo — nenhuma dessas coisas substitui as outras. As identidades embutidas não têm mais itens aguardando decisão do usuário.

## Implementação e review desta rodada

O importador grava o `enabled` externo explícito apenas no ramo de Provider customizado, mantendo ausente quando ausente; o ramo de identidade embutida não muda. Casos parametrizados de arquivo antigo → arquivo novo → Resolver reproduziram primeiro a perda do valor, e após a correção 20 casos passaram em três arquivos de teste; já estão cobertos a prioridade entre campo externo e campo estendido, a releitura no formato novo, a não reimportação após reversão ativa de ativação pós-upgrade, a invariância dos bytes do arquivo antigo e a publicação real no Registry. Typecheck da raiz, lint (0 errors / 41 warnings já existentes) e arquitetura (0 violations) passaram.

O review local não introduziu releitura de campos antigos em runtime, remendo de dados, reescrita de ativação em nível de Key/modelo nem adivinhação de identidade. O lote conjunto com o Todo117 já verificou que a conta cancela a desativação e que a verificação de elegibilidade não é afrouxada; a primeira migração adicionou asserções de sistema com e sem `systemDisabledReason` válido e de «habilitado mas sem Key não é executável», que passaram. O código e a cadeia offline exigidos pela lista foram cobertos; a revisão de entrega final do lote está pendente. O registro completo do lote está em [ledger de execução](./provider-stabilization-20260911-execution.md).