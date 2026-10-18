# Todo147: gerar os endereços das contas de teste a partir da configuração de produção e completar a admissão por assinatura nos domínios de teste

Status: implementado, verificação direcionada e revisão concluídas; nenhum serviço real de modelo foi solicitado.

## Escopo

- O Built-in JSON de produção é a única fonte de edição; o script gera sincronamente o JSON de teste, alterando apenas as quatro categorias de URL do Provider de conta e as regras de site correspondentes.
- A configuração de teste mantém as regras de site de produção (os templates manuais continuam usando elas), as regras derivadas são geradas URL a URL e capacidades e prioridade não mudam.
- O revision é sincronizado, a configuração do usuário não é modificada, nenhuma configuração online é publicada e nenhuma reescrita de URL em runtime é adicionada.
- A assinatura ganha dois hostnames de teste explícitos de z.ai; bigmodel.cn segue com o casamento existente.
- Em experiência / off-peak a Sig continua não sendo enviada; os demais comportamentos de assinatura, autenticação e Header são mantidos.

As regras detalhadas e os comandos estão em [Spec de build para os dois ambientes](../../../builtin-provider-config-build-environments.md).
Esta decisão dá sequência ao "inicialmente os dois idênticos" do Todo146; depois disso o JSON de teste deixa de ser mantido de forma independente.

## Aceitação

- [x] O script gera de forma repetível sem alterar a fonte de produção; novos modelos / capacidades são sincronizados, e a verificação de desatualização falha sem escrever arquivo.
- [x] Os oito endereços de conta das duas Copies Release reais são consistentes com a configuração efetiva de modelos correspondente; o template manual e os demais campos são preservados.
- [x] Requisições com Key manual no domínio de teste passam pelo mesmo gate, pelo handshake de mesma origem e pela Sig; domínio falso, gate desligado e fronteiras HTTPS estão cobertos.
- [x] As duas providers em experiência / off-peak usam no domínio de teste um JWT com o formato real, e tanto o fluxo com streaming quanto sem streaming não entram na assinatura.
- [x] Testes, tipos, lint, arquitetura e revisão relacionados concluídos; o ambiente real não testado foi registrado com honestidade.

## Verificação e revisão de 2026-09-14

- 7 itens do contrato de geração em Node passaram; os 13 itens do contrato de build existente passaram; ambos foram incorporados à regressão diária por meio do wrapper Vitest.
- Os 70 itens do conjunto de assinatura do SDK passaram, injetando um transport local para capturar as requisições reais do SDK e asserindo o handshake de mesma origem, a Sig final e a exceção de JWT nos domínios de teste; nenhuma conta real é consumida.
- A única diferença do JSON de teste são as 8 URLs de conta e as 7 regras de site derivadas; o JSON de produção não foi modificado.
  As oito contas, com todos os modelos embutidos atuais, ficam com a configuração efetiva de modelos consistente entre teste e produção após a decodificação completa do Release.
- A verificação de tipos do diretório raiz e de adapters passou; o lint do diretório raiz ficou com 0 erros e 42 avisos já existentes; arquitetura com 0 violações e a verificação de formatação dos arquivos alterados passou.
- Revisão adicional de `model-execution.test.ts`: 31 itens passaram, 3 falharam (falhas já existentes). Depois de restaurar temporariamente o arquivo de execução para HEAD (com diff confirmado como vazio) e rodar de novo, continuam sendo as mesmas três falhas: um teste antigo que espera que a Key manual oficial não seja assinada e duas falhas Start / Off-Peak que não declaram accountMode e são efetivamente construídas pelo fixture como api-key. Esses testes antigos não foram modificados e a correção do produto não foi ampliada.
- O lint do pacote inteiro de adapters continua bloqueado por violações max-lines já existentes em outros arquivos não alterados; os arquivos alterados desta vez passam no lint sozinhos.
- Não houve mudança de UI, dados de usuário, sincronização/execução de mensagens nem novo E2E de interação; não foram executadas requisições de rede reais com conta de teste nem a instalação do pacote de assinatura completo.
- O build consome apenas arquivos já gerados e não os reescreve silenciosamente; a revisão da configuração de produção, dos templates, das regras de modelo, das sobrescritas individuais e da ordem das exceções de assinatura não mostrou mudanças inesperadas.