# Exibição do número na detalhe do meu feedback

## Contexto

Ao abrir um feedback individual em "Relatar problema / Meus feedbacks", o usuário precisa enviar o número (issue) desse feedback ao time de desenvolvimento, produto ou suporte para localizar o problema. Atualmente a página de detalhe só exibe título, status, hora de envio e progresso de tratamento, e o usuário não consegue ver nem copiar o número diretamente.

## Objetivos

- Exibir o número do feedback atual no topo da página de detalhe de "Meus feedbacks".
- Disponibilizar um botão de cópia ao lado do número; ao clicar, copia apenas o valor puro do número, o que facilita colar em chats, documentos ou campos de busca do backoffice.
- A interação deve ser consistente entre desktop e Web mobile, sem depender de API exclusiva do desktop.

## Design

- A origem do número é `FeedbackTicketDetail.id`, sem novos campos no protocolo do serviço de feedback.
- O texto exibido é `Issue #<id>`; o `<id>` usa fonte monoespaçada, evitando dificuldade de leitura de números longos.
- O botão de cópia fica na mesma linha do número, usando tamanho `ghost` + `icon-sm` do `Button` e o `CopyIcon`, em conformidade com o requisito de botões de ferramenta compactos em `DESIGN.md`.
- O conteúdo copiado contém apenas `<id>`, sem o prefixo `Issue #`.
- Após a cópia bem-sucedida, o label acessível do botão muda brevemente para "Copiado"; em caso de falha, registra-se um warn por `packages/ui/src/logger.ts`, sem chamar diretamente `console` nem `window.zcode`.

## Compatibilidade

- A área de transferência do navegador usa `navigator.clipboard.writeText`; o Electron do desktop, a Web e o controle remoto do celular passam pela mesma Web API.
- Se a área de transferência não estiver disponível ou a escrita falhar, a renderização da página de detalhe não é bloqueada; apenas se registra um log diagnosticável.
- A alteração não envolve `clientMode`, `deliveryKind`, realtime de task, snapshot, queue ou a cadeia de recuperação do controle remoto.

## Verificação

- Teste unitário cobrindo a renderização do número na página de detalhe e o label do botão de cópia.
- Executar `pnpm typecheck`.
- Executar `pnpm lint`.