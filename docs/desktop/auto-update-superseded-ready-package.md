# Pacote baixado de atualização automática substituído por uma nova versão

## Contexto

O desktop usa o generic feed do `electron-updater`. A versão em execução no cliente pode ficar
atrás de uma versão já baixada, mas ainda não instalada, por exemplo: o processo atual é `3.1.2`,
`3.1.3` já foi baixado e o usuário ainda não clicou em reinstalar.

A antiga máquina de estados fixava o menu em "reiniciar para atualizar" após `update-downloaded`, e o
polling em segundo plano só podia partir de `idle`. Portanto, quando o stable feed avançava depois
para `3.1.4`, o mesmo processo em execução não verificava de novo e, portanto, não substituía o
pacote instalável por `3.1.4`. Há uma lacuna da mesma natureza quando a versão apenas foi
detectada, mas ainda não baixada: com o estado parado em `update-available`, nem o polling nem o
"verificar atualização" do menu voltam a pedir o manifest, e o usuário só consegue instalar a
primeira versão que viu.

## Semântica desejada

- A versão mais recente do servidor é o alvo; o pacote local é outro fato. Depois de exibir
  `update-available`, `download-progress` ou `update-downloaded`, a reverificação em segundo plano
  não pode mudar a interface para `checking`.
- Verificar imediatamente no startup. Sem atualização visível, reverificar a cada 15 minutos; com a
  entrada de atualização ainda presente, a cada 2 minutos. Ao concluir ou cancelar um download,
  verificar mais uma vez se não houver verificação em voo. Se o download falhar, seja pela Promise
  de download ou pelo evento de error, verificar de novo; se a falha ocorrer antes de a verificação
  atual ser fechada, verificar depois do fechamento. Falha em atualização forçada não gera
  reverificação. A conclusão ou o cancelamento de uma verificação já em voo não enfileira outra,
  ficando a cargo do polling curto.
- O "verificar atualização" do menu volta a pedir o manifest em `update-available`, sem reproduzir a
  versão antiga em memória. Durante o download, apenas avisa que o download está em andamento; já
  baixado e ainda igual ao alvo, continua a instalação.
- Quando o resultado da reverificação for mais alto, substituem-se a versão, o canal e as release
  notes do alvo. Com o download automático ativado e sem download em andamento, baixa-se essa nova
  versão; caso contrário, permanece no estado de descoberta aguardando confirmação do usuário.
- Quando o resultado da reverificação for igual ao alvo atual, não baixa-se novamente. Quando for
  inferior ao alvo atual ou quando essa versão foi pulada, se houver um pacote pronto, permanece-se
  em ready; sem ele, volta-se para idle.
- Quando a versão do pacote baixado é igual ao alvo atual, o clique do usuário em "reiniciar para
  atualizar" continua instalando esse pacote. Quando o alvo já é mais alto e o novo pacote ainda
  não está pronto, tanto a saída quanto "reiniciar para atualizar" não instalam o pacote antigo.
- Se o download substituto falhar e o pacote ready antigo ainda existir, o menu retorna ao estado
  ready antigo, evitando que o usuário perca a entrada de atualização instalável que tinha.

## Restrições de implementação

- O download é disparado explicitamente pelo processo principal: o `autoDownload` do
  `electron-updater` fica desligado e, no evento `update-available`, chama-se `downloadUpdate()`
  conforme a versão ready. Durante um download em andamento é possível lembrar um alvo mais alto,
  mas não iniciar concorrentemente outro download.
- A comparação de versões usa coerção de semver, compatível com strings como `v3.1.4`; quando não
  é possível fazer o parse, considera-se necessário baixar apenas se as strings forem diferentes.
- O polling automático parte de `idle`, `update-available` e `update-downloaded`. `checking` e um
  `download-progress` real continuam sendo pulados, evitando downloads concorrentes. Em macOS /
  Linux, a instalação automática na saída é mantida apenas quando a versão do pacote ready é igual
  ao alvo atual.