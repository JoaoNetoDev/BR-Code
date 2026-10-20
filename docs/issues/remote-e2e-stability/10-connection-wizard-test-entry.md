# Case do assistente de conexão usou por engano a entrada de criação de projeto

Status: done

## Causa e correção

Sob o baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, a criação na área de projetos passa por `ProjectConnection`, que seleciona apenas o Host e depois entra em `RemoteProjectPicker`. A «Nova conexão» da página de configurações é o assistente independente que mantém as três telas do passo de diretório.

O case antigo `boundary` conectava pela entrada compartilhada de projetos, mas continuava esperando o `remote-boundary-hint` do assistente antigo, e por isso reportava falsamente a ausência da dica.

As gravações dos lotes `r3-server-20261011101534847-c8a52a` e `r3-server-20261011102656782-52518d` mostram a lista «Adicionar projeto remoto», e não a página de diretório que esse case deveria validar. A correção faz o case específico do assistente selecionar explicitamente a entrada de configurações e continuar pelo fluxo real de seleção de diretório, salvamento do projeto e criação de nova tarefa dentro do projeto; os cases de negócio SSH comuns mantêm a entrada de projetos.

## Reverificação e limites

- O teste de regressão primeiro prova que o helper antigo ignorava a escolha da entrada e ainda seguia pelo caminho de projetos; depois da correção, passa.
- O `boundary-ack.json` do lote `r3-server-20261011104332183-3a0c00` registra na verdade o texto da primeira explicação, a identity do projeto A e `secondProjectHintAbsent=true`; a versão de onboarding permanece 2.
- A ausência original da dica não é um defeito de negócio do assistente de conexão das configurações. Se o novo caminho de projetos também precisa receber a mesma explicação é uma discussão de produto independente; nesta rodada não alteramos o negócio nem removemos a asserção da dica por causa do erro de entrada do case antigo.
- O case completo continua FAIL: após o reinício a frio, a conexão salva está sem credenciais, ver [problema 11](11-ssh-credential-missing-after-restart.md). Não descrevemos a passagem da primeira metade como PASS do case inteiro.
