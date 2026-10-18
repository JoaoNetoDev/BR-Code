# Presets de Model Provider

## Limites atuais

- Os providers predefinidos com atualização automática incluem apenas as entradas de API Key, Coding Plan e Start Plan atuais da Z.ai e da BigModel.
- Os templates de provider customizado `default-*` foram removidos; ao atualizar os providers predefinidos não são mais completados templates default de OpenRouter, Moonshot, MiniMax, DeepSeek, MiMo, Qwen etc.
- O OAuth oficial de codex/claude/gemini não é mais entrada de configuração de model provider e o RPC do model provider service não é mais exposto.

## Complementação de capacidades remotas de modelo

- O que `client/configs.builtinModels` distribui são fatos oficiais de modelo reutilizados por ID de modelo, não-serving apenas ao builtin provider.
- Após cada sincronização de provider predefinido, todos os providers podem obter, para os modelos existentes e por ID de modelo, a complementação remota de `reasoning` e `modalities`, incluindo o Start Plan e custom providers criados pelo usuário; esse caminho não adiciona nem remove modelos.
- O ID de modelo usa a string completa após `trim + lowercase` para comparação exata; não há correspondência por apelido, prefixo, sufixo, substring ou aproximada, e após o acerto o ID de modelo do provider local é preservado.
- `reasoning` segue a regra fill-only: usa o fato remoto quando não existe localmente e preserva integralmente o valor local quando já configurado. `modalities` é mesclado por lado de input/output enquanto `modalitiesConfigured !== true`; depois de configurado explicitamente pelo usuário, o valor local é preservado integralmente. Esse caminho não sobrescreve context window, max output tokens ou outros metadados locais do modelo.
- O conjunto de modelos do Start Plan continua sendo determinado pelos benefícios de billing/balance; a complementação genérica apenas enriquece os modelos já existentes no plano e não pode ampliar a seleção do plano com base em `builtinModels`.

## Modelos GLM padrão

- A lista padrão de modelos GLM dos providers predefinidos Z.ai / BigModel com API Key é fixa: `GLM-5.2`, `GLM-5-Turbo`.
- A lista padrão de modelos GLM dos providers predefinidos Z.ai / BigModel com Coding Plan é fixa: `GLM-5.2`, `GLM-5-Turbo`.
- A lista de modelos da entrada gratuita do Start Plan é fixa: `GLM-5.2`, `GLM-5-Turbo`.
- A entrada de API Key da Z.ai / BigModel permite ao usuário personalizar o context window dos modelos; o valor explícito salvo pelo usuário tem precedência sobre o valor padrão predefinido, e a página de Settings e o `config.json` devem permanecer consistentes.
- As entradas de Coding Plan e Start Plan da Z.ai / BigModel permitem ao usuário adicionar manualmente configurações de modelos; os modelos do usuário salvos localmente expressam apenas os modelos selecionáveis no cliente e não alteram os benefícios do plano no servidor, a whitelist ou a validação de cota.
- O context window de `GLM-5.2` nas entradas de Coding Plan e Start Plan da Z.ai / BigModel é fixo em `1_000_000`; a lista de modelos da página de Settings usa de forma unificada a representação compacta em inglês (como `128K`, `1M`).
- A ordem da lista padrão é a ordem de exibição prioritária na UI e na seleção de modelos; a lógica de sincronização remota ou local não pode reinserir modelos GLM antigos já hospedados na lista padrão.
- `GLM-5.1` não entra mais na seleção padrão de modelos da Z.ai / BigModel para API Key, Coding Plan ou Start Plan.

## Nomeação do Start Plan

- O nome de exibição fixo de `builtin:zai-start-plan` é `Z.ai - Coding Plan`.
- O nome de exibição fixo de `builtin:bigmodel-start-plan` é `BigModel- Coding Plan`.
- Nomes em chinês ou o nome `Start Plan` já persistidos por versões antigas servem apenas como dados históricos de leitura, e a camada de exibição precisa normalizá-los para os nomes fixos acima.
- No banner da entrada de compra da interface em chinês, o título da entrada do Start Plan é exibido como “体验套餐”; a interface em inglês continua exibindo `Start Plan`.

## Página de detalhes do Coding Plan

- Com o Coding Plan já ativado, a página de detalhes mantém os conteúdos de configuração como URL e Models; Models permite ao usuário adicionar manualmente, e clicar na entrada de upgrade do cartão de status apenas abre o fluxo de compra, sem substituir nem ocultar a área de configuração abaixo.
- Quando não há login, conexão, ativação ou a obtenção dos benefícios falha, a página de detalhes exibe apenas o cartão de status do Coding Plan e o banner de dica abaixo, sem mostrar conteúdos de configuração como API Key, URL e Models, evitando confundir a entrada de plano hospedado com uma entrada de configuração manual.
- Com a BigModel sem login, a página de detalhes não exibe o título do plano de experiência nem a explicação da cota de experiência, e mostra abaixo do cartão de status apenas três banners de entrada de largura total: “Start Plan”“个人套餐”“团队套餐”. O Start Plan usa o fundo verde de ênfase fraca do banner de cota do Start Plan; 个人套餐 e 团队套餐 usam respectivamente as cores Pro azul e Max dourada, com a mesma direção de gradiente radial do canto superior à esquerda do Start Plan, incluindo ícone puro, título, descrição e seta à direita. Se a configuração da promoção de cota de 150% estiver disponível, os títulos das entradas “个人套餐” e “团队套餐” sem login exibem um emblema compacto da promoção ao lado.
- Com a BigModel logada, mas sem benefícios de Start Plan e Coding Plan, a página de detalhes não exibe o título do plano de experiência nem a explicação da cota de experiência, e mostra abaixo do cartão de status apenas dois banners de entrada de largura total: “个人套餐” e “团队套餐”. 个人套餐 e 团队套餐 usam respectivamente as cores Pro azul e Max dourada, com a mesma direção de gradiente radial do canto superior à esquerda do Start Plan, incluindo ícone puro, título, descrição e seta à direita.
- No Upgrade Coding Plan, os botões de ação de plano não clicáveis usam uniformemente o estilo outline disabled; os botões de compra/upgrade/renovação continuam usando o estilo de botão primário padrão. Esgotado, plano atual, já incluído, não comprável e ciclo de cobrança não selecionável pertencem a outline disabled.
- Com a BigModel logada e o pricing do plano empresarial já retornado, a entrada de equipe deixa de exibir um único banner genérico “团队套餐” e passa a reutilizar o grupo de 团队套餐 do Upgrade Coding Plan para renderizar múltiplos banners de equipe, como “标准版”“高级版”, com preços vindos dos correspondentes produtos de equipe. Sem login ou enquanto o pricing de equipe ainda não estiver disponível, mantém-se a entrada única de orientação “团队套餐”.
- O banner da entrada 个人套餐 precisa exibir o estado de esgotado antecipadamente quando o usuário está logado e o token de compra está disponível; quando todos os produtos 个人套餐 estão `soldOut`, o lugar do preço original exibe “暂时售罄” e deixa de exibir o menor preço. Sem login, não se exibe o estado de esgotado e continua-se mostrando a entrada normal e o preço de reserva.
- A Z.ai atualmente não tem plano de equipe; tanto o painel de compra quanto a entrada de detalhes exibem apenas 个人套餐, sem entrada de 团队套餐.
- Os cartões da lista de 团队套餐 da BigModel expressam o estado selecionado apenas com borda e fundo, sem o rótulo de texto “已选择”.
- Com Start Plan ou Coding Plan já ativado, clicar em upgrade ou abrir o painel de compra não recolhe os cartões de saldo de hoje e de uso de cota restante (5h, 1w, Tool etc.) abaixo do cartão de status; a ação de compra apenas acrescenta o painel de compra.
- Com o Coding Plan já ativado, os cartões de cota restante 5h, 1w e MCP abaixo do cartão de status na página de detalhes precisam exibir o `nextResetTime` retornado pela interface, reutilizando o formato de tempo da cota restante na sidebar: 5h exibe data e hora omitindo a data quando for o mesmo dia, e 1w e MCP exibem a data.

## Migração de dados antigos

Ao ler o store local de providers, os providers antigos `default-*` são limpos:

- `apiKey` vazio: considerado como nunca habilitado pelo usuário e removido diretamente.
- `apiKey` não vazio: considerado como configuração customizada já existente do usuário, mantido como custom provider comum, sem mais se beneficiar de ordenação de template padrão nem de complementação automática.

Atualizar os providers predefinidos apenas atualiza os metadados dos builtin providers; a atualização comum de predefinidos não modifica implicitamente a API Key do usuário.