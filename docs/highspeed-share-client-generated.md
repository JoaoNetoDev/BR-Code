# Cartão de compartilhamento Highspeed gerado no cliente

## Restrições

- Após o vencimento do cartão de aceleração, o cliente publica diretamente o cartão de compartilhamento no canto inferior esquerdo com base nas estatísticas de token/TPS já persistidas, sem chamar mais a interface `share` do servidor.
- Dentro da sessão e pelo entrada no canto inferior esquerdo abre-se o mesmo diálogo de compartilhamento; o diálogo mantém a ação Copy image.
- Copy image gera apenas a imagem SVG da área de estatísticas, sem incluir os textos ou botões do rodapé do diálogo.
- O endereço de compartilhamento, o share id e os mocks correspondentes foram removidos do fluxo de compartilhamento do Highspeed.

## Critério de estimativa de tempo 20/80

- O tempo total do modelo comum é composto por 20% de tempo de ferramentas e 80% de tempo de inferência do modelo.
- O Highspeed encurta apenas a parte de inferência do modelo, mantendo o tempo de ferramentas inalterado; o fator de aceleração da inferência do modelo usa o nível de cartão `highspeedTps / regularTps`.
- Para cada mensagem, a partir do tempo real de execução do Highspeed `H`, deduz-se o tempo do modelo comum: `N = H / (0.2 + 0.8 / modelSpeedup)`.
- O tempo economizado é `max(N - H, 0)`; múltiplas mensagens seriais do mesmo cartão são calculadas separadamente e depois somadas, evitando que o TPS do cartão seja usado diretamente para deduzir o tempo total e gerar desvios.

## Persistência pelo CLI dos tempos reais

- No estado final do turno, o CLI agrega `modelDurationMs` e `toolDurationMs` a partir dos eventos de requisição ao modelo e do ciclo de vida das ferramentas, e grava os dois, além do `otherDurationMs` não classificado, nos metadados `highspeed` do transcript do usuário; esses campos são opcionais e compatíveis com mensagens antigas.
- As estatísticas de compartilhamento priorizam essa divisão real persistida: o tempo das ferramentas permanece inalterado e o tempo do modelo é convertido de volta para o modelo comum pelo fator `highspeedTps / regularTps`; o tempo total da versão comum = tempo das ferramentas + outros tempos + tempo do modelo comum.
- Se mensagens antigas não tiverem os campos de divisão real, continua-se usando a estimativa 20/80 acima, evitando que cartões históricos falhem por causa da evolução do schema.
- A execução paralela de ferramentas é calculada pela união dos intervalos de tempo, evitando que ferramentas paralelas sejam somadas em duplicidade; requisições com retry do modelo acumulam a duration real de cada requisição.