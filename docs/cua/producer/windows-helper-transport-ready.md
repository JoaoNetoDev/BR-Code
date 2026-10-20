# Handshake de transport-ready do Helper do Windows

Os named pipes do Windows não suportam a renomeação de rendezvous do helper
Unix, então o Helper de desenvolvimento do Windows agora tem dois marcos de
inicialização:

```text
fork -> bind/auth named pipe -> transport_ready -> load native/backend -> ready
```

`transport_ready` é emitido somente depois que o listener do broker está
vinculado e o gate esperado de bearer token está instalado. O Host valida o pipe
e o PID do processo filho antes de publicar a tupla para o Agent. Durante o
intervalo antes da inicialização native/UIA, métodos do broker outros que
`broker_info` retornam `broker_unavailable` retentável com
`ready_state=warming_up`; o listener permanece o mesmo durante toda a vida
desse Helper. `ready` continua sendo o sinal de saúde completo.

Isso evita iniciar um Agent sem credenciais de CUA durante o cold start normal
do Windows. Falha de native/backend ainda fecha o único listener e segue o
caminho existente de recuperação/reciclagem do Host. Nenhum fechamento com
re-vinculação nem nome de pipe fixo é introduzido.

## Invariante de inicialização do backend

O listener pode aceitar sondas de saúde autenticadas enquanto a inicialização
native ainda está em andamento, mas a fonte AX nativa e o adaptador de automação
são construídos somente depois que o addon nativo foi instalado na superfície
adiada. O backend em aquecimento retorna `broker_unavailable` com
`request_delivery_state=not_sent` para requisições de ferramenta; `broker_info`
permanece disponível para a sonda de saúde de inicialização. Isso mantém a
detecção de capacidade (`typeof`, gating da Sessão 0 e a verificação da ABI de
captura de tela do Windows) atrelada ao addon real, e não a um Proxy
placeholder. Uma vez instalado o backend real, exports opcionais ausentes
continuam ausentes e não são reportados como capacidades em aquecimento.
