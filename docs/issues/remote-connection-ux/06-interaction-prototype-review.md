# 06 — Protótipo de interação e revisão

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** nada, pode começar imediatamente.

**Comportamento a entregar:**

Montar uma página de protótipo temporária em `pnpm dev:web` para que o usuário possa julgar, antes da implementação definitiva, se a nova interação "é boa de usar e boa de ver".

- **Como fazer**: o protótipo usa diretamente os design tokens e os componentes básicos reais do projeto, todos os dados são fixos, e é possível alternar entre tema claro e escuro, largura de 264px na barra lateral e janela de 900px.
- **Para que serve**: as conclusões da revisão definem como [10](./10-three-screen-wizard-and-selection.md)～[13](./13-settings-device-cards-and-updates.md) serão implementados.
- **Não entra no merge**: o código do protótipo não é mesclado.

Escopo:

- **Assistente de três telas**: seleção, conectando e escolha de diretório, com os seguintes estados:
  - senha ausente
  - confirmação de instalação
  - falha de autenticação
  - conexão recusada
  - falha na fase de implantação
  - aviso de reaproveitamento de um dispositivo já online
- **Barra lateral**:
  - os 5 estados da linha de projeto e o cartão de detalhes
  - a linha de progresso da barra lateral com o assistente recolhido
- **Área da sessão**: banner de desconexão e caixa de entrada
- **Página de configurações**:
  - cartão de dispositivo
  - conexões incompletas
  - banner de atualização (uma variante de atualização opcional e uma de atualização obrigatória)
- **Comparação de capturas de tela**: o ambiente de walkthrough de dev local ainda existe, então as capturas podem ser comparadas lado a lado com as capturas do walkthrough.

Critérios de aceite:

- [x] A página de protótipo cobre todas as telas e estados listados acima.
- [x] As capturas cobrem os temas claro e escuro, assim como os dois tamanhos — barra lateral de 264px e janela de 900px — e são comparadas lado a lado com as capturas do walkthrough. As capturas ficam em um diretório temporário, fora do repositório.
- [x] Revisão do usuário aprovada. A conclusão da revisão foi anexada ao final desta issue, na seção `## Comments`.
- [x] Se a revisão alterou alguma decisão de interação já definida, a especificação de fatos correspondente foi atualizada, e as issues afetadas mencionam a mudança.
- [x] O código do protótipo não entra em nenhum commit; o workspace permanece limpo.

## Comments

### Conclusão da revisão (2026-09-27, usuário aprovou no geral)

O protótipo ficou na entrada temporária `?prototype=remote-ux` de `pnpm dev:web`, cobrindo todas as telas e estados do escopo: 8 estados da barra lateral, 12 estados do assistente e 4 estados da página de configurações. As capturas cobrem tema claro/escuro × janela de 1440 (barra lateral de 264px) / janela de 900px, totalizando 96 imagens, mais 24 imagens comparadas lado a lado com as capturas do walkthrough, todas em um diretório temporário local, fora do repositório. Após a revisão o código do protótipo foi removido e não entrou em nenhum commit.

**Implementar conforme o protótipo**: o layout, a hierarquia de informação, o espaçamento e as cores semânticas de 10～13 seguem o protótipo. Os pontos principais:

- **Assistente**: indicador de progresso de três etapas no topo (escolher dispositivo → conectar → escolher diretório); a altura se ajusta ao conteúdo e, quando a lista é longa, a rolagem acontece dentro do modal.
- **Tela de seleção**: uma lista pesquisável, agrupada por "dispositivos salvos / Hosts do SSH config / distribuições WSL (somente Windows) / contêineres em execução"; os dispositivos salvos exibem o status à direita e, abaixo, listam os diretórios recentes em chips; no rodapé ficam "Nova conexão SSH" e a entrada manual; o rodapé também informa a operação por teclado.
- **Formulário de nova conexão SSH**: o host ocupa uma linha isolada, usuário e porta ficam lado a lado; o método de autenticação usa botões segmentados; o campo de senha tem mostrar/ocultar; "Opções avançadas" fica recolhido; no rodapé, "Voltar à lista" à esquerda e "Conectar" à direita.
- **Tela de conectando**: o título é o nome do dispositivo mais uma etiqueta de tipo, e abaixo uma linha com o endereço em largura fixa; as fases são uma lista vertical com linha de conexão, itens concluídos mostram o tempo decorrido e o item atual fica em negrito; dentro da fase de instalação são listados sub-passos, com barra de progresso durante o upload, tamanho enviado, velocidade e tempo restante; os pontos de espera (senha, confirmação de instalação) e os erros são embutidos logo abaixo da fase correspondente; o log vem recolhido por padrão, expande-se na falha e só depois de expandido aparece "Copiar log".
- **Tela de escolha de diretório**: a explicação de escopo é uma linha de aviso que pode ser fechada; duas linhas de chips "Recentes / Registros remotos"; a barra de caminho é acompanhada da lista de diretórios e, no rodapé, aparece "Abrirá <caminho completo>"; no rodapé, "Escolher depois" à esquerda e "Abrir este diretório" à direita; abaixo do título o dispositivo pode ser renomeado diretamente, e após salvar aparece o aviso "Salvo".
- **Barra lateral**: a linha de projeto tem apenas um slot de ícone de status; quando online, mostra o nome do dispositivo na cor de texto secundária; quando offline, troca por uma cápsula curta de status na cor semântica; as ações no fim da linha só aparecem no hover ou foco. O cartão de detalhes é ancorado à linha inteira, aparece à direita da barra lateral e não cobre as ações do fim da linha: à direita da linha de título fica a etiqueta de status, e abaixo o bloco de motivo, o separador e as linhas de dispositivo/conexão/caminho e de ações.
- **Área da sessão**: o banner do topo usa fundo na cor semântica em toda a extensão; o título de um estado neutro usa a cor de texto principal; a caixa de entrada preserva o rascunho, e ao lado do botão de envio é escrito o motivo que impede o envio.

**Divergências em relação à especificação pai; vale esta conclusão**

1. A **linha de progresso após recolher** passa a ser um pequeno cartão de duas linhas: a primeira é "Conectando a <nome do dispositivo>…" e a porcentagem, a segunda é a fase atual, com uma barra de progresso abaixo. A barra lateral de 264px não comporta a versão de uma linha só. Após a falha, mantém-se como um cartão na cor de perigo, com o motivo indicado e clicável para visualização. Impacta [10](./10-three-screen-wizard-and-selection.md).
2. Em caso de **falha de autenticação**, a senha ou a passphrase da chave privada é digitada novamente na própria tela de conectando, com a mesma interação de "senha necessária"; só se volta ao formulário quando for preciso trocar o usuário ou o arquivo de chave privada. A tabela de classificação de erros da especificação de UX foi atualizada. Impacta [11](./11-connecting-and-directory-screens.md).
3. **Nomes das fases**: "Confirmar conexão" passou a "Identificar dispositivo", porque o nome original parecia aguardar uma confirmação do usuário; a fase "Conexão pronta" foi removida — após o sucesso, entra-se diretamente na tela de escolha de diretório ou abre-se o projeto conforme a intenção. Impacta [11](./11-connecting-and-directory-screens.md).
4. O texto da **ação secundária em caso de falha na implantação** passou a "Baixar direto no dispositivo". A especificação de UX foi atualizada. Impacta [11](./11-connecting-and-directory-screens.md).

**Correções necessárias na implementação atual** (o protótipo já foi desenhado no formato desejado)

5. A etiqueta de status do dispositivo concatena o status com o progresso de recuperação, aparecendo como "Conectando, retomando a conexão automaticamente (2/3)"; deve ser "Conectando · Retomada automática 2/3". Impacta [12](./12-sidebar-header-and-menus.md) e [13](./13-settings-device-cards-and-updates.md).
6. A linha de projeto precisa de um texto curto de recuperação "Retomada automática 2/3"; a frase completa fica apenas no cartão de detalhes. Impacta [12](./12-sidebar-header-and-menus.md).
7. A descrição da conexão hoje emite `DOCKER · …`; deve usar capitalização normal `Docker · …`. Impacta [12](./12-sidebar-header-and-menus.md) e [13](./13-settings-device-cards-and-updates.md).

**Compromissos visuais confirmados**

8. A ação principal do cartão de dispositivo (conectar, tentar de novo, atualizar o remoto etc.) usa uniformemente botão com contorno; a urgência é expressa pela etiqueta de status e pelos banners dentro do cartão; na página de configurações apenas "Nova conexão" é botão principal sólido. Impacta [13](./13-settings-device-cards-and-updates.md).
9. **Atualização obrigatória**: etiqueta de status + banner em cor de aviso explicando a versão e o impacto + "Atualizar remoto" no canto superior direito do cartão; o banner não repete botões. **Atualização opcional**: banner neutro, com "Mais tarde / Atualizar". Impacta [13](./13-settings-device-cards-and-updates.md).
10. **Outras conexões**: a segunda linha do cartão indica "Atual · Padrão"; a área expandida lista apenas as demais conexões, e "Definir como padrão / Remover" ficam sempre visíveis, sem depender do hover. Impacta [13](./13-settings-device-cards-and-updates.md).
11. **As duas exibições da área da sessão**: quando a conexão falha ou está reconectando, o conteúdo já carregado permanece de forma esmaecida e somente leitura (continua sujeito à restrição de "não adicionar novo owner de cache"); quando o usuário desconecta ativamente e não há conteúdo carregado, exibe-se o placeholder "Dispositivo não conectado, continue esta sessão após conectar". Impacta [08](./08-disconnect-experience-and-in-place-reconnect.md).

**Não coberto pelo protótipo**: interface em inglês, navegação por teclado ↑↓ na tela de seleção e textos de fase de WSL e Docker (só o SSH foi desenhado), tratados respectivamente por [11](./11-connecting-and-directory-screens.md) e [14](./14-visual-polish-and-accessibility.md).
