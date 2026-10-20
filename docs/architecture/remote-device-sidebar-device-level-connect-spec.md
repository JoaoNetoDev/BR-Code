# Entrada de restauração do workspace após o dispositivo ficar online

O cabeçalho do grupo de dispositivos da barra lateral antiga e a UI de connect-and-chat foram substituídos pela [navegação de projetos em lista plana](../remote/project-first-remote-navigation-spec.md).
A entrada com diretório restaura o projeto original; a conexão manual sem diretório permite escolher o diretório depois de concluída; quando são necessárias credenciais, instalação ou atualização, o processo é entregue ao único assistente, preservando a intenção original.
A exibição depende apenas dos [cinco estados unificados](remote-device-connection-ux-spec.md), sem manter os quatro estados antigos nem a regra pending→offline.

## Portão C3 de restauração após o dispositivo ficar online

As regras efetivas deste item foram centralizadas em [reattach do Renderer](../remote/desktop-remote-session-renderer-reattach.md):
Na partida a frio do Host, o dispositivo é escolhido como candidato de conexão silenciosa a partir do `lastOnlineAt` dos últimos 7 dias; depois que o dispositivo fica online, o Renderer reanexa à janela atual todos os projetos abertos, desconectados e com identidade estável daquela Source, sem filtrar novamente pela idade do workspace nem pelo último estado connected.
As bordas de deduplicação no mesmo ciclo, de fechamento de terminal, de desconexão ativa e de resultados tardios são mantidas por essa especificação.

RDUX-12/13/14 são os números de regressão originais do cabeçalho de grupo de dispositivos e não equivalem às tickets de implementação de UX que reutilizaram os mesmos números depois; os registros originais são preservados e as aserções antigas de connect-and-chat não podem substituir a aceitação da navegação atual. Log da causa raiz original, lista de alterações e registros de teste:

```bash
git show a17a875588b8d66c2bee49236292e174df651363:docs/architecture/remote-device-sidebar-device-level-connect-spec.md
```

Esta rodada apenas converge a documentação, sem alterar o portão do Host, o formato de dados nem a semântica de desktop continuous / mobile replayable.
