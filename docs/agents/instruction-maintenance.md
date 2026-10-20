# Manutenção e aceite das instruções de Agent

## Objetivo e escopo

Esta especificação descreve a organização e o modo de aceite do AGENTS.md do repositório, da entrada do Claude e das skills relacionadas. A prioridade é reduzir retrabalho, validação perdida e correções manuais, e em seguida reduzir confirmações, leituras e testes repetidos desnecessários. O tamanho dos arquivos serve apenas para observar o custo de contexto, não como prova de melhoria de efeito.

Requisitos de comportamento confirmados em 2026-09-15:

- consultoria, diagnóstico e review são somente leitura por padrão; solicitações de implementação e correção completam de forma autônoma a investigação, a refatoração local, as alterações e a validação dentro do escopo autorizado;
- mudanças de semântica de produto, compatibilidade, formato de dados ou arquitetura central que ultrapassem os requisitos confirmados devem primeiro propor um plano concreto e conversar; planos já confirmados seguem direto;
- novas funcionalidades e mudanças de comportamento atualizam primeiro o spec existente; bugfixes que restauram comportamento já definido deixam registro via teste de regressão; quando o comportamento esperado ainda não está definido, o spec é completado primeiro;
- validar conforme o tipo de mudança; parar depois que as verificações necessárias passam, e só ampliar a validação diante de novas alterações, falhas ou riscos inexplicados;
- tarefas de implementação fazem commit local automático depois de passar na validação; quando uma verificação necessária bloqueia, as alterações do workspace são mantidas e explicadas. Push e MR só acontecem a pedido do usuário.

As regras de execução do dia a dia seguem o [AGENTS.md da raiz](../../AGENTS.md). Esta seção registra as metas de aceite desta remodelação; mudanças futuras de regras precisam sincronizar os cenários de aceite correspondentes.

## Divisão de responsabilidade dos arquivos

| Local | Conteúdo de que é responsável | Condição de leitura |
| --- | --- | --- |
| AGENTS.md da raiz | Limite da tarefa, spec, restrições chave de engenharia, validação e condições de conclusão, porta de entrada de leitura | Todas as tarefas do repositório |
| packages/ui/AGENTS.md | Acesso a serviços de UI, estado, adaptação de plataforma, logs | Mudanças em componentes, páginas, estilos ou hooks de UI |
| packages/services/AGENTS.md | Logs de serviço e pontos de atenção da camada de serviço | Mudanças na implementação de serviços |
| apps/zcode-cli/AGENTS.md | Contratos, toolchain e validação específicos da CLI | Mudanças de código da CLI |
| docs/agents/runtime-boundaries.md | Processo, identidade do workspace, limites de estado desktop/mobile | Mudanças de process, estado de workspace, controle remoto ou链路 de tempo real |
| .claude/CLAUDE.md e a entrada correspondente da CLI | Importa o AGENTS.md compartilhado | Claude carrega as instruções do projeto |
| Documentos de domínio e skills existentes | Fatos de domínio, ferramentas especializadas e workflows | O arquivo raiz ou a tarefa atinge a condição de disparo correspondente |

O arquivo raiz precisa escrever "qual arquivo ler quando", para que uma tarefa iniciada na raiz do repositório também encontre as regras de subdiretório. Não se deve supor que, após adicionar um AGENTS.md aninhado, todos os hosts o carregarão automaticamente a cada edição de arquivo. A entrada do Claude usa caminho de importação relativo ao próprio arquivo de entrada, sem copiar o projeto inteiro de regras.

A política de arquitetura executável é o `architecture-policy.yaml`; o gate só oferece garantia para os módulos que ele realmente cobre, e as semânticas e os módulos não cobertos ainda exigem verificação manual ou por agent. Quando os fatos do repositório divergirem da documentação, primeiro verifique a implementação e o contrato-alvo; não se pode tratar automaticamente uma implementação já violante como uma nova norma de arquitetura.

## Aceite por cenário

Sempre que a fronteira da tarefa, a condição de leitura ou a condição de conclusão mudar, verifique se os pedidos abaixo podem chegar a uma conclusão consistente a partir das instruções aplicáveis. A tabela traz as expectativas de aceite e não representa tarefas de desenvolvimento já executadas.

| Pedido representativo | Deve ler/executar | Como deve terminar |
| --- | --- | --- |
| "Localizar a causa das mensagens duplicadas após reconexão do celular, sem alterar nada ainda" | Documento de fatos do controle remoto, implementação relevante e evidência de runtime | Apresentar evidência, causa raiz ou hipótese a verificar; não alterar código de negócio nem commitar |
| "Corrigir os comandos na documentação de desenvolvimento" | A definição real dos comandos e os documentos que os referenciam; verificar links e consistência | Commit local depois de a checagem de documentação passar; sem rodar E2E do app |
| "Corrigir um erro de parsing já definido em spec" | O spec existente e os testes afetados; reproduzir antes de corrigir | Testes de regressão e gates de código passando; sem criar de novo documentação de funcionalidade |
| "Ajustar a interação disparada por um botão" | Instruções de UI, DESIGN, spec da funcionalidade e o workflow de E2E | Atualizar spec/testes, validar os caminhos afetados de desktop e celular e commitar |
| "Corrigir o roteamento de tarefas em workspace remoto" | Limites de runtime, instruções da CLI (se tocar a CLI) e contratos relevantes; desenhar diagrama de estado ou temporização | Validar identity, owner e limites continuous/replayable; testes unitários da raiz não substituem CLI/E2E |
| "Implementar uma interação já confirmada, mas o ambiente E2E necessário está indisponível" | Concluir a implementação executável e a validação, registrando a causa da falha e os itens não verificados | Manter as alterações, não commitar automaticamente e não alegar validação concluída |

Aceite complementar das regras de escopo de teste unitário (2026-10-13):

| Pedido/condição | Esperado |
| --- | --- |
| O workspace já tem alterações | Registrar o ponto de partida da tarefa; todas as alterações não commitadas existentes são incluídas e preservadas |
| Exclusão de código-fonte, alteração de dependência ou associação irresolvível | Seguir a seleção oficial do Vitest, sem adicionar consumidores de baseline nem compensação por origem |
| Alvo de push diferente de HEAD / sem baseline / workspace sujo | Saída não zero, bloqueando o push |
| Arquivos trazidos por merge de integração | Participam normalmente da seleção oficial, sem filtro por origem |
| Configuração, setup comum ou dependência compartilhada seleciona o suite inteiro | Explicar e pular o UT, exit 0, sem bloquear o Push por isso |
| Nenhum teste selecionado | Explicar e sair com 0, sem alegar que todas as alterações foram verificadas |
| Falha no teste direcionado | Corrigir e revalidar o escopo correspondente, sem migrar para uma reexecução completa |
| Requisito explícito de suíte completa | Usar pnpm test / pnpm test:unit |
| Tarefa atravessando vários commits | Usar o SHA do ponto de partida da tarefa no final; o escopo de push é usado apenas para a verificação de push |

Também é preciso verificar dois ramos entre cenários: alteração puramente visual validando desktop/celular e temas claro e escuro; refatoração sem mudança de comportamento reutilizando de preferência os testes existentes, criando novos apenas em lacunas de cobertura.

Aceite complementar das regras de descrição de MR (2026-10-16):

| Pedido/condição | Esperado |
| --- | --- |
| Escrever ou atualizar a descrição do MR | Organizar em cinco seções: TL;DR, objetivo, escopo das mudanças, verificação, riscos e rollback; não exigir mapa de capacidades, classificação de módulos ou varredura de superfície de impacto |
| Nova funcionalidade, ajuste de comportamento ou refatoração pura | O objetivo explica o contexto, o comportamento anterior, a intenção de design e o comportamento esperado; sem defeito existente, dizer isso com honestidade e não inventar causa raiz de bug |
| O MR contém bugfix (incluindo mudanças mistas) | Para cada problema independente, descrever o cenário de gatilho, o comportamento esperado/real, a causa raiz, a evidência e o mecanismo de correção, com o caso de regressão correspondente; associar o ticket existente com link direto sempre que possível, manter o ID apenas quando confirmável e, sem ticket, dizer isso com honestidade, sem inventar link |
| Causa raiz, associação de feedback ou commit introdutor sem evidência | Marcar como pendente de confirmação ou não localizado; mesmo módulo e tempo próximo servem apenas como pista e não podem ser escritos como atribuição confirmada |
| Uso do helper de descrição de cinco seções | Able ler e passar o corpo completo; a descrição antiga de sete seções continua legível; arquivo vazio ou sem qualquer uma das cinco seções continua sendo recusado |

## Observação do efeito real

As tarefas reais seguintes devem guardar o link da tarefa, o tipo de mudança, o modelo/host, a versão das instruções usadas e o retrabalho, a validação perdida, a correção manual e as pausas desnecessárias que realmente apareceram. Prefira comparar tarefas do mesmo tipo; modelo, dependências ou ambiente diferentes influenciam o resultado e devem ser anotados junto. Só reporte melhora no efeito de desenvolvimento quando uma melhora de comportamento for observada; esta checagem de documentação apenas valida a completude e a consistência das regras.

Quando o mesmo tipo de erro aparecer de novo, atualize a regra original responsável por essa decisão e acrescente um cenário representativo. Evite acrescentar um requisito de correção em cópia no arquivo raiz, no arquivo de subdiretório e nas skills. Listas de interfaces, números de versão, caminhos e resumos de script obsoletos devem ser removidos ou convertidos em ponteiros para a entrada autoritativa atual.

## Registro de aceite desta rodada (2026-09-15)

- os seis tipos de pedido acima, além dos ramos puramente visual e puramente de refatoração, foram verificados estaticamente item a item: as regras da raiz localizam as entradas especializadas, e spec, validação, bloqueio e condições de commit permanecem consistentes na CLI, na skill de arquitetura, na skill de E2E e na norma de commit. Essas tarefas de desenvolvimento de produto não foram executadas nem foi feito experimento de A/B de modelos.
- foram conferidos os links Markdown locais, os alvos de importação do Claude, as definições de script da raiz/CLI e se os arquivos referenciados estão no Git; formato dos arquivos alterados e espaços em branco do diff foram verificados.
- o architecture-governance passou pela validação genérica do skill-creator. O campo `disable-model-invocation` já existente na skill de E2E não é suportado por esse validador e produz o mesmo erro antes e depois da alteração; a política de invocação original foi mantida e o YAML, o diff de campos e a semântica do workflow foram conferidos à parte. Este item é uma limitação de compatibilidade pré-existente e não é reportado como aprovação da validação genérica.
- desta rodada alterou apenas instruções, documentação e metadados de exibição de skill, sendo aceita pelas regras de documentação pura; não foram executados typecheck, lint, UT ou E2E do app. O efeito real de desenvolvimento ainda aguarda observação em tarefas posteriores do mesmo tipo.