# Após conectar com sucesso em uma versão compatível, o cartão do dispositivo não tem aviso de atualização adiável

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch de teste 07.
O `version-optional` do lote `r3-server-20261011125749338-152f05` falhou em 214.2 segundos.
O fixture de versão usa o runtime atual completo, alterando apenas a versão compilada e os metadados de compatibilidade; não representa a implementação real de uma versão futura.

## Fatos de execução

A versão instalada inicialmente era `3.15.1`; o fixture instala `3.16.0`, com minimum=`3.15.0`. Após a conexão, tanto A quanto B restauraram o novo attachment, e no fim o remoto continuava em `3.16.0`, sem nenhuma queda forçada de versão. Mesmo após o cartão do dispositivo esperar 30 segundos seguidos, ele só mostrava conectado, SSH, os projetos originais de A/B e as entradas de desconectar/editar/logs — nenhum aviso de atualização nem o botão "depois".
O `version-policy.json` guardou os dois restoredProjects e o optionalPanelText completo; desta vez já foi excluído o problema de leitura de um único quadro logo após a montagem da página de configurações. A asserção de deduplicação do aviso adiado e da remontagem da página de configurações ainda não foi alcançada.

```text
Versão de Server superior e compatível → restauração original de A/B → abertura das configurações de dispositivos remotos
  → após 30 segundos o cartão ainda não tem aviso de atualização → impossível validar "depois" e a deduplicação
```

## Contrato e limites

O [contrato de atualização do cartão do dispositivo](../remote-connection-ux/13-settings-device-cards-and-updates.md) exige que a atualização opcional use uma faixa neutra com "depois / atualizar", sem toast. A determinação de compatibilidade atual registra endpoints com versão diferente e compatível como atualização opcional; nesta relação de versões do fixture, a direção da atualização deve ser o desktop, e não se pode afirmar que o remoto precisa necessariamente atualizar.
O código do cartão de configurações já tem um ramo com `upgradeTarget=controller`, mas a página atual não recebe nem exibe o estado correspondente.
É preciso continuar localizando a projeção do estado de compatibilidade da conexão para o cartão do dispositivo; esta rodada não alterou código de negócio e também não registra um projeto restaurado normalmente como falha de conexão.

Evidências: o `version-policy.json` do lote `version-optional` acima, os logs de execução e a gravação de falha.
