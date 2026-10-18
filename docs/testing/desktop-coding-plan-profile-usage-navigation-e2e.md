# E2E de Navegação para Uso de Perfil no Desktop

## Escopo

A entrada `使用统计` do menu do avatar é um ponto de entrada de navegação da página de configurações e precisa cobrir os dois contextos de página:

- O menu do avatar no footer da sidebar do workspace.
- O menu do avatar no footer da sidebar da página de configurações.

Este conjunto de cases verifica apenas a semântica de navegação, e não os benefícios do Coding Plan, a cota ou os dados do Team Plan. As asserções de dados de uso continuam nos E2Es exclusivos de Team Plan / Coding Plan.

## Cases

| Case | Pré-condição | Ação | Esperado |
| --- | --- | --- | --- |
| ECR-usage-01 | O workspace padrão do desktop está aberto | Clicar em `使用统计` no menu do avatar do workspace | Abre a página de configurações e seleciona a seção `usage` |
| ECR-usage-02 | O workspace padrão do desktop está aberto; já está na seção `general` das configurações | Clicar em `使用统计` no menu do avatar das configurações | Permanece na página de configurações e muda para a seção `usage`, sem voltar ao workspace |

## Posicionamento dos testes

Esses dois cases ficam em `packages/desktop/test/e2e/e2ecase-regression.test.ts`, usando a pré-condição de workspace padrão. O teste clica no menu do avatar atualmente visível e no item de menu `使用统计` por meio do test id compartilhado, evitando que o DOM de workspace oculto retido pela página de configurações afete as asserções.