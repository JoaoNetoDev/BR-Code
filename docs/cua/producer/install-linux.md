# Instalando o zcode-cua no Linux

> DEPRECADO. O servidor MCP em Python que ficava neste repositório foi
> **removido**. A ferramenta MCP canônica de CUA agora é o pacote TypeScript
> **@zcode/zcode-cua** (npm). Este documento descrevia o caminho de instalação
> antigo `uvx --from zcode-cua[linux]@<wheel> zcode-cua` e o launcher de distro
> `scripts/zcode-cua-linux` baseado em `pyatspi` — todos eles voltados para o
> servidor Python removido e que não se aplicam mais.

Instale a ferramenta canônica pelo npm:

```bash
npm install @zcode/zcode-cua
# ou, sem instalar:
npx @zcode/zcode-cua
```

O código-fonte e o backend Linux/AT-SPI ficam no repositório z-code:
[git.example.invalid/codegeex/z-code](https://git.example.invalid/codegeex/z-code)
→ pacote [@zcode/zcode-cua](https://www.npmjs.com/package/@zcode/zcode-cua).

O que este repositório ainda hospeda (o harness act-verify de modelo real, a
skill canônica, os fixtures de paridade do pipeline de screenshot) está
descrito no `README.md` de nível superior. O guia anterior de instalação do
servidor Python no Linux está preservado no histórico git deste repositório
(veja o commit anterior a `refactor/deprecate-python`).

Para o contexto da reescrita em TypeScript e desta depreciação, veja o documento
de design no Feishu:
[BE9UdI4zMo4HjRx4659cTHOnn9f](https://internal-docs.example.invalid/redacted).
