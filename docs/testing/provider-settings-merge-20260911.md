# Registro de merge da ramificação de estabilidade de Provider (2026-09-11)

## Escopo

- O usuário pediu renomear a ramificação atual e mesclar em `codex/provider-settings-todos`.
- Ramificação original: `codex/provider-schema-refinement-20260910`, baseline `cd81a0fc08`.
- Nova ramificação: `codex/provider-stabilization-20260911`; o tracking da ramificação remota antiga foi removido para evitar push acidental posterior. A nova ramificação ainda não foi enviada.
- O merge usou o commit fixo `9469388004` da ramificação de destino local; após o fetch não havia ramificação remota com o mesmo nome, e o destino está em outro workspace, cujo workspace e ramificação não foram modificados.
- Commits exclusivos de cada lado: 14 / 77. O destino contém atualizações de staging até `7a01923f58`, não apenas documentos de Todo.
- Merge normal com dois pais, sem conflito explícito; sem uso de ours/theirs de arquivo inteiro e sem refazer funcionalidades independentes do upstream.

## Revisão de interseção

- A interseção do merge automático foi `model-execution.ts` e os arquivos de locale em chinês e inglês.
- Validação de segurança de requisições: mantém a validação de segurança de Key manual das duas URLs oficiais de plano deste ramo, ao mesmo tempo em que conecta a observabilidade de validação de segurança, o log de feature gate e a cadeia de observabilidade de attempt da ramificação de destino. A regra de URL oficial continua passando pela validação de segurança original e não é interceptada antes pela ramificação de observação não validada do access-mode.
- Entrada de API Key: mantém o único `apiKeyManagementUrl`, sem restaurar o campo exclusivo de equipe nem o texto de dois botões; o campo antigo permanece apenas nas asserções de teste que rejeitam esse campo.
- Layout das configurações: mantém a rolagem de página inteira e as alterações de posicionamento do feedback do ramo de destino, sem restaurar o ScrollEdgeShadowViewport já removido; as alterações de card e de entrada de API Key deste ramo são mantidas.
- Todos os Todos dos dois lados são mantidos integralmente por arquivo, sem sobrescrita automática por número nem tratamento de item pendente como já implementado.

## Verificação

- `pnpm typecheck` na raiz: passou.
- `pnpm typecheck` do Adapter: falhou na primeira vez porque o dist antigo de Contracts não tinha os novos tipos de observação da validação de segurança; passou após reconstruir o Contracts atual, sem correção no código-fonte.
- `pnpm lint`: 0 errors, 41 warnings; o merge não serviu para ampliar a correção de avisos não relacionados.
- `pnpm architecture:check --changed`: passou antes e depois do merge, 0 new violations.
- Testes direcionados na raiz de Provider / template / código compartilhado de validação de segurança / links e layout: 7 arquivos, 87 itens passaram.
- Entrada de teste independente do Agent para manual-coding-plan-signing: 18 itens passaram; não pode ser substituída pelo comando de teste da raiz, pois esse diretório não é incluído pela configuração da raiz.
- Testes de edição de linha de modelo, seleção de template e do componente de link de API Key: 3 arquivos, 55 itens passaram (os testes de link têm sobreposição com o lote anterior e não são somados como um total independente de casos).
- Não foram feitas verificações em máquinas reais Pro/Air, controle remoto pelo celular nem E2E de produto inteiro; a verificação deste merge não equivale à aceitação completa dos Todos relacionados.
- `git diff --cached --check` apontou duas linhas em branco no final dos arquivos de Document Skills já existentes no ramo de destino e três espaços no fim de linha no template de decisão; esse conteúdo vem do destino fixo e o conteúdo de plugin do upstream não é alterado só por causa do merge.

## Itens preservados

Na época do merge, Todo115～Todo122 estavam duplicados nos dois lados. Conforme pedido do usuário, os números da ramificação original foram mantidos e os oito itens do ramo mesclado foram renumerados como Todo125～Todo132, com arquivos, títulos, diretórios e referências cruzadas já atualizados:

| Número original do ramo mesclado | Número atual | Tema |
| --- | --- | --- |
| Todo115 | Todo125 | Texto de ajuda da página de configurações de modelo e texto final |
| Todo116 | Todo126 | Configuração padrão de GLM-5.3-Flash PDF e Coding Plan API Turbo |
| Todo117 | Todo127 | Publicação online e correção do fluxo de atualização da configuração Built-in |
| Todo118 | Todo128 | Contrato de inicialização de Provider e correção da atualização de elegibilidade em ocioso |
| Todo119 | Todo129 | Adaptação da telemetria de Provider e correção do reconhecimento de plano de equipe |
| Todo120 | Todo130 | Chave de configuração inteligente e correção da fronteira de campos de configuração manual |
| Todo121 | Todo131 | Posição da configuração inteligente na página de configurações de modelo e botão "Restaurar" |
| Todo122 | Todo132 | Feedback da cor de fundo das opções de modelo e correção da edição do nome do fornecedor |

Todo115～Todo124 da ramificação original permanecem inalterados. Desta vez apenas a identidade documental foi organizada, sem mudar requisitos nem estado de implementação; IDs de rastreamento de casos já existentes nos documentos, como M120／R121／T119, permanecem estáveis e não são reordenados junto com a numeração dos Todos.

Este registro não promete corrigir os problemas já registrados de Provider, migração, Subagent, capacidade ou teste de conexão, nem implementa os novos itens pendentes do ramo de destino.