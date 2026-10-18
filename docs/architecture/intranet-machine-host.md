# Host da Máquina da Intranet

## Contexto

O download de dependências da intranet, a sondagem da intranet, os avisos de upload de SEA via SMB e as notificações de publicação precisam referenciar a mesma máquina da intranet. No passado, cada script escrevia seu próprio IP padrão, o que fazia com que Migrações de máquina esquecessem algum trecho.

## Regras

- Variável de ambiente unificada: `INTRANET_MACHINE_HOST`
- Valor padrão: `10.0.0.100`
- A semântica de host representa somente o endereço da máquina, sem protocolo, porta ou caminho
- Nos cenários que exigem uma URL completa, a montagem continua sendo feita no ponto de chamada, com o protocolo, a porta e o caminho próprios de cada um
- O endereço completo do espelho de deps continua podendo ser sobrescrito por `ZCODE_DEPS_BASE_URL`; essa variável sobrescreve a deps base URL completa e não substitui `INTRANET_MACHINE_HOST`

## Escopo de cobertura

- `packages/shared/src/intranetDefaults.ts`: host padrão da sondagem da intranet e probe URL
- `scripts/intranetDefaults.mjs`: host padrão da deps base URL do lado de scripts
- `scripts/download-glm.sh`: host padrão do script de download em Shell
- `apps/zcode-cli/packages/cli/scripts/upload-sea-smb.mjs`: host padrão dos avisos de URL SMB
- Scripts de notificação de publicação: montam a URL dos artefatos da intranet ou o endereço de envio remoto usando o mesmo host

## Exemplo de uso

```bash
INTRANET_MACHINE_HOST=192.0.2.10 pnpm bundle:desktop
```