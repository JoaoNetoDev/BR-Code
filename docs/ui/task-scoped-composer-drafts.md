# Rascunhos do composer por escopo de task

## Contexto

O estado não enviado da caixa de entrada do chat precisa ser isolado por task, e não pela instância atual do componente. Se o usuário digita texto, anexa arquivos ou adiciona chips de contexto na task A, muda para a task B e volta para a task A, ele deve ver o próprio rascunho da task A; o mesmo vale para a task B.

## Limites de cache

- O isolamento por workspace usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
- O escopo do rascunho usa `taskId`; o estado de nova task usa `null`, mapeado no store como `__draft__`.
- Cada escopo mantém em cache o rascunho completo do composer: texto, anexos comuns, code comment, web element context e revisão local.
- Na restauração no desktop, prioriza-se a reprodução do snapshot JSON do Lexical editor, preservando os nós de mention / token; em rascunhos antigos ou snapshot ausente, há fallback para restauração em texto puro.
- Estados transitórios de UI, como focus, realce de arraste e o loading da melhoria de prompt, não entram no cache de rascunhos.

## Regras de persistência

- Na memória do renderer atual, cada workspace/task é salvo de forma independente; trocar de task, desmontar, ocultar a página, editar um prompt enfileirado e a promoção da primeira task exigem salvar/restaurar.
- O caminho crítico de digitação apenas atualiza o estado local do composer e a revisão, sem escrever no store global/localStorage a cada caractere; o rascunho completo só é salvo ou limpo ao trocar de task, ao desmontar/ocultar, em prefill/edição enfileirada, na promoção da primeira task e nas fronteiras de sucesso/falha de envio, evitando re-renderizações frequentes ou escritas de persistência causados por anexos grandes e textos longos.
- A restauração após reiniciar o desktop usa um pequeno cache JSON em localStorage; a key deve conter a workspace key, evitando cruzamento entre workspaces remotos com o mesmo caminho.
- Anexos comuns persistem apenas referências recuperáveis: anexos de arquivo com `localPath` podem ser restaurados; um `File` do navegador sem caminho recuperável não é copiado para o armazenamento do aplicativo, é descartado após o reinício e o usuário é avisado para adicioná-lo novamente.
- O rascunho correspondente é limpo quando a task é excluída ou quando o envio tem sucesso, evitando que referências de anexos antigos continuem aparecendo em sessões seguintes.