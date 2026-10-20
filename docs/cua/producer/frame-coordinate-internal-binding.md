# Binding interno de frame de coordenada CUA

## Problema

O contrato de coordenadas visível ao model exigia anteriormente que o model
copiasse um `frame_id` opaco a partir de um bloco de texto adjacente ao raster:

```json
{"type":"coordinate","frame_id":"frame-ab12cd34","x":38,"y":105}
```

`frame_id` é autoridade de transporte, não entrada visual da tarefa. Exigir que
o model o repasse vaza a contabilidade interna do CUA para o contrato do model e
torna as ações visuais corretas dependentes da cópia de um token de implementação
opaco.

## Contrato

O alvo de coordenada público é:

```json
{"type":"coordinate","x":38,"y":105}
```

O model copia os índices de pixel inteiros do raster exato que acabou de observar.
Ele não faz nenhuma conversão de Retina, DPI, crop, resize, origem do display ou
ponteiro nativo.

O CUA liga uma coordenada sem qualificação ao raster acionável mais novo na
sessão atual do transporte MCP, antes de qualquer trabalho assíncrono começar:

```text
raster visível ao model (1280 x 645)
             │ somente x/y
             ▼
vincula o frame acionável mais recente neste transporte
             │ descritor de frame imutável
             ▼
valida acionável + TTL + posse de app/janela
             │
             ▼
projeta o centro do pixel do raster ──► unidade de ponteiro nativa ──► despacho
```

O alvo vinculado carrega o id de frame opaco internamente, pela admissão na fila
e pelo despacho. Se uma observação acionável mais nova for emitida enquanto a
ação está aguardando, o antigo alvo vinculado permanece válido dentro do seu
tempo de vida de frame retido; ele nunca é revinculado à geometria mais nova.

Uma observação somente-estado não publica raster e portanto nem avança nem revoga
a autoridade implícita de pixel atual. O raster acionável retido mais recente
permanece a fonte de binding até que outro raster acionável seja publicado ou que
suas checagens normais de TTL/LRU/acionabilidade falhem. Os `bounds` de AX em um
resultado somente-estado continuam sendo pontos globais de tela e nunca devem ser
submetidos como `x/y` de raster; models que precisam de coordenadas devem
continuar usando pixels escolhidos do raster retido ou solicitar um novo raster.

Por compatibilidade, os chamadores ainda podem fornecer `frame_id`. Um
identificador explícito é autoritativo: valores desconhecidos, expirados,
evictados, de outra sessão ou não acionáveis falham de forma fechada e nunca
recorrem ao frame mais recente. Um frame acionável anterior que ainda está retido e
dentro do TTL permanece válido mesmo depois que uma observação posterior cria um
frame mais novo.

## Invariantes

- Nenhum raster acionável no transporte atual significa que as ações de
  coordenada falham antes do despacho.
- O binding implícito é local ao transporte e não pode selecionar o frame de
  outra sessão MCP.
- O binding acontece de forma síncrona antes da resolução do app ou do I/O do
  broker.
- A revalidação na hora da fila usa o id vinculado internamente, então
  observações concorrentes não podem reinterpretar valores `x/y` existentes nem
  rejeitá-los só porque agora existe um frame mais novo.
- Observações somente-estado atualizam o estado dos elementos, mas não mutam a
  autoridade implícita de pixel; elas não podem forçar o model a repassar um
  `frame_id` retido opaco.
- `image_ref` permanece adjacente ao raster para verificação de integridade e
  diagnóstico, mas o model não precisa lê-lo nem repeti-lo.
- Toda observação de raster começa com o par canônico adjacente
  `[image, image_ref]`. O estado da tarefa ou os metadados compactos vêm depois.
- Coordenadas selecionadas do raster por app mais recente são submetidas sem
  alteração e o CUA vincula esse frame internamente.
- Erros de recuperação visíveis ao model nunca instruem o model a copiar
  `image_ref.frame_id`. Após expiração, pixels retidos ausentes, status de frame
  não acionável ou mudança de dono live, eles exigem uma nova observação e um
  novo `x/y` de raster; chamadores determinísticos de compatibilidade ainda
  podem usar um id retido explícito.

## Evidência de regressão

Os testes devem cobrir aceitação de schema/runtime sem `frame_id`, recusa de id
inválido explícito, recusa sem frame, seleção do frame mais recente, despacho
com frame explícito antigo retido, despacho de frame vinculado na fila após uma
observação posterior e rejeição de adivinhação implícita de espaço de ancestrais.
Uma sondagem de provider deve verificar que todo bloco de resultado de ferramenta
é entregue em ordem, e uma execução com o model no loop deve clicar a partir de
`x/y` visual sem repassar o id opaco.
