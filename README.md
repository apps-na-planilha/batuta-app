# Batuta — casca PWA

Interface do **Batuta**, o app de finanças pessoais do
[Apps na Planilha](https://github.com/apps-na-planilha).

O app roda aqui, num domínio próprio, e conversa com a planilha Google do
usuário por uma API JSON autenticada por token. Os dados **nunca passam por
este servidor** — o navegador fala direto com o Apps Script do próprio dono
da planilha.

## ⚠️ Arquivo gerado

`index.html` é **gerado** a partir do `Index.html` do repositório principal:

```bash
npm run build
```

Não edite aqui. Corrija na fonte e rode o build — senão os dois divergem.

## Arquivos

| | |
|---|---|
| `index.html` | o app (gerado) |
| `ponte.js` | reimplementa `google.script.run` sobre `fetch` |
| `sw.js` | service worker — instalabilidade e casca offline |
| `manifest.webmanifest` | identidade do app instalado |
| `icones/` | ícones de tela inicial |

## Por que existe

O Apps Script serve páginas dentro de um iframe, e navegadores só leem
metatags de PWA do documento de topo. Resultado: um app servido pelo
HtmlService **nunca** abre sem a barra do navegador.

Hospedando a interface aqui, ela vira um documento de topo de verdade — e,
de quebra, uma correção de tela chega a todos os usuários sem ninguém
reinstalar nada.

Detalhes em `docs/specs/SPEC-002-api-e-frontend-separado.md`.
