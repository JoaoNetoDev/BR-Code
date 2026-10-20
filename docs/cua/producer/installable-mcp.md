# Pacote MCP instalável

> DEPRECADO. O servidor MCP em Python que ficava neste repositório foi
> **removido**, portanto não existe mais uma distribuição Python para instalar.
> A ferramenta MCP canônica de CUA agora é o pacote TypeScript **@zcode/zcode-cua**
> (npm). Este documento descrevia os perfis de instalação antigos
> `uvx --from zcode-cua[macos]@<wheel> zcode-cua`, os fluxos de distribuição via
> PyPI privado / compartilhamento de arquivos e o pipeline de release-bundle
> `scripts/package_mcp_distribution.py` — todos eles voltados para a wheel
> Python removida e que não se aplicam mais.

Instale a ferramenta canônica pelo npm:

```bash
npm install @zcode/zcode-cua
# ou, sem instalar:
npx @zcode/zcode-cua
```

A CLI em TypeScript suporta ambos os transportes. STDIO continua sendo o
padrão; o Streamable HTTP local está disponível explicitamente:

```bash
npx @zcode/zcode-cua --transport streamable-http --host 127.0.0.1 --port 8001
```

O endpoint MCP é `http://127.0.0.1:8001/mcp`.

O código-fonte e os perfis de instalação do produto/broker ficam no repositório
z-code:
[git.example.invalid/codegeex/z-code](https://git.example.invalid/codegeex/z-code)
→ pacote [@zcode/zcode-cua](https://www.npmjs.com/package/@zcode/zcode-cua).

O que este repositório ainda hospeda (o harness act-verify de modelo real, a
skill canônica, os fixtures de paridade do pipeline de screenshot) está
descrito no `README.md` de nível superior. O guia anterior de
empacotamento/distribuição Python está preservado no histórico git deste
repositório (veja o commit anterior a `refactor/deprecate-python`).

Para o contexto da reescrita em TypeScript e desta depreciação, veja o documento
de design no Feishu:
[BE9UdI4zMo4HjRx4659cTHOnn9f](https://internal-docs.example.invalid/redacted).
