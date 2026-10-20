# 13 — Cartões de dispositivo, conexões incompletas e aviso de atualização na página de configurações

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** [03 — Modelo de apresentação da conexão remota, 5 estados e glossário](./03-presentation-model-states-and-glossary.md), [06 — Protótipo de interação e revisão](./06-interaction-prototype-review.md)

**Comportamento a entregar:**

- **Cartão de dispositivo**:
  - Primeira linha: ícone do método de conexão, nome do dispositivo, status, ação principal, além de "Editar" e "Mais". A ação principal é determinada pelo modelo de apresentação.
  - Segunda linha: descrição da conexão. A cor do tipo de conexão aparece somente aqui.
  - Terceira linha: lista no máximo 3 nomes de projeto, clicáveis para abrir; o excedente aparece como "+N".
  - O menu "Mais" traz as informações do dispositivo (versão, nome do host, usuário do sistema, ID do dispositivo), copiar o ID do dispositivo e remover o dispositivo.
- **Outras conexões**:
  - Indica qual está em uso e qual é a padrão, e permite alterar a padrão.
  - Os botões de ação ficam sempre visíveis, sem precisar de hover para aparecer; em telas estreitas, quebram linha automaticamente.
  - Remover a borda dupla de cartão dentro de cartão.
- **Conexões incompletas**: conexões que nunca chegaram a conectar não aparecem mais como cartão de dispositivo; passam a ser agrupadas em "Conexões incompletas" no fim da página. Essa área fica recolhida por padrão, permite tentar de novo, remover e limpar tudo com um clique.
- **Aviso de atualização**:
  - Atualização opcional não exibe toast; mostra apenas um ponto pequeno em "Dispositivos remotos" na navegação das configurações, além de um banner neutro no cartão do dispositivo.
  - A deduplicação é feita por "dispositivo + versão de destino" e persistida. Depois de reconectar, de instabilidade de rede ou de reiniciar o aplicativo, o aviso não aparece de novo.
  - "Mais tarde" vale apenas durante a execução atual.
  - Quando o usuário inicia a atualização ativamente, exibe a etapa e o progresso da atualização. Em caso de sucesso, exibe um toast; em caso de falha, o toast traz "Ver detalhes".
  - Antes da atualização obrigatória, lista as tarefas em execução.
- **Relatório de migração**: caminhos truncados exibem o conteúdo completo no hover.

Corresponde às partes de cartão de dispositivo, outras conexões e conexões incompletas da seção "Dispositivos remotos" da página de configurações na especificação pai, assim como à seção "Aviso de atualização". A direção de atualização quando a versão local é muito antiga é responsabilidade de [03](./03-presentation-model-states-and-glossary.md); as proteções de ação e as anotações de escopo são responsabilidade de [05](./05-settings-safeguards-edit-and-scope.md).

**Conclusão da revisão do protótipo** ([Conclusão da revisão em 06](./06-interaction-prototype-review.md#comments)): a interface é implementada conforme o protótipo aprovado na revisão; nos pontos abaixo, vale o 06.

- A ação principal no cartão de dispositivo usa uniformemente botão com contorno; a urgência é expressa pela etiqueta de status e pelos banners dentro do cartão; na página de configurações, apenas "Nova conexão" é botão principal sólido.
- Atualização obrigatória: etiqueta de status + banner em cor de aviso explicando a versão e o impacto + "Atualizar remoto" no canto superior direito do cartão; o banner não repete botões. Atualização opcional: banner neutro, com "Mais tarde / Atualizar".
- Outras conexões: a segunda linha do cartão indica "Atual · Padrão"; a área expandida lista apenas as demais conexões, e "Definir como padrão / Remover" ficam sempre visíveis.
- A etiqueta de status do dispositivo é escrita como "status · frase curta do motivo"; a descrição da conexão usa capitalização normal `Docker · …`.

Critérios de aceite:

- [x] O layout do cartão de dispositivo é consistente com o protótipo, com teste de componente e captura de tela anexada.
- [x] Depois de tentar conectar em uma porta não ocupada, a lista de cartões de dispositivo da página de configurações não mostra essa tentativa que falhou; ela aparece apenas em "Conexões incompletas", com cobertura E2E.
- [x] Depois de simular reconexão e reinício, a deduplicação do aviso de atualização continua válida; "Mais tarde" vale apenas durante a execução atual; a atualização opcional não exibe toast. Todos esses pontos precisam de teste do aviso de atualização.
- [x] A caixa de confirmação da atualização obrigatória lista as tarefas em execução.
- [x] Fornece capturas de tela dos temas claro e escuro e em tela estreita.
- [x] Atualiza a especificação de UX e sincroniza o catálogo de casos E2E.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E afetados passam; depois disso, commit local.

## Registro de verificação (2026-09-29)

- Ponto de partida `1bc73f709887b4882978f55de3d9177d57a9192d`, workspace inicialmente limpo; não enviado. Cartão de dispositivo, conexão atual/padrão, conexões incompletas, preferências/feedback de atualização, confirmação de tarefas em execução e tooltip de caminho já foram implementados; a abertura de projeto reaproveita a intenção de conexão com profile + directory explícitos, sem exigir attachment existente.
- As revisões de Standards e de Spec encontraram e corrigiram: definir a conexão atual como padrão, log de conexões incompletas, abertura de projeto sem attachment / cobertura de dupla intenção, navegação de detalhe do toast de falha de atualização após o desmonte do painel. A reconferência não deixou pendências.
- `pnpm typecheck`, `pnpm lint` (64 avisos pré-existentes, 0 erros), `pnpm architecture:check --changed`, checagem de tipos do E2E do desktop, validação de fixtures e checagem de diff passaram.
- Testes afetados: a partir do ponto de partida, incluindo a prévia de arquivos não commitados e novos, resultaram em 559 arquivos de teste. A resolução automática reportou incomplete para os recursos existentes `.mp3` e `.html?url`; ambos os arquivos existem e não foram alterados, e a confirmação manual identificou ambos como folhas de recursos estáticos, executados pelo `test:unit:affected --files-manifest` conforme a lista explícita de testes da saída, sem recuar para a execução total.Nessa rodada de 556 arquivos Vitest teve 555 aprovados e 1 arquivo com duas asserções antigas de layout falhando; mais 3 arquivos Node com 17 itens aprovados. As asserções antigas foram atualizadas para o layout de três linhas, e a deduplicação de identidade de projeto foi acrescentada; ao final, os 8 arquivos e 130 regressões afetadas desta mudança e das correções de revisão passaram. A lista e os logs foram guardados nos artifacts abaixo; não se afirma validação total.
- macOS Electron real → contêiner SSH Linux independente: o novo caso RDUX-13 passou, cobrindo informações do dispositivo, restauração ao clicar no projeto após desconectar, falha em porta não ocupada indo apenas para a área recolhida padrão, e preservação do dispositivo após a limpeza confirmada. A timeout de primeira instalação e os problemas de espera/seletores do teste anteriores foram localizados e corrigidos; execução final aprovada: `desktop-e2e-20260928211106956-p24417-7952ff47932db52d`.
- O caso existente RDUX-05 de proteções das configurações passou na build final do produto, run: `desktop-e2e-20260928210923472-p23086-df79c48fd72ebf81`; nesse run combinado, o novo caso chegou a falhar por uma constante de teste não importada, e já está coberto pela regressão final isolada acima.
- Capturas de tela: `packages/desktop/.e2e-artifacts/desktop-e2e-20260928211106956-p24417-7952ff47932db52d/device-cards-{light,dark}-{1440,900,480}.png`, com os temas e o layout em tela estreita verificados; 480px é uma janela do desktop, não um celular físico. O portão de gerenciamento de dispositivos no celular e o código continuous/replayable não foram alterados; os testes unitários existentes relacionados constam da lista de afetados e passaram, sem verificação real em celular físico nem em Windows/WSL. Os novos casos permanecem pending, sem promoção manual automática.
