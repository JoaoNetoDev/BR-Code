# Escopo de regressão de lançamento da refatoração de fornecedores de modelo (2026-09-11)

> Estado: pendente de execução
>
> Escopo de comparação: staging antigo (`staging_backup @ 790884b1ce`) → staging atual (`b8499d8b2a`)

Esta refatoração ainda não foi lançada; este documento é o escopo de regressão de lançamento acumulado de toda a refatoração, não uma lista incremental do lote mais recente de mudanças. Todo o conteúdo de verificação da [versão anterior do escopo de regressão](./03-provider-refactor-release-regression-scope.md) é mantido, acrescido das mudanças desde o staging antigo e das funcionalidades mescladas no mesmo período; registros existentes de desenvolvimento ou teste não são motivo para reduzir o escopo.

Abaixo são delimitados apenas funcionalidades de produto e cenários-chave, sem detalhar casos, e isso não significa que a aceitação já tenha sido concluída. Se houver novas mudanças no staging mais adiante, continuar adicionando à mesma lista.

## 1. Página de configurações de modelo

- Verificar entrada na página, atualização, diferentes tamanhos de janela e o rolagem independente e a exibição completa das listas esquerda e direita quando há muitos fornecedores e modelos.
- Verificar renomeação, ordenação, habilitação/desativação e exclusão de fornecedores e modelos, incluindo o arraste até a borda da lista.
- Verificar as dicas de estado quando o fornecedor está desabilitado, com configuração incompleta e pronto, além da preservação da configuração após reativação.
- Verificar o salvamento automático dos campos, edição contínua, feedback de salvamento, retentativa após falha e fechamento das dicas, atentando para o banner cobrindo ou cortando o conteúdo.

## 2. Adicionar e configurar fornecedores

- Verificar o agrupamento de Zhipu e outros fornecedores, adição por modelo, adição custom e a distinção de nomes, o isolamento e a ordenação após adições duplicadas.
- Verificar o login de conta e a configuração manual de API Key na página de primeiro uso, além do modelo padrão e do primeiro envio após a configuração.
- Usar API comum e API do Coding Plan separadamente e verificar nome, logo, endereço, formato de API, lista de modelos, entrada de obtenção de Key e o chat real.
- Verificar o preenchimento manual de Key de plano pessoal ou de equipe, o uso sem login de conta e a entrada de obtenção depois que a Key já foi preenchida.
- Verificar o isolamento de configuração entre fornecedores diferentes, além dos feedbacks de configuração incompleta, nome duplicado, endereço errado e exclusão do fornecedor.

## 3. Adicionar e editar configuração de modelo

- Verificar adicionar e editar modelos, alteração do ID do modelo, o interruptor de configuração inteligente e a configuração de fallback para modelos desconhecidos.
- Verificar a alteração de item individual sob configuração inteligente, a marca de alteração e a restauração; após desativar, verificar a completude da configuração manual.
- Verificar a edição e o salvamento de contexto, saída máxima, tipos de entrada, capacidades do modelo e configuração de inferência.
- Verificar a diagramação, a entrada e as dicas de erro do mapeamento de parâmetros de inferência, além do conteúdo após cancelar e reabrir.

## 4. Upgrade, rollback e preservação de dados

- Atualizar a partir da versão antiga e verificar a configuração, os modelos, a ordem e a seleção dos fornecedores embutidos e custom existentes, além de sessions, tarefas agendadas e tarefas ociosas.
- Verificar a recuperação dos nomes de modelo antigos, das maiúsculas/minúsculas e dos níveis de inferência após o upgrade, e o uso contínuo após reiniciar.
- Verificar, após a atualização das configurações embutidas, a preservação dos fornecedores existentes, dos modelos adicionados, da configuração padrão e das modificações do usuário.
- Verificar o rollback para a versão antiga, o uso contínuo após o rollback e um novo upgrade, cobrindo o conteúdo anterior ao upgrade e o criado na nova versão.
- É aceitável que a seleção de modelo se torne inválida e exija uma nova escolha; o conteúdo de sessions e tarefas precisa poder ser aberto, sem erro de leitura por falta de configuração de modelo.
- Verificar a inicialização, a recuperação e as dicas quando a configuração está ausente ou corrompida, quando não há login ou quando não há fornecedor disponível temporariamente, sem afetar os outros fornecedores e sem apagar conteúdo histórico.

## 5. Conta e planos Zhipu

- Verificar separadamente login, logout, novo login e recuperação após reiniciar em Z.AI e BigModel, além das páginas, cotas e uso dos planos de experiência, pessoal e de equipe.
- Verificar troca de plano e de equipe, selecionar novamente o plano atual, além da lista de modelos, do interruptor do fornecedor e das dicas de estado.
- Verificar edição, ordenação, habilitação/desativação, teste de conexão e chat real dos modelos do plano.
- Verificar dicas, retentativa e troca manual quando o plano não está contratado, a obtenção de credenciais falha, o plano expira ou a atualização falha.
- Verificar a retirada bem-sucedida, falha e repetida do plano de experiência, além da compra de upgrade, da redefinição de cota e da atualização ao voltar do site oficial para o app.
- Verificar as dicas quando um request de modelo dispara verificação de conta, a falha da verificação e o uso contínuo após a conclusão.

## 6. Inicialização e troca de workspace

- Em cold start ou logo após abrir um workspace local, verificar imediatamente a lista de modelos, a seleção padrão, a criação de tarefa e o primeiro envio.
- Verificar a retentativa e a recuperação após falha de carregamento dos modelos.
- Verificar a seleção de modelo ao trocar de workspace, reiniciar o app e retomar tarefas, evitando interferência entre workspaces diferentes.

## 7. Seleção de modelo no chat comum

- Verificar o primeiro envio com o modelo padrão de uma nova tarefa, a troca de fornecedor, modelo e nível de inferência, e se a interface e o uso real da mensagem atual e das seguintes são consistentes.
- Verificar o acréscimo de instruções durante a execução, cobrindo separadamente manter o modelo original e trocar de modelo; atentar para a execução contínua após ajustes de configuração do modelo e de estilo de saída.
- Verificar envios consecutivos, fila, parada, reenvio, envio com anexo, edição de mensagem, sessão em branch e side chat.
- Verificar a confirmação antes da mudança, operações sob controle total, aprovação de permissão e a execução contínua após a rejeição.
- Verificar a seleção, o uso e a recuperação após reiniciar de modelos com o mesmo nome em fornecedores diferentes, além das dicas após desabilitar o modelo, excluir o fornecedor ou mudar de plano.
- Verificar que alterar a configuração não interrompe inesperadamente tarefas em execução nem limpa o conteúdo de sessões existentes.

## 8. Formato de API e capacidades do modelo

- Cobrir as três classes de API Messages, Chat Completions e Responses, os modelos adicionados recentemente e os modelos antigos ainda em uso, verificando request real e troca de modelo.
- Verificar nível de inferência, desativar a inferência, modelos que não permitem desativar a inferência, chamada de ferramentas e saída estruturada, além de continuar conversas existentes entre modelos diferentes.
- Verificar imagem, vídeo, PDF, busca nativa na internet e mensagens de sistema na conversa, além das dicas quando a capacidade correspondente não é suportada; atentar para a diferença entre as capacidades da API comum e do plano.
- Verificar contexto longo, saída máxima, dica de limite excedido e continuação da geração após interrupção de saída, além de continuar o chat após a compressão e recuperar após reiniciar.
- Verificar falha de autenticação, limitação de taxa, resposta vazia, interrupção de streaming, recuperação de rede, retentativa e cancelamento, sem reexecutar operações já concluídas.

## 9. Teste de conexão de modelo

- Cobrir Key comum, Key manual de plano e as contas de plano de experiência, pessoal e de equipe, incluindo o teste imediatamente após salvar a configuração.
- Verificar sucesso, falha, retentativa e dicas de fechamento, além do nome do modelo e do texto de feedback.
- Verificar modelos que não permitem desativar a inferência, além do teste de conexão em workspace remoto.

## 10. Estatísticas de uso e dicas de cota

- Verificar o total, o detalhamento, os filtros e o registro de modelos históricos das estatísticas de uso.
- Verificar a cota do plano, o uso de contexto, o lembrete de redefinição e a dica de cota insuficiente na área de chat e na barra lateral, atentar para lembretes que se repetem.
- Verificar a atualização após trocar de conta, modelo ou workspace, além da continuidade dos registros antes e depois do upgrade.

## 11. Funcionalidade de memória

- Verificar o modelo usado na leitura, extração e organização da memória, além do uso contínuo após reiniciar.
- Verificar as dicas após falha no request de memória e se o chat comum continua normal, ao trocar o modelo do chat e com várias tarefas em execução simultaneamente.

## 12. Geração de título e mensagem de commit

- Verificar a primeira geração do título da tarefa, a falha, a resposta lenta e o comportamento após reiniciar, além da geração automática ocorrendo junto com a renomeação manual do usuário.
- Verificar a geração da mensagem de commit com e sem mudanças pendentes e com mudanças grandes, o cancelamento e a falha, além da preservação do conteúdo já preenchido.
- Verificar a situação em que as mudanças no workspace continuam alterando durante a geração da mensagem de commit.
- Cobrir modelos diferentes, incluindo os que não permitem desativar a inferência.

## 13. Goal

- Verificar criação, substituição, limpeza e recuperação após reiniciar, além da geração de título.
- Verificar o nível de inferência da verificação de conclusão, o limite de saída e o sucesso, a falha, o cancelamento e a retentativa.
- Verificar se, após trocar de modelo ou substituir rapidamente o objetivo, o título, o resultado da verificação e o estado do objetivo correspondem.

## 14. Repo Wiki

- Verificar a seleção de modelo, o início da geração, a execução longa, o conteúdo longo, o cancelamento, a falha e a nova geração.
- Verificar que a geração respeita o limite de saída do modelo, sem exigir mais a escolha separada de orçamento de saída.
- Verificar a configuração antiga do Wiki, a visualização ou a continuação da geração após reiniciar, além do uso do modelo e do isolamento de configuração ao trocar de projeto e alterar as configurações do Wiki.

## 15. Subagentes e tarefas em background

- Verificar o modelo especificado e o modelo herdado dos subagentes embutidos e custom, além do nível de inferência.
- Verificar, após o upgrade, a preservação do conteúdo de configuração e do prompt dos subagentes que o usuário já tinha.
- Verificar tarefas pai e filho em paralelo e a troca de tarefas, além da inicialização, parada, notificação de conclusão e exibição e uso de subagentes em background e comandos em background após reiniciar.
- Verificar o envio de novas mensagens ou a troca de tarefa enquanto uma tarefa em background está em execução.
- Verificar a confirmação de permissão, as perguntas e a execução contínua nas subtarefas, sem afetar a seleção de modelo da tarefa pai.

## 16. Hooks, MCP e ferramentas de plugin

- Verificar o bloqueio, o complemento de informações, o erro e a execução contínua após a conclusão da ferramenta.
- Verificar a conexão, o login e a compatibilidade de versão do MCP, além da chamada e do erro de plugins e ferramentas embutidas em diferentes formatos de API, incluindo as ferramentas relacionadas a planos.
- Verificar a confirmação, a rejeição e a retentativa de permissão, além do uso de ferramentas após trocar de modelo.

## 17. Tarefas agendadas

- Verificar criação, edição, habilitação/desativação, execução no horário, execução perdida e histórico, além do título da tarefa após a execução.
- Verificar o salvamento do modelo e do nível de inferência, além da execução de tarefas antigas após o upgrade e de reiniciar.
- Verificar as dicas e as ações seguintes quando o modelo sai do ar, o fornecedor é excluído, o plano expira ou a execução falha, sem afetar a seleção do chat comum.

## 18. Tarefas ociosas

- Verificar a entrada de criação, as limitações de plano e de cota, além da criação, da seleção de modelo, da espera por agendamento, da execução, do cancelamento, da visualização do resultado e da reexecução.
- Cobrir os planos pessoal e de equipe de Z.AI e BigModel, verificando os registros, o estado e o uso contínuo das tarefas ociosas já existentes após o upgrade e reiniciar.
- Verificar as dicas e a recuperação quando o modelo sai do ar, o login expira, o plano expira, a cota é insuficiente ou há anomalia de rede, sem alterar a seleção de modelo do chat comum.
- Verificar a entrada e a visualização de tarefas no workspace remoto e no celular.

## 19. Bot

- Iniciar e concluir tarefas usando os Bots já configurados, como Feishu e Telegram, e verificar o upgrade e a recuperação após reiniciar da configuração do Bot e das tarefas vinculadas.
- Verificar a vinculação a sessões existentes, a alteração do modelo e do nível de inferência, além da recuperação depois que a tarefa vinculada foi excluída.
- Verificar a consistência da seleção de modelo, do conteúdo e do estado da tarefa quando o Bot e o desktop visualizam a mesma sessão.
- Verificar o início da tarefa, os eventos de terminal, a resposta final e as dicas de erro, além da resposta em streaming, do progresso e da saída de terminal no mesmo card.
- Verificar perguntas de múltipla escolha, respostas custom, confirmação de permissão e o estado do card após a conclusão.

## 20. Workspace remoto

- Verificar o uso da conta, dos fornecedores e do modelo padrão local no remoto após a primeira conexão, além da instalação e do primeiro envio após o upgrade no remoto.
- Verificar a atualização do remoto já conectado e a continuação do chat após login, logout ou alteração das configurações de modelo no local.
- Verificar a falha de sincronização de configuração, a falha de escrita no remoto, a queda de rede, a reconexão e o reinício do remoto, além de múltiplos workspaces no mesmo remoto.
- Verificar que conta, fornecedor, tarefa e seleção de modelo não se misturam entre o local e remotos diferentes.

## 21. Exibição e operação em múltiplos dispositivos

- Verificar as configurações de modelo, a lista, a seleção, os textos de dica e a recuperação de tarefa no desktop, na Web local e no controle remoto do celular.
- Verificar a troca entre workspace local e remoto, a operação da mesma tarefa no desktop e no celular e o uso contínuo após o celular reconectar.
- Cobrir janela estreita, tema claro e escuro, chinês e inglês e IME em chinês.
- Verificar o login, o logout, o modelo padrão, o modelo explícito e os subagentes da CLI, além do uso na TUI e em tarefas de script.
- Verificar comandos da CLI que não dependem de modelo, como ajuda e versão.

## 22. Pacote de instalação oficial

- Instalar com um diretório de usuário novo, concluir a inicialização, o login, a adição de fornecedor, a seleção de modelo e o primeiro chat.
- Fazer instalação por cima da última versão oficial e verificar o login existente, a configuração de fornecedores, o modelo padrão e as tarefas existentes, continuando a enviar.
- Cobrir fornecedores, modelos e ícones dos instaladores de macOS, Windows e Linux, além de instalação, upgrade, desinstalação e reinstalação.
- Verificar as dicas de permissão de instalação, o feedback de falha de instalação e a inicialização do app sob diferentes formas de instalação.
- Verificar a invocação do app após login no site oficial ou compra de plano, a atualização da conta, o reinício após atualizar e o uso após o alinhamento das versões desktop e Web.

## 23. Compartilhamento e importação de sessões

- Verificar a seleção de conteúdo concluído, a publicação do compartilhamento, as configurações de permissão, o cancelamento e a retentativa após falha, cobrindo também tarefas em execução e troca de sessão.
- Verificar o corpo, os anexos do usuário e os arquivos gerados no compartilhamento, além das dicas para conteúdo ausente, muito grande ou não compartilhável.
- Verificar a visualização no navegador, o acesso com login, a invocação do app e a continuação do chat após a importação, além da visualização e abertura dos arquivos importados.
- Verificar o workspace local e o workspace remoto com suporte a compartilhamento, evitando que a escolha de compartilhamento de tarefas diferentes se misture.

## 24. Gerenciamento de plugins, navegador e controle do computador

- Verificar a instalação, a habilitação/desativação, a dica de atualização, a atualização e a desinstalação de plugins, além da preservação da configuração após reiniciar.
- Verificar o popup do navegador, o tamanho da janela, a troca de tarefa e a abertura de arquivos locais, sem mistura de estado entre tarefas diferentes.
- Verificar a autorização de sistema do controle do computador, a inicialização e a recuperação, além do escopo disponível em tarefas pai e filho, tarefas em background e workspace remoto.
- Verificar, enquanto as ferramentas relacionadas estão em execução, o uso contínuo após parar a tarefa, reiniciar o app e atualizar o plugin.

## 25. Exibição do workspace e recuperação de arquivos

- Verificar a barra lateral do workspace, o painel independente, o terminal, o redimensionamento por arraste, além das bordas de janela e dos menus em diferentes sistemas.
- Verificar mensagens, resultados de ferramentas, pré-visualização de mídia e abertura de arquivos, incluindo conteúdo longo e arquivos grandes.
- Verificar o registro de alterações de arquivos na tarefa, o rollback e a recuperação, além das dicas quando o espaço em disco é insuficiente ou o arquivo é muito grande.
- Verificar a resposta ao abrir uma tarefa antiga após reiniciar e ao trocar de tarefa e de workspace, e a integridade do conteúdo.

## 26. Gerenciamento de recursos e limpeza de armazenamento

- Verificar a entrada do gerenciador de recursos, a exibição de CPU e memória e a atualização após iniciar e parar tarefas e plugins.
- Verificar a varredura de uso de disco, a visualização por categoria, o cancelamento, a atualização e a confirmação da limpeza.
- Verificar o escopo da limpeza e as dicas de proteção, confirmando que sessões, tarefas, configurações e arquivos ainda necessários não são apagados por engano.
- Verificar o chat normal durante a varredura e a limpeza, o fechamento da janela e a abertura novamente.

## 27. Feedback de erros e informações de diagnóstico

- Verificar o resumo do erro, os detalhes, a retentativa e a entrada de feedback após falhas de modelo, ferramenta e tarefa.
- Verificar o estado após parada, saída anormal e recuperação ao reiniciar, evitando exibir como falha uma tarefa que já foi recuperada.
- Verificar se as informações de diagnóstico e os registros de uso correspondem à tarefa e ao modelo reais e não expõem Key nem credenciais privadas.