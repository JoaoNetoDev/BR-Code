# Mention Panel Folder Entries

## Contexto

Os candidatos de arquivos do `@` já retornam pastas, mas a camada de pré-visualização dos candidatos antes renderizava apenas arquivos; diretórios continuavam aparecendo com o ícone de arquivo comum, inconsistente com a semântica do mention token na caixa de entrada.

## Objetivos

- Quando os candidatos de arquivos do `@` contiverem `kind: "directory"` nos dados, tanto a pré-visualização do candidato quanto o mention token exibirão o ícone de pasta.
- Arquivos comuns continuam usando a resolução de ícone de arquivo existente.
- Não altera a busca de arquivos, os filtros, a inserção nem o formato de serialização.

## Limites

- Apenas a camada de exibição da UI é ajustada; o protocolo e a lógica de varredura de arquivos não são modificados.
- A semântica de ícone de diretório é transmitida pelo `kind` estruturado, sem adivinhar pelo sufixo do caminho.
- Não afeta a interação de menção no desktop nem na Web.

## Aceitação

- Candidatos de diretório no painel do `@` exibem o ícone de pasta.
- O mention token de diretório na caixa de entrada continua exibindo o ícone de pasta.
- O comportamento do ícone dos candidatos de arquivo permanece inalterado.