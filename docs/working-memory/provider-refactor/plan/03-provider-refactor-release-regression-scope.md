# Escopo de regressão de lançamento da refatoração de providers de modelo

> Status: a executar
>
> Data da baseline: 2026-09-03

Este documento lista as principais funcionalidades que precisam de regressão antes do lançamento da refatoração de providers de modelo. Cada seção corresponde a uma funcionalidade do usuário, e a regressão final deve ser executada após o merge do staging mais recente.

## 1. Página de configurações de modelos

- Verificar a entrada na página, a atualização, a rolagem e a exibição em diferentes tamanhos de janela.
- Verificar se, com muitos providers e modelos, as listas da esquerda e da direita rolam de forma independente e exibem tudo.
- Verificar a renomeação e a ordenação de providers e modelos, além do interruptor e da exclusão de modelos.
- Verificar o salvamento automático dos campos, o feedback de salvamento e a edição contínua.
- Verificar a edição da configuração do modelo e a restauração dos padrões, incluindo contexto, saída máxima, tipos de entrada, capacidades do modelo e níveis de raciocínio.
- Verificar os temas claro e escuro, a interface em PT/EN e o IME em chinês.

## 2. Adicionar e configurar providers de modelo

- Entrar pela "adicionar fornecedor" na lista de templates e adicionar um provider embutido e um provider puramente personalizado.
- Informar a API Key pela página de primeiro uso e configurar a API sob demanda da Z.AI ou da BigModel.
- Verificar o nome, o Logo, o endereço da interface, o formato da API e a lista de modelos do novo provider.
- Adicionar o mesmo template de novo e verificar a distinção de nomes, o isolamento de configuração e a ordenação.
- Depois de preencher a API Key, o endereço e o modelo, verificar o salvamento, o teste de conexão e o chat real.
- Verificar o feedback de página para configuração incompleta, nome duplicado, erro de interface e exclusão do provider.

## 3. Preservação das configurações de providers após a atualização

- Configurar providers embutidos e personalizados em uma versão antiga, atualizar para a nova e verificar as configurações, os modelos e a ordem anteriores.
- Verificar a primeira inicialização após a atualização, o restart do aplicativo e o uso contínuo dos modelos.
- Iniciar com uma configuração antiga ausente ou corrompida e verificar as mensagens de erro e o uso dos demais providers.
- Após atualizar a configuração de modelos embutidos, verificar os providers existentes, os novos modelos e os valores padrão dos modelos.

## 4. Conta Zhipu e modelos de planos

- Verificar login, logout, novo login e restauração após restart do aplicativo na Z.AI e na BigModel.
- Verificar as páginas, os modelos, as cotas e o estado de uso dos planos de experiência, pessoal e de equipe.
- Verificar a resgate do plano de experiência, bem como a atualização da página após um resgate com sucesso, com falha e repetido.
- Verificar a troca entre planos e entre equipes diferentes, bem como a resseleção do plano atual.
- Verificar a edição, a ordenação, o interruptor, o teste de conexão e o chat real dos modelos de plano.
- Verificar a entrada de upgrade, o retorno ao aplicativo após a compra e a atualização das informações do plano.
- Verificar a mensagem exibida e a retentativa quando as informações do plano falham ao carregar.
- Verificar a mensagem exibida quando um request de modelo dispara a verificação de conta, e a continuidade de uso.

## 5. Inicialização do aplicativo e troca de workspace

- Após iniciar o aplicativo em cold start ou abrir um workspace local, verificar imediatamente a lista de modelos, o modelo padrão, a criação de tarefa e o primeiro envio.
- Verificar a mensagem, a retentativa e a recuperação quando os modelos falham ao carregar.
- Verificar o uso de modelos ao trocar de workspace, reiniciar o aplicativo e retomar tarefas existentes.

## 6. Seleção de modelo no chat comum

- Criar uma tarefa e enviar a primeira mensagem com o modelo padrão, conferindo a exibição na interface e o provider, o modelo e o nível de raciocínio realmente usados.
- Trocar de provider, modelo e nível de raciocínio dentro da tarefa e verificar a mensagem atual e as seguintes.
- Verificar a troca de modelo com a tarefa em execução, o envio de instruções adicionais e o comportamento com a "confirmação antes de alterar" ativada.
- Verificar envios consecutivos, parar, reenviar e enviar com anexos.
- Verificar a seleção, o uso e a restauração após restart quando providers diferentes têm modelos com o mesmo nome.
- Verificar a retomada e as mensagens ao desativar um modelo ou excluir um provider em tarefas existentes.

## 7. Diferentes formatos de API e capacidades de modelo

- Fazer requisições reais com Anthropic Messages, OpenAI Chat Completions e OpenAI Responses.
- Verificar os níveis de raciocínio de modelos diferentes, inclusive modelos em que o raciocínio não pode ser desativado.
- Verificar contexto longo, saída máxima e as mensagens ao ultrapassar os limites do modelo.
- Verificar a continuidade do chat após a compressão da conversa e a restauração após restart.
- Verificar entradas de imagem, vídeo e PDF, bem como as mensagens quando o modelo não suporta determinado conteúdo.
- Verificar chamadas de ferramentas, saída estruturada, busca nativa e mensagens de sistema.
- Verificar falha de autenticação, limitação de taxa, interrupção de rede e cancelamento de requisição.

## 8. Estatísticas de uso e avisos de cota

- Verificar o total, o detalhamento, os filtros e o registro de uso por modelo na página de estatísticas de uso.
- Verificar a cota do plano, o uso de contexto e os lembretes de reinício na área de chat e na barra lateral.
- Depois de trocar de plano, modelo ou workspace, verificar a atualização das estatísticas e das informações de cota.

## 9. Funcionalidade de memória

- Verificar o modelo usado na leitura, extração e organização das memórias.
- Verificar se a funcionalidade de memória continua utilizável após restart do aplicativo.
- Verificar a funcionalidade de memória ao trocar o modelo do chat ou ao executar várias tarefas ao mesmo tempo.
- Verificar a mensagem exibida e se o chat comum continua normal quando o request do modelo usado pela memória falha.

## 10. Geração do título da tarefa

- Verificar a primeira geração do título, a falha de geração, a resposta lenta e o comportamento após restart do aplicativo.
- Verificar o que acontece quando a geração automática do título ocorre ao mesmo tempo que uma renomeação manual.
- Gerar o título com um modelo em que o raciocínio não pode ser desativado.

## 11. Título e verificação de conclusão do Goal

- Verificar a geração do título na criação, substituição, limpeza do Goal e após restart.
- Verificar o sucesso, a falha, o cancelamento e a retentativa da verificação de conclusão do Goal.
- Verificar o resultado do título ao substituir rapidamente o Goal, bem como o estado do Goal após uma verificação falha.

## 12. Geração de Git Commit Message

- Verificar o comportamento com alterações em staging, com alterações grandes, na falha de geração e no cancelamento.
- Verificar o comportamento de gerar novamente a mensagem de commit quando o usuário já preencheu uma.
- Verificar o que acontece quando o workspace continua mudando durante a geração.

## 13. Repo Wiki

- Verificar a seleção de modelo, o início da geração, execuções longas, o cancelamento e a falha.
- Verificar a continuidade de ver ou gerar o Wiki após restart do aplicativo.
- Verificar o modelo usado ao trocar de projeto e ao alterar as configurações do Wiki.

## 14. Teste de conexão de modelo

- Testar modelos de providers com API Key e dos planos de experiência, pessoal e de equipe.
- Testar a conexão imediatamente após salvar a configuração do provider.
- Fazer o teste de conexão com um modelo em que o raciocínio não pode ser desativado.
- Verificar o nome do modelo na mensagem de sucesso, bem como a mensagem de falha e um novo teste.
- Abrir a página de configurações de modelos em um workspace remoto e testar a conexão.

## 15. Subagentes e tarefas em background

- Verificar o provider, o modelo e o nível de raciocínio usados por subagentes embutidos e personalizados.
- Verificar o uso de modelos e a troca de tarefa quando a task pai e a subtarefa rodam ao mesmo tempo.
- Verificar se, após restart do aplicativo, a task pai e a subtarefa continuam aparecendo e sendo utilizáveis normalmente.
- Verificar o início, a parada e a notificação de conclusão de subagentes em background e de comandos em background.
- Verificar o envio de novas mensagens e a troca de tarefa enquanto uma tarefa em background está rodando.
- Verificar os cartões de pergunta, a confirmação de permissão e a geração contínua após a conclusão de uma ferramenta.

## 16. Hooks, MCP e ferramentas de plugins

- Verificar o bloqueio de requisições de modelo por Hooks, o complemento de informações, o erro e a continuidade da execução.
- Verificar a conexão, o login e a compatibilidade de versão dos servidores MCP.
- Verificar a chamada e os erros de MCP, ferramentas de plugins e ferramentas embutidas nos diferentes formatos de API.

## 17. Uso de modelos em tarefas agendadas

- Verificar a criação, a edição, o início/parada, a execução no horário, a execução perdida e o histórico das tarefas agendadas.
- Verificar o provider, o modelo e o nível de raciocínio salvos e usados pela tarefa agendada.
- Verificar o título da tarefa gerado depois da execução de uma tarefa agendada.
- Verificar as tarefas existentes após restart do aplicativo, bem como as criadas antes do upgrade.
- Verificar as mensagens e as ações seguintes quando um modelo fica indisponível, um provider é excluído, um plano expira ou uma requisição falha.
- Verificar que a seleção de modelo da tarefa agendada e a do chat comum não afetam uma a outra.

## 18. Tarefas ociosas e tarefas existentes

- Viver a experiência completa da tarefa ociosa: criação, seleção de modelo, espera pela agendação, execução, visualização do resultado, cancelamento e nova execução.
- Criar tarefas ociosas usando, respectivamente, Z.AI, BigModel, plano pessoal e plano de equipe.
- Criar uma tarefa ociosa antes do upgrade e, após o upgrade e restart do aplicativo, verificar o registro da tarefa e o estado atual.
- Verificar as mensagens e a recuperação quando o modelo fica indisponível, o plano expira, o login vence, a cota é insuficiente ou a rede falha.
- Verificar que a tarefa ociosa não altera a seleção de modelo do chat comum.
- Verificar a entrada de tarefas ociosas em workspaces remotos e no celular.

## 19. Tarefas de Bot e interação pelo Feishu

- Iniciar e concluir uma tarefa com um Bot já configurado, como Feishu ou Telegram.
- Após atualizar o aplicativo, verificar as configurações de Bot existentes e o destino das tarefas.
- Verificar o início da tarefa, os eventos de terminal, o resultado final e as mensagens de erro.
- Verificar perguntas de múltipla escolha no Feishu, respostas personalizadas, confirmação de permissão e o estado do cartão após a conclusão.
- Verificar respostas em streaming, o progresso da tarefa e a saída do terminal na mesma cartão do Feishu.

## 20. Uso de modelos em workspaces remotos

- Após conectar pela primeira vez a um workspace remoto, verificar se a conta, o provider e o modelo padrão locais podem ser usados no remoto.
- Verificar a atualização em um workspace remoto já conectado depois de fazer login, logout ou alterar as configurações de modelo localmente.
- Abrir vários workspaces no mesmo ambiente remoto e verificar a configuração de modelos e o uso em tarefas.
- Verificar a falha de sincronização da configuração de modelos, a interrupção de rede, a falha de escrita remota e o reconexão via SSH.
- Verificar o isolamento de conta, providers, modelos e tarefas entre o workspace local e diferentes ambientes remotos.

## 21. Desktop, Web, celular e CLI

- Verificar a lista de modelos, a seleção de modelo e a retomada de tarefas no Desktop, no Web local e no controle remoto pelo celular.
- Verificar a troca entre workspaces local e remoto, bem como o Desktop e o celular operando a mesma tarefa ao mesmo tempo.
- Verificar login, logout, modelo padrão, modelo explícito e subagentes na CLI.
- Verificar o uso de modelos na TUI e em tarefas de script.
- Verificar comandos da CLI que não precisam de modelo, como ajuda e versão.

## 22. Instalador oficial

- Instalar o pacote oficial com um diretório de usuário totalmente novo e concluir a inicialização, o login, a adição de um provider, a seleção de modelo e o envio de mensagens.
- Instalar por cima da versão oficial anterior e verificar o login existente, a configuração de providers, o modelo padrão e as tarefas já existentes, continuando a enviar mensagens.
- Após fazer login no site oficial ou comprar um plano e clicar em "Abrir ZCode", verificando o acionamento do aplicativo e a atualização das informações da conta.
- Instalar os pacotes oficiais de macOS, Windows e Linux, e verificar os providers embutidos, os modelos e os Logos.