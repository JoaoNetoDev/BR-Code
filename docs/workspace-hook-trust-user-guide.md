# Guia do usuário de Workspace Hook Trust

Hooks de workspace/projeto vêm da configuração do repositório e podem executar comandos locais, portanto não são confiáveis por padrão. Abrir o workspace,
ativar o interruptor geral de Hooks comuns ou confirmar um deep link não concede autorização automaticamente.

## Confiar nas configurações

Quando um evento natural casa com um Hook não confiável, a conversa continua normalmente e o Hook permanece em fail closed. A área de chat exibe um aviso de
existência de Workspace Hook pendente de revisão; ao clicar, leva a `Configurações → Hooks → Workspace`.

A linha não confiável mostra "Confiar" somente à esquerda do interruptor de configuração, na extremidade direita:

```text
Nome e comando do Hook                                      [Confiar] [Interruptor]
```

- Clicar em "Confiar" estabelece um Trust persistente para o `workspaceIdentity + hookDeclarationDigest` atual; após o sucesso o botão desaparece.
- O interruptor de configuração controla apenas se o Hook está habilitado e não estabelece nem revoga Trust.
- A página não oferece autorização pontual, confiança em lote nem revogação na linha.
- Fechar as configurações, o timeout ou a desconexão equivalem a "nenhuma decisão" e não alteram o Trust.

O Trust afeta apenas os eventos naturais posteriores. Um SessionStart que já foi pulado por não confiança não é reexecutado na próxima mensagem da task atual; ele roda no máximo no próximo SessionStart de uma nova task/sessão real.

Quando a semântica declarada, como o comando e o matcher, muda, o digest muda e a nova declaração volta a não ser confiável, exibindo o botão novamente;
declarações inalteradas continuam acertando o Trust existente.

`Allow once` nas permissões comuns de execução de ferramentas é outro sistema de permissões e não faz parte do Workspace Hook Trust.

## Segurança e recuperação

- `deny` de managed sempre tem precedência sobre o Trust do usuário.
- Com o rollout gate desativado, todos os hooks de projeto são bloqueados de forma hard; registros existentes são preservados, mas não lidos.
- Respostas stale de task/run/remoteSession/generation/snapshot são rejeitadas antes de gravar no trust store.
- Desktop continuous e mobile replayable usam a mesma vinculação autoritativa de admissão do Runtime; reconectar não amplia a autorização.

Para revogar um registro existente, use a entrada de administração/CLI confiável para revogar pelo digest exato; o interruptor de configuração não tem semântica de revogação.

### Trust store corrompido (`workspace_hooks_trust_store_corrupt`)

O trust store persistente (`~/.zcode/security/workspace-hook-trust-v1.json`, que pode ser redirecionado por `storage.dir` da user config) é analisado por um schema strict completo: erro de sintaxe JSON, ausência de `schemaVersion`, record sem campos obrigatórios (`decision` / `grantedAt` / `digestAlgorithm` etc.), timestamp inválido, campos desconhecidos etc. são todos julgados corrupt e fail-closed — todos os consumidores (Settings UI, Runtime admission, CLI)
chegam à mesma conclusão para o mesmo arquivo, e em estado corrupt nenhum `trusted_persistent` é exibido; todos os Hooks são pulados pela soft gate de não confiança.

`zcode hooks trust status` retorna explicitamente
`reasonCode: workspace_hooks_trust_store_corrupt` para um store corrompido (em vez de `pending_trust`), e `grant` /
`revoke` são rejeitados até a reparação. Na primeira leitura o arquivo corrompido é renomeado para
`workspace-hook-trust-v1.json.corrupt-<timestamp>`; a recuperação consiste em restaurar o arquivo a partir do backup ou, após confirmar que não há necessidade de preservá-lo, apagar os arquivos residuais `*.corrupt-*` para reconstruir um store vazio e então executar o grant novamente.

## Aceitação manual

O repositório fornece um fixture inofensivo:

```bash
node scripts/create-workspace-hook-trust-uat-fixture.mjs
```

O procedimento completo e os resultados esperados estão em
[`workspace-hook-trust-manual-acceptance.md`](./testing/workspace-hook-trust-manual-acceptance.md).