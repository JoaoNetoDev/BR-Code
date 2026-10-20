# Entrada de design da UI remota

O agrupamento de dispositivos antigos, o assistente de cinco passos, as cores de quatro estados e o design de sincronização manual de modelos saíram de cena. Os contratos atuais são mantidos pelos seguintes documentos:

- [UX de conexão](../architecture/remote-device-connection-ux-spec.md): assistente de três telas, cinco estados unificados, erros, cartão de dispositivo, log e acessibilidade.
- [Navegação de projeto](../remote/project-first-remote-navigation-spec.md): projetos em mosaico, detalhe, reconexão no lugar e recuperação de navegação.
- [Especificação de design](../../DESIGN.md): tokens semânticos, tamanho de fonte, dimensões, temas e acessibilidade.
- [Provider Provisioning](../remote/provider-provisioning.md): edição local e distribuição automática, sem edição de modelo remoto nem entrada de sincronização manual.

A UI de chat remoto sem projeto foi desativada; os dados históricos são preservados. O ícone de projeto online e o estado não conectado usam exibição neutra, «requer ação» usa aviso; a prioridade completa só é mantida na tabela de cinco estados da UX.

O protótipo não está versionado e não pode servir como evidência de verificação reproduzível. A §20 histórica, a numeração RUI-SIMPLE, as revisões e as questões pendentes antigas estão no snapshot fixo:

```bash
git show a17a875588b8d66c2bee49236292e174df651363:docs/design/r3-remote-ui-redesign.md
```

Os itens ainda pendentes estão reunidos no [registro de questões do R3](../architecture/r3-source-server-remote-open-issues.md), e os estados de execução real e pending estão na [matriz de cobertura](../testing/conversation-session-e2e-coverage-matrix.md).
