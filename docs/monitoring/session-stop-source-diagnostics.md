# Diagnóstico da origem do stop de Session

Todo103 G13-B; origens `8e3e10df4d`, `ee30f2ad33`.

## Contrato

- O botão de stop do Composer é marcado como `button`; o Esc do Pane atualmente focado é marcado como `escape`.
- Reutilizam-se as proteções existentes de `canStop`, de Esc já consumido/em modal, de Pane somente leitura e de ID de execução em primeiro plano; nenhuma nova entrada de stop é adicionada e o protocolo de comandos não muda.
- Tanto o caminho de emitir o comando quanto o de pular por não haver execução parada passam por `logger.lifecycle.info`; falha no envio passa por `logger.lifecycle.warn`. O `logger.info` comum é desabilitado em builds de produção e não pode servir para atribuição de stop indevido.
- Registra-se apenas origem, Session ID e ID de execução já existente em primeiro plano; nunca prompt, credenciais de modelo ou corpo da mensagem. Uma operação de stop gera um único registro, sem imprimir por evento de streaming.
- O log indica "tentativa de emitir o comando", não que o Agent aceitou ou encerrou; o estado final continua sob responsabilidade do ACK de comando / projeção de Session já existentes.

```text
Botão de stop / Esc não consumido
             |
             v
Proteções existentes de Pane / canStop
   ├─ não pode parar -> log de skip, não envia comando
   └─ pode parar -> log de origem -> comando stop original (ID de execução original)
                               └─ falha no envio -> warning de ciclo de vida
```

## Verificação

1. Montar um SessionPane real, acionar o callback do Composer: o comando ainda carrega o ID de execução da projeção e registra a origem `button`.
2. Session que não pode ser parada: não deve enviar comando de stop e registra a origem `skipped`.
3. Teste do branch de produção do Logger: lifecycle é encaminhado pela bridge do desktop, info comum não é encaminhado; sem bridge do desktop não lança erro.
4. Os E2E existentes de stop / fila são preservados e reverificados na integração final; este item não altera o roteamento nem as semânticas de estado do continuous do desktop ou do replayable do celular.