# Não há cartão de progresso na interface principal após recolher o assistente de conexão

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch 09.
O `three-screen` do lote `r3-server-20261011150809016-2aeaba` falhou em 141.0 segundos.
O alvo TCP independente já aceitou a conexão e ficou parado no handshake; depois de clicar em «Recolher», o fluxo voltou à interface principal e confirmou que a área de projetos está visível; 5 segundos depois ainda não havia `remote-connection-minimized`. A gravação mostra a interface principal normal e a linha de projeto, o que descarta o erro anterior de procurar o cartão da barra lateral apenas na página de configurações.

O [contrato do assistente de três telas](../remote-connection-ux/10-three-screen-wizard-and-selection.md) exige que, após recolher, a área de projetos exiba um progresso contínuo, e que o resultado de falha seja preservado e permita retomar o assistente.
Atualmente, `RemoteConnectionMinimizedProgress` retorna null direto quando não há `slot.container`; o código-fonte preserva a definição de Slot e o provider Root, mas não foi encontrada a montagem de `RemoteConnectionProgressSlot` na barra lateral de projeto atual.

```text
Conexão pending → recolhe o assistente → retorna à área de projetos
  → contêiner de progresso não registrado → sem cartão de progresso e sem entrada de recuperação desse cartão
```

Nesta rodada não modificamos a implementação de negócio. Este resultado não prova que a conexão foi cancelada; as asserções posteriores de «falha em segundo plano preservada, visualizar para recuperar, sem rediscagem» não foram alcançadas por causa da ausência do cartão de progresso. A seção de progresso em segundo plano do case de inspeção também observou a mesma ausência e precisa ser registrada como falha de seção.

Evidências: a gravação e os logs da falha do `three-screen` do lote acima; o `index.json` da inspeção do patch 08 preserva a falha da seção de progresso em segundo plano.
