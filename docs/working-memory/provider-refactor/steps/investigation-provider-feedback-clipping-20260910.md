# Recorte do banner de Provider: investigação no runtime Pro

> 2026-09-10. Status: a imagem original não foi reproduzida e a causa raiz não foi
> confirmada; não marcar como corrigido. Esta rodada só diagnostica, sem modificar código de
> produto.

> Decisão posterior do usuário: ignorar este item por enquanto. Manter o registro da
> investigação, sem continuar a implementação nem usá-lo como pré-requisito de conclusão dos
> demais Todos desta rodada; o resumo dos pendentes desta rodada está em
> [Todo107](./todo-107-provider-settings-feedback-enablement-and-template-links.md).

## Fenômeno original

O banner de sucesso do teste de conexão do Air estava com a metade inferior faltando, enquanto
a linha do modelo continuava visível; abaixo havia ao mesmo tempo o banner de "testando" de
outro modelo. Anexo original: captura de tela da área de transferência
`d51e6f7f-bf4e-4753-bdbd-87056848d5b3.png`.

## Investigação realizada

- O Pro não tinha um ZCode em execução; o Electron foi iniciado a partir de um build de
  desenvolvimento já existente e conectado via CDP. Descobriu-se que o build é mais antigo e
  não serve como validação de mesma versão do Air.
- Do pacote instalado no Air foi extraído apenas o recurso de renderer, carregado no
  diretório temporário do Pro para usar esse frontend real. Não se substituiu o código-fonte
  nem o build original. O Host continuou sendo o build original do Pro; como há inconsistência
  de DTO de conta/configuração, isso serve apenas para diagnóstico de layout do frontend e não
  representa a aceitação do aplicativo completo na mesma versão.
- Os dois Eletrons eram 41.0.3 e ambos os macOS eram 26.6.2; o Air é M4 e o Pro é M5. No Pro,
  a composição por GPU e o Metal estavam ambos habilitados.
- Por meio do Context da `ProviderDetailFeedbackBoundary` já existente foram injetados
  success / pending temporários, sem chamar a interface de modelos e sem salvar a
  configuração do Provider; também foi definido um estado isTesting temporário na linha do
  modelo para reproduzir a animação de giro da imagem original. Ajustou-se temporariamente a
  posição da lista para que a linha do modelo ficasse abaixo do banner.
- Foram verificadas as exibições com dois / três avisos, a remoção do aviso do meio, a mudança
  de tamanho da janela, o scroll e o transform da linha do modelo. Registrados o overflow dos
  ancestrais, o z-index, os limites e as camadas de composição.
- Com dois avisos, a altura medida foi de 44 CSS px cada e o espaçamento de 8 px, totalizando
  96 px; ficava dentro dos limites do painel de detalhes, e o z-index do viewport do banner
  era 20. O motivo da camada de composição inclui BackdropFilter, mas isso não é evidência de
  que ele causou a falha.
- Em 12 rodadas consecutivas de mudança de avisos/scroll foram recebidos 68 frames de
  screencast, com 12 frames de amostra salvos e verificação manual de 0/3/6/9/11; não se
  observou o desaparecimento da metade inferior da imagem original. Em todas as rodadas, os
  testes de acerto na parte inferior dos banners do DOM não acharam oclusão pela linha do
  modelo.
- O screencapture do sistema continuou retornando `could not create image from display` mesmo
  depois de o usuário acordar o Pro; as permissões de gravação de tela e as configurações de
  segurança não foram modificadas. Capturas e gravação de frames via CDP funcionaram, mas não
  podem substituir a evidência de tela do sistema que não foi obtida.

## Conclusões e próximos passos

Nas condições de reprodução desta vez, não se encontrou camada de CSS comum nem overflow de
contêiner pai que cortasse o banner ao meio. Essa conclusão não nega a captura de tela do
usuário e também não exclui por completo problemas de layout em outras condições de
temporização ou de dispositivo.

"backdrop-filter com falha de pintura na composição por GPU" continua sendo apenas uma
hipótese, sem uma comparação antes/depois da falha que a comprove; é proibido alegar a causa raiz
com base nisso ou aumentar o z-index / remover o blur como se fossem uma correção verificada.

O próximo passo deve ser conectar via CDP no Air quando a reprodução ocorrer de fato, registrando
no mesmo instante o rect do banner, a camada de composição e a imagem de tela, para então fazer
uma comparação de variável única que afete apenas estilos em memória (por exemplo, remover o
blur ou desativar a animação relacionada). O Air não tem porta de depuração no momento; é
preciso confirmar com o usuário antes de reiniciar, não se pode interromper a task por conta
própria.

## Evidências temporárias

- Na máquina local, `/tmp/pro-banner-stress-evidence.json`: geometria e resultados de acerto de
  cada rodada.
- Na máquina local, `/tmp/pro-banner-frame-0.png` a `11.png`: frames de amostra.
- Na máquina local, `/tmp/pro-banner-row-spinner.png`: cenário com a linha do modelo e o banner
  girando ao mesmo tempo.
- Na máquina local, `/tmp/zcode-banner-stress.cjs` e `/tmp/zcode-pro-banner-cdp.cjs`: scripts de
  diagnóstico, não são testes oficiais nem código de produção.

Acima estão arquivos temporários de diagnóstico, que não são evidência permanente de regressão;
ao implementar a correção, ainda será preciso deixar casos oficiais reproduzíveis.