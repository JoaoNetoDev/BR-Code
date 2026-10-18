# TODO de remoção de lock na leitura pura da configuração de Provider

- Status: implementação, regressão e auto-revisão concluídas; push após o commit e criação de MR para `hotfix/3.12.2`.
- Feedback: ZCT-2099792881319157760; [relatório de investigação](./2026-09-15-provider-config-lock-investigation.md).
- Decisão de escopo: desta vez tratamos apenas a competição de locks. Falhas de leitura preservando a configuração válida, notificações de recuperação e diagnóstico serão desenhadas em conjunto amanhã; a persistência das configurações não é modificada.

## Objetivo e motivo

Vários Host/Agent leem por padrão a mesma configuração Personal cerca de uma vez por segundo, mas todos participam do lock de diretório exclusivo, e até uma leitura pura gera escrita e remoção de arquivos de lock/owner.
A escrita da aplicação já usa arquivo temporário no mesmo diretório seguido de rename para substituição; um leitor normal pode observar o documento já submetido anterior ou o novo, sem esperar o escritor preparar o novo arquivo.
O read comum também é responsável pela importação Legacy e pela normalização de formato, portanto não se pode simplesmente remover o lock da entrada de leitura completa.

## Contrato de comportamento desta vez

```text
explicit read -> leitura sem lock, decodificação
             ├─ arquivo canônico -> retorna o snapshot
             ├─ arquivo ausente e sem importer -> mantém o comportamento atual de config vazia
             └─ precisa de importação/normalização -> lock de escrita original -> relê o arquivo mais recente -> decide pela conteúdo atual se reescreve ou não

poll -> leitura sem lock, decodificação -> compara a versão do conteúdo -> mantém a notificação de mudança existente

update -> lock de escrita original -> relê o arquivo mais recente -> transform/validação -> arquivo temporário + rename -> updated
```

- `NodePersonalProviderConfigRepository` continua sendo o único owner de file IO e de polling; não se adiciona lock de leitura/escrita entre processos nem uma segunda cache de configuração.
- Leitura normal e polling puro não criam diretório de lock, não escrevem owner e não aguardam por causa de outro writer normal com o lock; a leitura explícita de um documento ainda não normalizado pode continuar aguardando o lock de escrita.
- A primeira importação, a escrita de normalização e a modificação devem reler dentro do lock original; o documento antigo da fase sem lock não pode ser usado para sobrescrever diretamente a gravação.
- A parsing sem lock usa exatamente o mesmo decoder, encoder e revision de conteúdo da leitura existente; não modifica schema, scripts de migração ou caminho de arquivo.
- Protocolo de escrita, fila, orçamento de lock, reciclagem de lock, arquivo temporário privado e retry de rename permanecem inalterados; a compatibilidade com escritores antigos que usam o lock original permanece.
- A próxima rodada de poll é agendada somente após o término da rodada atual. O finally de read/update explícito não pode enfileirar uma segunda rodada enquanto um poll está em voo.
- Quando este Repository tem uma nova escrita bem-sucedida, os resultados de polls iniciados anteriormente são descartados, evitando que uma leitura antiga retornando tarde faça o observedRevision retroceder e gere notificações de mudança duplicadas.
  Usa-se apenas uma geração de escrita em processo, sem modificar a revision em disco e sem adicionar protocolo de sincronização de configuração.
- O leitor apenas garante observar uma versão submetida completa; não se adiciona leitura linear estrita entre processos nem barreira de sincronização antes do envio.
- O fallback de config vazia após falha de leitura comum, o poll-error e a regra de recuperação na mesma versão permanecem como estão; desta vez reduzimos as fontes de gatilho e não alegamos resolver completamente a recuperação de falhas.
- Não modifica Registry, UI, conta, semântica de seleção padrão ou protocolo de sincronização remota. A seleção padrão e Host/Worker/Standalone reutilizam este Repository;
  o mobile continua passando por shared-host, o remoto continua usando o Environment pertencente, e desktop continuous / mobile replayable não mudam.

## Limites e verificação

- A implementação de produção fica restrita a `packages/provider-node/src/personal-provider-config-repository.ts`, reutilizando as ferramentas públicas de arquivo do shared.
- Sem interação de UI ou alteração de estrutura de página; a regressão fica no Repository e na camada real de file IO de subprocesso, reutilizando os testes existentes de salvamento/seleção padrão/sincronização de Provider.
- Verificação executada no Linux local; resultados reais em Windows/macOS não podem ser substituídos por testes Linux. A abertura normal de arquivos no Windows pelo Node/libuv inclui a capacidade de delete compartilhado,
  e o rename usa a operação que substitui o arquivo de destino; a verificação multiplataforma ainda precisa cobrir leitura concorrente e falha de substituição. Corruption escrita no local por programas externos e falhas de permissão não fazem parte da garantia desta vez.

## TODO de execução

- [x] Deixar claro que apenas a competição de locks e os limites de concorrência necessários serão corrigidos, com os dois últimos itens reservados para o design conjunto.
- [x] Registrar em disco o contrato de comportamento, os cenários de verificação e os TODOs de design conjunto subsequentes.
- [x] Adicionar primeiro os testes de regressão e confirmar que a implementação antiga falha.
  - Com outra processo ou writer segurando o lock, o read normal ainda lê a configuração completa; nenhuma operação de metadados de lock é produzida.
  - O polling puro, com o writer segurando o lock, consegue observar a nova versão do arquivo canônico, mantendo a coerência dos campos e regras padrão.
  - Durante a primeira importação e a fila de normalização, dados novos já salvos por outro writer não são sobrescritos pela leitura antiga.
  - Dois processos salvando Provider/seleção padrão em paralelo continuam preservando integralmente as atualizações de ambos.
  - Poll lento intercalado com read explícito não gera polls sobrepostos; um poll antigo que chega tarde não sobrescreve a versão da nova escrita.
  - Arquivo corrompido e falha real de escrita mantêm o comportamento de erro original, sem danificar o conteúdo do arquivo.
- [x] Implementar o desvio entre leitura pura e escrita de retorno, com comentários em chinês explicando o motivo.
- [x] Executar regressão focada, testes existentes relacionados, typecheck, lint, formatação e o portão de arquitetura.
- [x] Fazer auto-revisão do diff real, registrar testes e limitações de plataforma e gerar um commit isolado.

## Os dois itens que precisam ser desenhados em conjunto amanhã (não implementados desta vez)

1. Preservar os últimos dados Personal válidos quando a leitura falhar: definir um owner único; distinguir usuário novo sem arquivo, falha na inicialização em que nunca houve leitura bem-sucedida, falha em execução, arquivo legitimamente vazio,
   desaparecimento súbito do arquivo; a seleção padrão e as regras vêm do mesmo snapshot; o salvamento e a distribuição remota devem validar o arquivo real, sem tomar o cache antigo como base da escrita mais recente.
2. Notificações de recuperação e diagnóstico: distinguir recuperação de leitura de arquivo e aplicação pelo Registry concluída; o estado de erro deve convergir mesmo quando a versão do conteúdo não muda; tratar deduplicação de versão em Facade/UI,
   primeira falha de start sem inscrição, resultado concorrente expirado, troca de Environment; eventos de falha/recuperação de baixa frequência, lock enfileirado/obtained/held/released em fases separadas,
   falha de liberação após submissão não pode ser disfarçada de não submetido; não reproduzir automaticamente o salvamento do usuário e não vazar credenciais.

Esses dois itens devem primeiro definir em conjunto o modelo de estado e a superfície de impacto, e só então atualizar spec/testes e a implementação, sem avançar com blocos try/catch isolados como remendo.

## Resultado desta execução

- A mudança de produção ficou apenas no Personal Repository: read/poll normais sem lock; importação, normalização e update mantêm a releitura dentro do lock de escrita.
- Foram adicionados 10 testes de IO/concorrência, incluindo leitura com lock real em subprocesso, retorno tardio de poll antigo com sucesso e com erro, e falha de salvamento por ENOSPC.
  Os testes de leitura com lock da implementação antiga foram confirmados como falhando; o teste de erro expirado também falhou antes de ser corrigido.
- Regressão focada de Repository / Runtime / seleção padrão / configuração de serviço: 5 arquivos, 46 testes aprovados.
- Regressão ampliada de Provider Node e distribuição de configuração: 31 arquivos, 277 testes, 276 aprovados.
  A única falha foi a asserção de quebra de linha do Map embutido em `zcode-builtin-map-formatting.test.ts`; o teste correspondente,
  `config/provider/zcode-builtin.json` e `packages/model-option-map` são idênticos à baseline do hotfix e não foram modificados desta vez.
- `pnpm typecheck`, `pnpm lint` (0 error), `pnpm architecture:check --changed` aprovados; a verificação de formatação dos arquivos modificados passou.
- A auto-revisão completou a proteção de poll em voo e a verificação de geração de escrita bem-sucedida (descartando sucessos e falhas expirados), sem adicionar uma segunda cache de configuração.
- A verificação de file IO e de subprocesso no Linux passou; não foram executados testes reais em Windows/macOS nem e2e de desktop/mobile, e não se alega essa cobertura.
- Esta execução não resolve o fallback de config vazia nem a falta de notificação de recuperação na mesma versão causados por outras falhas reais de IO.