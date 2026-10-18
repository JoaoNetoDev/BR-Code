# Todo148: Provedor Z.AI reutiliza o ícone do sistema ZCode

Status: em 2026-09-15 o material foi corrigido com base na captura de tela do Dock; desenvolvimento e verificação deste ciclo concluídos.

## Especificação e limites

- O usuário especificou o ícone do aplicativo com Z branco sobre fundo preto do Dock, e não a versão com contorno cinza do antigo `logo-zai.svg`.
- Copiar literalmente o `packages/desktop/build/icons/128x128.png` existente para o recurso estático da UI
  `model-provider-zai-app.png`; essa versão de tamanho não possui a margem externa adicional da imagem grande do Dock, sem redesenho, sem recorte e sem inversão de cores.
  A UI não referencia o caminho do Desktop entre camadas; o teste unitário verifica que a cópia empacotada é byte a byte idêntica ao arquivo de origem do aplicativo.
- A cobertura unificada dos pontos de chamada existentes (lista de provedores, título de detalhes, modelos de adição etc.) vem do mapeamento de recursos `zai` do `ProviderLogo`;
  sem nova verificação por Provider ID e sem alteração do JSON embutido, do Schema, da configuração pessoal ou do comportamento dos modelos.
- O ícone azul do BigModel e as demais marcas permanecem inalterados; temas claro e escuro, desktop e web compartilham o mesmo recurso estático empacotado, preservando tamanho e fallback de falha de carregamento.
- A lista de origem aponta para o PNG realmente utilizado e para o caminho de origem do aplicativo; o SVG antigo e as demais entradas permanecem inalterados, sem ampliar a limpeza de material.

## Aceitação

- [x] O teste unitário confirma que Z.AI referencia o mesmo PNG do aplicativo em temas claro e escuro, com cópia idêntica byte a byte; BigModel continua referenciando o material original.
- [x] Atributos de acessibilidade da imagem, tamanhos existentes e fallback de falha de carregamento preservados; verificação de recursos de ícone aprovada.
- [x] Verificação no navegador de que modelos, navegação e detalhes carregam de fato o PNG; revisão das capturas de 390 em chinês claro / 1200 em inglês escuro; verificação de tipos, lint e arquitetura.

Esta alteração substitui apenas a referência de material estático, sem mudança de comportamento de interação; foi complementado o caso pendente de navegador existente de Provider, sem alegar aceitação completa da cadeia de controle remoto.

## Verificação e revisão (2026-09-15)

- O teste unitário falhou primeiro (4 falhas); após a substituição, 9 casos passaram nos arquivos `providerLogo`/`providerLogoAssets`.
- Cópia isolada Pro: execução dos dois casos de navegador `zai app icon` aprovada; as imagens de modelos, navegação e detalhes foram realmente decodificadas em 128×128, sem inversão de cores, sem exceção de página e sem gravação extra.
- Revisão das quatro capturas de modelos/detalhes: tanto 390 em chinês claro quanto 1200 em inglês escuro usam o Z branco sobre fundo preto especificado.
- `pnpm typecheck` na raiz e `typecheck:e2e` do Desktop aprovados; `pnpm lint` com 0 erros e 42 avisos já existentes; architecture com 0 violações.
- O código de produto substitui apenas a referência de material estático do `ProviderLogo`; SVG antigo, BigModel, formato de configuração, Provider ID, interação e cadeia em tempo real não foram alterados.
- Os casos de navegador permanecem pendentes; não foi executado o E2E completo de Electron/shared-host no celular. codegraph indisponível, não foi executada análise de impacto.

## Verificação e revisão (2026-09-14)

Abaixo está o registro histórico da seleção incorreta anterior do SVG, que não representa a aceitação do PNG deste ciclo.

- Testes adicionados primeiro; 3 novas asserções falharam sob a referência antiga de PNG; após a substituição, 8 casos em 2 arquivos passaram.
- typecheck da raiz aprovado, lint com 0 erros e 42 avisos já existentes, architecture com 0 violações.
- O SVG do sistema foi realmente renderizado e a imagem ampliada foi inspecionada: endpoints retos originais, placa de base arredondada, gradiente e contorno fino foram preservados.
- A revisão confirmou que o SVG do sistema e a configuração embutida não foram modificados; apenas a referência de recurso, a lista de origem, os testes e este Todo foram alterados.
- Não foi executado E2E de página inteira em máquina real de desktop/celular; desta vez foram usados teste unitário do componente compartilhado e verificação de renderização do material, sem alegar conclusão da aceitação de página inteira.