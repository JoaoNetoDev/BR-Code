# O detalhe do portão de versão não informa que o desktop deve ser atualizado

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`. A fixture de versão usa a variante
dos metadados de versão compilados do runtime atual, com Server=`3.16.0`, minimum=`3.16.0` e
Desktop=`3.15.1`.

## Evidências de execução

O log do Host do patch 07 rejeita explicitamente a conexão do projeto:
`ZCode Desktop 3.15.1 must be upgraded to at least 3.16.0`. A página inicial exibe apenas
“需要处理 / 请查看详细信息并按提示处理后重试”. O teste em seguida preenche a ação real de
detalhamento.

O `version-controller-required` do patch 08, lote `r3-server-20261011143037600-31012b`, falhou
após 223,4 segundos. Já foi clicado em “详细信息” no banner e tentado expandir os detalhes
técnicos visíveis; o texto do diálogo continuou sendo apenas
“需要处理 / 需要更新 / 请查看详细信息并按提示处理后重试”, sem o desktop, a versão exigida
ou a ação correspondente. A gravação é consistente com `controllerGuidance`, o que já exclui o
problema de teste “não abriu os detalhes e apenas inspecionou a página inicial”.

```text
Host rejeita corretamente o Desktop antigo → a interface principal pede para ver os detalhes
  → abrir os detalhes → ainda manda o usuário ver os detalhes, sem indicar o que atualizar
```

Na mesma página, a aba de caminho exibe diretamente `workspaceSidebar.projectPath`, o que também
é uma lacuna de texto visível. A versão remota final continua sendo `3.16.0`; as asserções
seguintes, que dependem do SHA original de arquivamento permanecer inalterado, não foram
alcançadas, portanto os campos de versão não são tratados como verificação completa do
arquivamento.

## Escopo de tratamento

Deve-se manter o portão de compatibilidade correto e passar a direção de atualização já existente
no controller, a versão mínima e a ação executável para a UI de detalhes do projeto atual.

Não se deve rebaixar a versão remota nem deixar o usuário adivinhar em um “需要更新” sem
direção. Isso é registrado separadamente de
[Ausência do aviso opcional de versão compatível](21-optional-update-notice-missing.md); nesta rodada o código de negócio
não foi modificado.

Evidências: o log de Desktop `version-controller-required` do patch 07; o
`version-policy.json`, a gravação de falha e os logs do caso de mesmo nome do patch 08.
