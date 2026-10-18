# Metadados de Listagem da Loja na Camada do Catálogo do Marketplace, com prioridade do catálogo na exibição e fallback para o manifest

O redesenho da loja de plugins precisa de metadados de exibição como icon, imagem hero, prompts de exemplo e links de privacidade/termos. Decidimos colocar esses campos no **catálogo do marketplace** (entradas de marketplace.json) em vez do plugin.json dentro do pacote do plugin: o CDN oficial consegue ajustar a apresentação da loja (inclusive a lista de featured) apenas alterando o JSON do catálogo, sem precisar reempacotar e republicar o zip; o catálogo dos plugins embutidos é gerado pelo `official-plugin-definitions.ts` no repositório, e os campos também são preenchidos lá. Na exibição, os campos de listing do catálogo têm prioridade e, quando ausentes, há fallback para o author/homepage já existente no plugin.json — assim, plugins de origem pessoal que nunca escreveram listing também obtêm de graça a linha de informações do desenvolvedor/site.

## Considered Options

- **Embutido no manifest** (listing escrito no plugin.json): alterar um nome de autor ou trocar uma imagem exige republicar o zip e mudar o sha256, com custo operacional inaceitável; plugins de origem pessoal continuam sem icon, e o problema não é resolvido.
- **Serviço/interface de listing separado**: mais uma dependência de rede e mais um modo de falha; o JSON do catálogo já é justamente o lugar onde cada plugin é descrito, não há necessidade.

## Consequences

- O CDN marketplace.json e a lógica de geração do seed embutido passam a ser a fonte de verdade da apresentação da loja; os tipos de wire (AvailablePluginSummary etc.) precisam propagar os campos de listing e os campos de fallback do manifesto até a UI.
- A mesma informação pode existir em dois lugares e ficar inconsistente (o catálogo diz que o autor é A, o manifesto diz que é B) — por esta decisão, a UI sempre confia no catálogo.