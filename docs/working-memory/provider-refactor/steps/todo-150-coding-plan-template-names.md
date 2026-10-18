# Todo150: Remover API dos nomes dos templates do Coding Plan

Estado: implementado e com verificação direcionada e revisão de código concluídas; não enviado, sem publicação de configuração online, aguardando aceitação na máquina real.

## Escopo e restrições

- O nome na linha superior ao adicionar um provider foi alterado para `BigModel Coding Plan` e `Z.ai Coding Plan`, igual em chinês e inglês.
- A API comum na linha inferior ficou `BigModel API` e `Z.ai API`.
- Apenas o `templateNameMap` do Built-in foi modificado, reutilizando a lógica de leitura já existente na página, sem adicionar casos especiais no frontend.
- Mantidos o ID do template, Access, URL, a configuração de modelos e os nomes de Personal Provider já existentes, sem migração de dados.
- A revision da configuração de produção subiu para 28; a configuração de teste é gerada pelos scripts existentes; a configuração remota não é publicada automaticamente.
- Este item continua e substitui a nomenclatura histórica de templates de [Todo111](./todo-111-zhipu-coding-plan-api-key-and-standard-api-templates.md).

## Implementação e aceitação (2026-09-14)

Complemento de 2026-09-15: conforme a grafia de marca especificada pelo usuário, `Z.AI` foi alterado para `Z.ai` nos dois templates. Apenas os nomes em chinês e inglês dos templates foram alterados, e a configuração de teste foi gerada; não foi ampliado para uma substituição global em conta Provider, documentos históricos ou nomes pessoais de usuário. Foram adicionadas as asserções de configuração de produção/teste e a verificação dos nomes do cartão e do tooltip no caso de navegador de duplo tema já existente.

Verificação complementar: os testes unitários de nome falharam primeiro em 2 casos; após a modificação, 18 casos nos arquivos Zhipu/OpenRouter passaram, assim como 4 casos de navegador cobrindo o ícone Z.ai nos dois temas do Pro, o nome dos templates e o nome do OpenRouter. Após a verificação do tooltip, ele é fechado explicitamente com Escape e awaited até sumir, evitando que o hint anterior afete o próximo cartão. typecheck, Desktop typecheck:e2e, verificação de sincronia de configuração e verificação de arquitetura passaram; lint com 0 erros e 42 warnings preexistentes. O pending do navegador não substitui a aceitação do pacote completo / controle remoto do celular, e a configuração online não foi publicada.

- [x] Commit de implementação: `b43bcb2588`.
- [x] Asserções de nome adicionadas primeiro e falha confirmada; após a modificação, 15 casos de integridade de template e configuração passaram.
- [x] Verificação de sincronia de configuração de produção/teste, typecheck e verificação de formatação passaram; lint com 0 erros e 42 warnings preexistentes; verificação de arquitetura com 0 violações.
- [x] A revisão confirmou que a configuração alterou apenas nomes e revision, e que a API comum e os demais comportamentos permanecem inalterados.
- [ ] Após a publicação da configuração, confirmar na máquina real se os nomes das duas cartas da página de adição de provider estão corretos; nesta rodada não foi executada a aceitação de interface do desktop/celular.