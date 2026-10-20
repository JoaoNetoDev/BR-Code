# 17: Adicionar SSH/WSL/Docker por tipo

Status: done

**Parent:** [#15 — Separação entre criação de projeto e gestão de conexão remota](15-project-device-selection-and-connection-management.md)

**What to build:** A "Nova conexão" das Configurações abre diretamente a janela de adição categorizada por SSH, WSL e Docker. O usuário escolhe um candidato descoberto ou preenche manualmente, clica explicitamente em "Adicionar e conectar", passa pelo fluxo existente de autenticação e instalação e, em caso de sucesso, vê o dispositivo adicionado nas Configurações.

**Blocked by:** [#16 — Conclusão de conexão independente nas Configurações](16-settings-connection-completion.md). Esta issue depende da intenção de conclusão de conexão e do fechamento independente dentro das Configurações dele, para que, após o envio do novo formulário, o usuário ainda não seja levado a escolher um diretório.

**Spec coverage:** Q2, Q4, Q5, Q8; a entrada das Configurações de RDUX15-04, RDUX15-05, com reverificação de RDUX15-10/18/21. RDUX15-23/24/25 cobrem o formulário categorizado, as limitações de plataforma e o portão da entrada das Configurações.

## Critérios de aceitação

- [x] A "Nova conexão" das Configurações abre diretamente o formulário de adição categorizado, com SSH como padrão; não exibe primeiro uma lista unificada entre tipos contendo os dispositivos já salvos nem exige escolher novamente um dispositivo existente.
- [x] O SSH suporta preenchimento a partir de um host do arquivo de configuração e preenchimento manual; os métodos de autenticação existentes, a entrada de credenciais, as opções avançadas, a validação de porta e as mensagens de erro obrigatórias continuam disponíveis.
- [x] Nas plataformas suportadas, o WSL oferece descoberta de distribuições e a entrada manual existente; o Docker oferece descoberta de containers e configuração manual. Respeita as limitações de capacidade de cada um, sem tratar Docker indisponível, ausência de containers em execução e falha de descoberta como o mesmo estado vazio.
- [x] Selecionar um candidato descoberto apenas prepara a configuração e não inicia a conexão; a ação principal é explicitamente "Adicionar e conectar". A carga ou a falha da descoberta não bloqueia outras fontes nem as entradas manuais permitidas pelas capacidades existentes.
- [x] Ao trocar o tipo ou o alvo de conexão, respostas antigas de descoberta não podem sobrescrever a nova seleção; as credenciais pertencem apenas ao alvo correspondente, e a senha ou a passphrase da chave privada de um dispositivo não pode ser levada para outro alvo.
- [x] Após o envio, reutiliza o mesmo fluxo de autenticação, instalação, atualização e conexão. Em caso de sucesso, permanece nas Configurações e localiza o dispositivo, sem criar projeto nem chat; em caso de falha, mantém o formulário corrigível e o erro, sem descrever a falha de autenticação como se as credenciais desta tentativa tivessem sido salvas.
- [x] Configurações de dispositivos ainda não reconhecidos permanecem em "Conexões incompletas" nas Configurações; após o reconhecimento, o dispositivo é exibido com a identidade Source, e Profiles diferentes do mesmo Source não formam dispositivos duplicados; não se adiciona um modo "apenas salvar".
- [x] Cancelar, fechar e o Esc seguem a proteção de atribuição de requisição do #16; registros de conexão existentes e conexões compartilhadas não são removidos por engano nem desconectados; ao voltar ao formulário para corrigir, é possível tentar de novo sem receber mais navegação ou sobrescrita de formulário de requisições antigas.
- [x] Troca de tipo, rótulos de campos, candidatos de descoberta, erros e a ação principal suportam teclado, chinês e inglês, tema claro e escuro atuais e janela estreita; plataformas não suportadas não apresentam entradas impossíveis de concluir.
- [x] Adicionar primeiro os testes de interação correspondentes e só então implementar; atualizar em sincronia os testes de Configurações e os helpers que dependem da antiga tela de seleção, alterando apenas as asserções de entrada já concluídas nesta issue, e registrar as evidências e as plataformas não verificadas.

## Verificação

- A partir da entrada real das Configurações, percorrer a descoberta e a configuração manual de SSH, WSL e Docker até a conclusão da conexão, afirmando o estado do dispositivo, a localização nas Configurações e que a quantidade de projetos não muda; o WSL é validado em um ambiente Windows suportado.
- Testes de integração de UI controlam a ordem das respostas de descoberta, a falha de descoberta e a falha de autenticação, verificando que a seleção não disca, que só o envio explícito conecta e que resultados do alvo antigo e credenciais não contaminam o novo formulário.
- Reutilizar a cadeia real de teste remoto para validar a espera de autenticação/instalação e a repetição após falha; registrar o ambiente realmente usado para cada tipo, sem usar "SSH passou" como substituto de "WSL/Docker passou".
- A implementação desta issue deve concluir checagem de tipos, lint, portão de arquitetura, testes unitários afetados e o E2E correspondente, além das verificações aplicáveis de plataforma, tema e tela estreita; o novo E2E é registrado pelo fluxo existente de revisão de candidatos, sem declarar por conta própria a admissão formal/CI.

## Escopo e passagem de bastão

- Saltar de um projeto ou chat para essa janela e voltar ao rascunho original é integrado por [#20](20-project-draft-settings-round-trip.md) e [#21](21-chat-settings-round-trip.md), respectivamente; esta issue entrega primeiro o caminho completo de adição dentro das Configurações.
- O significado de produto dos candidatos de dispositivos adicionados e dos candidatos de descoberta é distinguido conforme a especificação pai. O menu suspenso de projeto é de responsabilidade do [#18](18-direct-project-creation-and-device-selection.md); esta issue não altera a identidade de dispositivos ou projetos nem adiciona capacidade de autenticação.

## Verificação adiada

2026-10-12: o usuário exigiu explicitamente que os ambientes abaixo não sejam verificados nesta rodada; o TODO foi mantido e não é registrado como aprovado.

- [ ] Descoberta real de WSL no Windows, adição manual e conclusão da conexão.
- [ ] Regressão real de ponta a ponta da entrada de controle remoto Web/mobile e do portão de capacidade do Host.


## Evidências de conclusão (2026-10-12)

- A nova conexão nas Configurações entra direto no formulário categorizado padrão de SSH; o SSH config, a distribuição WSL e a descoberta de Docker apenas preenchem a configuração, e apenas o clique explícito em "Adicionar e conectar" disca. Mantidos a autenticação existente, a instalação, a consolidação por Source e a atribuição de cancelamento.
- A troca de tipo e a modificação do alvo SSH limpam as credenciais antigas; tanto as respostas atrasadas de Docker da descoberta inicial quanto as do refresh ativo do usuário se invalidam ao fim do ciclo de vida do tipo.
- Verificação: `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint` (0 errors, 208 warnings preexistentes), portão de arquitetura (0 violations) e fixture check passaram. Testes unitários raiz afetados: 668 arquivos / 6391 testes aprovados; regressão final da UI remota: 28 arquivos / 295 testes aprovados.
- Execução real de macOS Desktop + ambiente Linux SSH / Docker dedicado de `conversation-session-settings-connection-completion.test.ts`, 2 casos aprovados: SSH config e preenchimento manual, correção de falha de autenticação, mesmo Source com Profiles diferentes, reaproveitamento de dispositivo já online, descoberta e preenchimento manual de Docker, cancelamento por Esc, localização nas Configurações e restauração do projeto original. A contagem de projetos / chats permaneceu com os valores originais em todos os caminhos de adição.
- Evidência final: `packages/desktop/.e2e-artifacts/desktop-e2e-20261012103617954-p8589-11f164b179b46093`, inclui 16 conjuntos de retângulos e capturas de tela dos formulários categorizados, 8 capturas de tela das Configurações, `settings-completion-facts.json` e o relatório de testes; cobre chinês e inglês, temas claro e escuro, 1440 / 480px.
- As asserções iniciais em tela estreita leram um quadro intermediário da transição existente `transition: all` de 100ms. O registro da execução mostra que, no viewport de 480px, a largura transicionou de 672px para 448px (x=16), com botão right=447 / bottom=789.375, e o layout estável ficou completamente visível. O teste passou a aguardar o `finished` da animação limitada antes de medir, sem modificar o layout do produto nem introduzir timeouts no produto.
- As asserções de entrada das Configurações do antigo three-screen / walkthrough foram migradas para a semântica desta issue; não foram reexecutados todos os seus walkthroughs / cenários de fundo históricos, e o PASS histórico não é reaproveitado. Os novos casos seguem como pending, sem representar admissão formal / CI.
