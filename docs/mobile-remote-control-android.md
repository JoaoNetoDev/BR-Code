# Casca Android de Controle Remoto

`packages/android` é atualmente a casca Android do controle remoto do ZCode em celular. A primeira versão não reescreve o ZCode Agent, o relay nem o protocolo RPC; em vez disso, usa uma entrada nativa para hospedar a página web existente de controle remoto `/remote` do celular.

## Entrada

- Colar ou compartilhar um link `https://zcode.z.ai/remote?...`.
- Escanear o QR code de controle remoto gerado pelo aplicativo desktop.
- Abrir via deep link `zcode://remote?...`.
- A tela inicial guarda as 5 últimas URLs de controle remoto abertas com sucesso, que podem ser abertas diretamente após reiniciar o app. A lista mostra apenas nome do dispositivo, host e horário; a URL completa real fica guardada no `SharedPreferences` privado do app.

O pacote de produção permite abrir apenas `https://zcode.z.ai/remote`. O pacote de debug permite adicionalmente localhost e `/remote` na rede local, para facilitar o debug de páginas Vite locais em dispositivos reais.

## Leitura de código

A leitura de código usa a pré-visualização do CameraX e o ML Kit Barcode Scanning. O scanner reconhece apenas QR Codes e, após ler o conteúdo, a validação continua sendo feita por `RemoteControlUrlPolicy`, de modo que links inválidos não entram no WebView.

## Estabilidade em segundo plano

Após a página de controle remoto ser aberta, o app inicia um serviço em primeiro plano e mantém a tela ligada. A função do serviço em primeiro plano é reduzir a probabilidade de o Android reciclar o processo em segundo plano ou restringir a rede; ele não altera a fonte de verdade dos dados de negócio. A desconexão e a recuperação no celular continuam dependendo da semântica `web-remote-replayable` do controle remoto web existente, da reconstrução da bridge e do alinhamento dos task snapshots.

O app Android não cria um runtime de Agent independente, um local host ou uma sessão SSH/WSL/Docker. O celular só pode se conectar a um host que já existe na janela do desktop.