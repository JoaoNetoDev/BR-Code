# Diálogo de Conexão Remota Recolhível

## Objetivo

A configuração de uma conexão remota pode demorar bastante enquanto sessões SSH/Docker são criadas e os recursos remotos são preparados. O assistente de conexão remota permite minimizar o diálogo a partir de qualquer etapa do assistente, sem cancelar o fluxo de conexão em andamento nem descartar um rascunho/estado de erro ocioso.

## Limite de Estado

### Atalhos de tipo de conexão

O assistente atual de três telas começa pela lista unificada de dispositivos. Novas entradas de SSH, Docker, WSL (somente Windows) e Servidor (somente desenvolvimento) abrem seu formulário de configuração correspondente com um único clique. O formulário pertence à primeira tela; não existe uma tela separada de seleção de tipo nem uma ação Avançar. As regras de visibilidade permanecem inalteradas.
Isto segue [RDUX-10](architecture/remote-device-connection-ux-spec.md#三屏向导与统一选择2026-09-28rdux-10).

O hook do formulário é dono do tipo selecionado, e o único dono do fluxo do diálogo alterna
entre a lista e o formulário:

```text
clique simples / clique duplo -> nova conexão(tipo) -> reset rascunho / feedback -> formulário correspondente
Voltar para a lista -> lista unificada de dispositivos -> outra entrada explícita escolhe seu próprio tipo
envio do formulário -> validação -> tela de conexão
```

Um clique duplo precisa chegar ao mesmo formulário que o clique simples, sem enviá-lo.
Depois de visitar outro tipo e voltar à lista, ambos os gestos ainda abrem o tipo
escolhido. As entradas da lista são ações, e não uma seleção de rádio retida; voltar
não exige um estilo de cartão selecionado. Somente o envio explícito do formulário inicia
uma conexão. A ativação por teclado usa a mesma ação de entrada. O Web mobile
atualmente não monta este diálogo; a recuperação de conexão contínua do desktop e a
replayable do mobile permanecem inalteradas.

Aceitação: para cada tipo visível, verificar clique simples, clique duplo após visitar
outro tipo e outro clique duplo após voltar à lista. Todos os caminhos devem
mostrar o formulário correspondente, não produzir envio de formulário e permanecer fora
de conexão ou seleção de diretório (catálogo CWP20).

### Fluxo ativo

O assistente de conexão remota ativo é montado uma única vez a partir de `RootInner`. Isso mantém o estado do assistente vivo enquanto o usuário se move entre visualizações de workspace e configurações.

O estado do fluxo ativo ainda é definido como:

- uma requisição de conexão ainda está carregando, ou
- uma sessão remota está conectada e aguardando seleção de diretório.

Quando o fluxo está ativo, abrir o diálogo retoma a etapa atual do assistente. Uma minimização explícita também retoma a etapa preservada quando o fluxo está ocioso, incluindo a lista de dispositivos, as configurações de conexão e o contexto de conexão com falha. Uma abertura nova começa pela lista unificada de dispositivos; um novo formulário de conexão permanece parte dessa primeira tela.

## Minimizar vs Fechar

Minimizar apenas oculta o diálogo. Não cancela a requisição pendente, não limpa o estado do formulário/erro/log, não reseta a etapa atual e não libera uma sessão conectada. A ação de minimizar está disponível ao longo de todo o fluxo de três telas, incluindo o formulário de configuração da primeira tela.

Fechar mantém o comportamento destrutivo anterior. Se há uma conexão pendente, o usuário precisa confirmar o cancelamento. Se uma sessão está conectada mas nenhum diretório foi selecionado, fechar libera essa sessão.

## Indicadores de Entrada

Quando um fluxo minimizado está ativo, o botão `Open Workspace` da barra lateral do workspace exibe um indicador de conectando.

Clicar na entrada abre a mesma instância global do assistente e retorna à etapa atual.

## Logs de Reconexão

As reconexões de workspace remoto expõem o mesmo fluxo de logs de runtime a partir de tooltips no hover na barra lateral do workspace. O tooltip permanece compacto na linha e rola até a linha de log mais recente quando aberto.

A posse dos logs é indexada pelo id da requisição de reconexão quando ele está disponível. Isso impede que reconexões concorrentes ao mesmo host SSH, distribuição WSL ou container Docker mostrem os logs de upload ou setup uns dos outros. Eventos de log legados sem id de requisição só recorrem ao casamento por rótulo de alvo quando o alvo identifica unicamente um workspace em reconexão.
