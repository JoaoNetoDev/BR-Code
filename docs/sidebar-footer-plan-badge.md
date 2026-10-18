# Badge de plano no rodapé da sidebar

## Objetivo

O rodapé da sidebar do workspace mostra o nome da conta autenticada. Quando a conta tem um entitlement ativo de Coding Plan, o menu de conta aberto acrescenta um badge de plano compacto, de nível de conta, depois do nome da conta em seu cabeçalho. O gatilho do rodapé da sidebar em si mostra apenas o avatar e o nome da conta, sem badge de plano.

## Comportamento

- O badge é visível apenas para usuários autenticados com entitlement ativo de Coding Plan.
- O badge não segue mais o modo de conexão atual do workspace. API Key, Start Plan, provider nativo ou o estado de seleção de Team Plan não podem esconder um badge de Coding Plan pessoal de nível de conta.
- Se a conta tiver um Coding Plan pessoal ativo, o badge mostra o rótulo do plano pessoal.
- Se a conta não tiver Coding Plan pessoal ativo, mas tiver um Team Plan assinado, o badge mostra `Team` / `团队`.
- Se a conta tiver entitlements pessoal e de Team Plan, o Coding Plan pessoal prevalece.
- O badge pessoal prefere `quota.level` como rótulo. Se o nível de quota não estiver disponível, ele faz fallback para o primeiro nome de produto de assinatura.
- Nomes de produto longos são normalizados para a densidade do rodapé removendo o prefixo `GLM Coding`, quando presente.
- O nome da conta permanece como texto principal e mantém prioridade de truncamento; o badge é compacto e pode encolher/desaparecer antes de empurrar os controles do rodapé para fora dos limites.
- O badge usa tokens semânticos de superfície, borda e primeiro plano, para funcionar nos temas claro e escuro.

## Não objetivos

- O badge não abre nenhuma nova UI por si só. O menu do avatar continua sendo o ponto de entrada para ações de upgrade; os detalhes de uso ficam na página Usage e no painel de contexto da caixa de entrada do chat.
- O badge não introduz novos campos de usuário/conta. O estado pessoal continua vindo dos dados de entitlement do Coding Plan; o estado de Team vem dos produtos enterprise Coding Plan assinados.