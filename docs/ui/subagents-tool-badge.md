# Subagents Tool Badge

A lista de subagentes em Settings exibe apenas o resumo das permissões de ferramentas, sem expandir a lista real de ferramentas.

- Quando `tools` está ausente, é um array vazio ou contém `"*"`, isso significa que o subagente herda ou permite todas as ferramentas, e o badge da lista exibe `All tools` / `全部工具`.
- Somente quando `tools` lista explicitamente nomes de ferramentas e não contém `"*"`, o badge da lista exibe `{count} tools` / `{count} 个工具`.

Isso evita exibir o curinga `"*"` indevidamente como `1 个工具`.