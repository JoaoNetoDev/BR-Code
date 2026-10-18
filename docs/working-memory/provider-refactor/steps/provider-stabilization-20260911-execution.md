# Ledger de execução das 19 itens de Provider desta rodada

> Em 2026-09-11 o usuário autorizou entrar na execução do Goal, fazer review item a item e fazer o push final do branch atual. Baseline `1bc2e9bc42`, branch `provider-stabilization-20260911`; o workspace é um worktree independente.

## Objetivo, escopo e convenções de execução

Executar integralmente a segunda rodada do Todo113 e os Todo115–132 (19 itens), usando a decisão mais recente de cada Todo como especificação, sem restaurar pelos comentários antigos comportamentos já revertidos. Os textos originais "apenas em disco / não autorizado para implementar" são preservados como histórico, e desta vez a execução está uniformemente autorizada; o 120 segue com aceitação principal por equivalência de assinatura, e se algo que exija modificação for encontrado, apresentar evidência primeiro, sem usar isso para refazer o sistema de assinatura.

- Spec e teste falhando primeiro, implementação depois. Conferir item a item todos os requisitos, o contexto acima e abaixo, as abstrações de Provider/Selection e os limites de dados, registrando evidência antes de avançar; trechos de código compartilhado podem ser implementados e revisados no mesmo grupo, e build, typecheck, lint e E2E compartilhados são executados em lote.
- Problemas de pré-condição de ambiente/teste pontuais são registrados e o trabalho segue para outros itens independentes. Não repetir grandes regressões sem novo valor de prova; distinguir regressão de merge/desta rodada, problema de produto preexistente e teste defasado, sem ampliar a correção para problemas alheios ao escopo.
- Novas decisões de produto, ampliação significativa de arquitetura, dados reais de usuário ou nova exigência de permissão apenas suspendem os itens relacionados; o resto continua. Requisitos chave não resolvidos não podem ser escritos como concluídos, e não se contorna a aceitação desta rodada transferindo pendências antigas do Todo102.
- Contas embutidas não podem ser desabilitadas; instâncias manuais de Key criadas por template podem ser ligadas/desligadas; a elegibilidade continua sendo julgada por fatos públicos. Do lado de telemetria, busca-se recuperar a semântica antiga no máximo possível, sem mexer em relatórios ou identidade real.
- Campos e conteúdos antigos são preservados; rollback ou novo upgrade pode perder a escolha de modelo, mas o conteúdo permanece legível e não pode gerar erro por campo novo ausente. A primeira migração não sobrescreve a intenção pessoal de quem já migrou; o checksum da 0020 não muda.
- Uma única fonte de verdade de configuração e uma única cadeia de execução oficial; Model já vinculado fica congelado, sem escrever rascunho/histórico por conta própria e sem trocar de modelo silenciosamente. Desktop continuous, mobile replayable/shared-host e o isolamento de identidade de workspace são mantidos.
- Após o review conjunto final, as regressões chave e os commits concluídos, fazer push do branch atual, sem publicar configuração de produção automaticamente, sem criar MR automaticamente e sem fazer push de branches de outros trabalhadores.

## Lotes e status

**Resumo final (substitui o "aguardando aceitação do lote inteiro" da tabela durante a implementação): os 19 itens foram implementados ou tiveram a verificação da implementação existente concluída, e todos foram revisados item a item; os testes locais do lote, o build e o review conjunto foram concluídos. Em 2026-09-12 o Pro completou a verificação de cold restore real no Electron, de salvamento/restauração de configurações e de exibição em chinês; as aceitações restantes de celular/SSH etc. continuam fielmente registradas e não se pode declarar aceitação em todas as plataformas.** Detalhes de entrega, correspondência de commits e limitações estão na [revisão final](./provider-stabilization-20260911-final-review.md). A tabela abaixo preserva as evidências locais de cada item, sem reescrever bloqueio de ambiente como aprovação de produto.

| Todo | Tema                                  | Implementação / verificação / Review                                                                          |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 118  | Ativação/desativação de Provider manual na primeira migração | Implementação, testes e review conjunto com o 117 aprovados; aceitação final do lote pendente            |
| 121  | Recuperar o nível de raciocínio da Session | Implementação, testes de migração/Reader oficiais e review local aprovados; aceitação final do lote pendente |
| 117  | Domínio de conta, escolha de plano, desativação de conta removida | Implementação, 503 testes unitários em lote, 4 casos de browser e review aprovados; cadeia real em múltiplas plataformas não testado |
| 115  | Cabeçalho e área sensível do Provider  | Implementação, 109 testes unitários em lote, 6 de browser e review local aprovados; aceitação final do lote pendente |
| 132  | Confirmação de nome ao salvar e cor de fundo das opções | Implementação, testes unitários/browser em lote e revisão de screenshot aprovados; aceitação final do lote pendente |
| 119  | Nome e teste de conexão em verde        | Implementação, testes unitários/browser e review local aprovados; aceitação do lote pendente                   |
| 124  | Entrada e aviso de teste desativados   | Implementação, testes unitários/browser e review local aprovados; aceitação do lote pendente                   |
| 116  | Aceitação completa da URL de Key única | Review de cadeia completa, 49 testes unitários, browser em lote e abertura nativa no Pro aprovados; login real no console do celular não testado |
| 130  | Contrato de campos manuais            | Implementação, 498 testes unitários em lote, round-trip do Repository real, 2 de browser e review local aprovados; aceitação final do lote pendente |
| 131  | Posicionamento inteligente e restauração | Implementação, browser de restauração atômica/invalidação de requisição antiga, testes unitários e review local aprovados; aceitação final em lote de interação de arquivos no Electron pendente |
| 125  | Explicação com ponto de interrogação  | 9 pontos de texto final aprovados, interação/geometria de ajuda em dois tamanhos e review local aprovados; limitação de aceitação de glifos chineses no Linux preservada |
| 126  | Selo visual GLM, Flash PDF, Turbo padrão | Implementação, 96 testes unitários, 2 de browser de dupla entrada e review local aprovados; não publicado em produção |
| 113  | Segunda rodada de diretório e configuração inteligente | Pesquisa, diretório/regras/implementação de SDK verificados e review local aprovados; aceitação final em lote em andamento, limitações não confirmadas de fornecimento preservadas |
| 128  | Ciclo de vida e elegibilidade em ocioso | Implementação, 80 testes direcionados/1 de browser com Hook real e review local aprovados; aceitação de Team real no Air aguardando o lote |
| 127  | Cadeia de publicação online do Built-in | Download/Account/ciclo de vida, refresh de configurações do Pro → nova requisição de cadeia completa, HTTP macOS/dois processos e integridade final do revision22 aprovados; limitações de celular/SSH e de publicação em produção preservadas |
| 129  | Classificação de Team e IDs antigos de telemetria | Implementação, 229 testes unitários em lote/browser do componente real da homepage e review local aprovados; plataforma real aguardando o lote final |
| 122  | Detalhes de erro de Subagent         | Implementação, 84 testes de Core, 2 de detalhe/cópia no browser e review local aprovados; não inclui a causa raiz de startup ainda não localizada |
| 123  | Consulta de capacidade do histórico   | Implementação e review aprovados; 12 testes novos, gate do lote e Pro Electron CW01–CW06 aprovados; 5 falhas idênticas ao baseline registradas à parte |
| 120  | Aceitação de equivalência de assinatura na URL oficial | 32 pares/147 testes em lote e review aprovados; duas entradas oficiais de cada um dos dois com Sig/200/texto em execução real; limitação do pacote independente no Air remoto preservada |

## Verificação e limitações

A freshness de início passou; não há branch de rastreamento upstream (o push final define o upstream). A checagem de arquitetura inicial teve 0 violations. Services é um módulo unmanaged, sem contrato de dependência direta gerado; o primeiro item mantém a entrada de migração existente e não cria dependência entre camadas.

No início ainda não havia modificação de produto; cada grupo posterior acrescenta abaixo os testes falhando, os resultados após a correção, as conclusões de review e os commits. Credenciais não vão para documentos, não são impressas e não são commitadas; arquivos reais de usuário não são alterados. Outros workspaces não são tocados.

## Todo118 primeira migração (lote de implementação)

- Primeiro foram estendidos os casos de arquivo antigo real → importação → Repository → Resolver → reabertura após salvar, validando separadamente os conflitos de false/true externo com zcode.enabled, extensão false e ausência. Antes da correção, ativar e desativar explicitamente se perdiam nas novas regras (3 falhas diferenciadoras); também foi corrigido um erro de teste que acessava um ResolvedProvider.executable inexistente — a elegibilidade de execução deve checar o modelo e o membro real do Registry.
- A implementação copia um enabled explícito para a camada externa das regras de Provider apenas no ramo de customizado, sem materializar o padrão; o Key da API embutida antiga apenas migra, a identidade da conta é pulada, e modelo/Key/ordem/context ficam com o valor original. Nem o Resolver de runtime nem a leitura normal foram modificados.
- Três arquivos de migração com 20 testes passaram; inclui round-trip em diretório temporário real, com o config.json antigo byte a byte inalterado, a inversão ativa de ativação/desativação após o upgrade se mantendo e sem nova importação. Não é apenas uma saída de importação mockada.
- Review local: posição da configuração, preservação de false, padrão por omissão, prioridade da identidade embutida e autoridade do novo arquivo atendem. A impossibilidade de desativar contas é aceitada em conjunto com o Todo117, então este item não é marcado antecipadamente como concluído em sua totalidade; type/lint e casos negativos adicionais de elegibilidade são fechados no gate em lote.

## Todo121 migração adicional e primeiro gate do grupo

- A 0022 foi acrescentada; 19 casos falhando primeiro em vermelho e depois executados em conjunto com a migração de banco completo antiga e a migração GLM, com 29 itens passando. Nem a 0020/0021 nem a estrutura de tabelas/colunas do banco foram alteradas.
- O runner oficial e o Reader provam os dois caminhos de upgrade, o skip conservador, a preservação de conteúdo/tempo originais, o rollback de falha e a não reexecução. Review local aprovado; detalhes na seção de implementação do Todo121.
- O typecheck da raiz passou; o lint da raiz deu 0 errors / 41 warnings; o typecheck do Adapter passou; arquitetura com 0 violations. O lint completo do Adapter **não passou**: há vários erros max-lines já existentes (incluindo o migrations.ts, que já excedia o limite e nesta rodada só ganhou um registro); o lint isolado do novo arquivo 0022 passou. Não se amplia a correção para arquivos longos não relacionados, e o gate final precisa continuar distinguindo erros já existentes de problemas novos. Logs em `/tmp/provider-stabilization-20260911-{typecheck,lint,adapters-typecheck,adapters-lint}.log`. Um uso anterior e incorreto do nome de módulo de arquitetura inexistente `cli-adapters` foi corrigido para o real `zcode-cli`, sem alterar política ou baseline.
- Continuar a execução do Todo117; o gate em lote não é declaração de conclusão dos 19 itens.