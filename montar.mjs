/* ============================================================
 * MONTAR.MJS — build da PWA do Batuta
 *
 *   node pwa/montar.mjs
 *
 * Lê o Index.html (a fonte, que ainda é servida pelo Apps Script) e gera
 * pwa/index.html: o mesmo app, mas como PWA de verdade num domínio nosso.
 *
 * É um BUILD, não uma cópia. Enquanto as duas versões coexistirem (SPEC-002,
 * fases 3 a 5), qualquer correção vai no Index.html e se propaga daqui —
 * é o que impede os dois arquivos de divergirem, que é a doença que este
 * projeto já teve entre a pasta local, o GitHub e o editor do GAS.
 *
 * As transformações são declarativas e falham alto: se um âncora sumir do
 * Index.html, o build para em vez de gerar um arquivo silenciosamente quebrado.
 * ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "Index.html");
const DESTINO = path.join(RAIZ, "pwa", "index.html");

// O editor do Apps Script devolve o arquivo em CRLF. Normalizamos na entrada
// para que as âncoras deste build não dependam de line-ending.
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
let html = fs.readFileSync(ORIGEM, "utf8").split(CR + LF).join(LF);
const aplicadas = [];

/** Troca única e obrigatória: se o alvo não existir, o build falha. */
function trocar(rotulo, de, para) {
  if (!html.includes(de)) {
    console.error(`\n✗ ÂNCORA NÃO ENCONTRADA: ${rotulo}`);
    console.error(`  Procurava por:\n  ${de.split("\n")[0].slice(0, 90)}`);
    console.error(`\n  O Index.html mudou. Ajuste montar.mjs antes de publicar.\n`);
    process.exit(1);
  }
  html = html.replace(de, para);
  aplicadas.push(rotulo);
}

// ── 1. <base target="_top"> só fazia sentido dentro do iframe do Apps Script.
trocar("remove <base>", '  <base target="_top" />\n', "");

// ── 2. viewport-fit=cover: sem isso env(safe-area-inset-*) vale 0 no iPhone.
//     Também devolvemos o zoom ao usuário — bloquear é problema de acessibilidade
//     e o iOS ignora desde a versão 10 de qualquer jeito.
trocar(
  "viewport com safe-area",
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
);

// ── 3. Manifest, ícone e título. É o que faz virar app instalável de verdade.
trocar(
  "manifest e ícones",
  '<meta name="apple-mobile-web-app-title" content="Financeiro" />',
  [
    '<meta name="apple-mobile-web-app-title" content="Batuta" />',
    '  <link rel="manifest" href="./manifest.webmanifest" />',
    '  <link rel="apple-touch-icon" href="./icones/apple-touch-icon.png" />',
    '  <link rel="icon" href="./icones/icone-192.png" />',
  ].join("\n"),
);

// ── 4. A ponte, no fim do <head>: garante que google.script.run já exista
//     quando o script do app rodar, lá no corpo da página.
trocar(
  "ponte antes do app",
  "  </style>\n</head>",
  "  </style>\n\n  <script src=\"./ponte.js\"></script>\n</head>",
);

// ── 5. Correções de tela que só fazem sentido fora do iframe.
//     Vão como override no fim do <style> para não brigar por especificidade
//     com as regras existentes.
const AJUSTES = `
    /* ===== AJUSTES DA PWA (gerados por pwa/montar.mjs) ===== */

    /* Notch e ilha dinâmica: com status-bar-style black-translucent o
       conteúdo passa POR BAIXO da barra de status sem isto. */
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: calc(80px + env(safe-area-inset-bottom));
    }

    /* Barra de gestos do iPhone: sem o padding, os rótulos da navegação
       ficam por baixo dela. */
    .nav-bar {
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
    }

    /* O toast sobe acima da barra de gestos junto com a navegação. */
    #toast.show {
      bottom: calc(90px + env(safe-area-inset-bottom));
    }

    /* Modais em tela cheia cobrem a tela inteira, inclusive as áreas
       seguras — então o conteúdo deles precisa do próprio respiro. */
    .cat-modal-header,
    .maestro-modal-header {
      padding-top: calc(16px + env(safe-area-inset-top));
    }
    .cat-modal-body,
    .maestro-modal-body {
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }

    /* UI-8: o valor não pode quebrar em duas linhas quando a descrição é
       longa. O flex encolhe o texto, nunca o número. */
    .tx-val {
      white-space: nowrap;
      flex-shrink: 0;
      padding-left: 12px;
    }
    .tx-left {
      min-width: 0;
    }
    .tx-desc,
    .tx-cat {
      overflow: hidden;
      text-overflow: ellipsis;
    }
`;
trocar("ajustes de safe-area", "  </style>", AJUSTES + "  </style>");

// ── 6. Service worker: é o que torna a página instalável no Chrome e o que
//     faz a casca abrir offline.
trocar(
  "registro do service worker",
  "</body>",
  `  <script>
    if ("serviceWorker" in navigator) {
      addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function () {});
      });
    }
  </script>
</body>`,
);

// ── Cabeçalho de arquivo gerado, para ninguém editar o destino por engano.
html =
  "<!-- ============================================================\n" +
  "     ARQUIVO GERADO — não edite à mão.\n" +
  "     Fonte: Index.html   ·   Build: node pwa/montar.mjs\n" +
  `     Gerado em ${new Date().toISOString()}\n` +
  "     ============================================================ -->\n" +
  html;

fs.writeFileSync(DESTINO, html, "utf8");

console.log("\n✓ pwa/index.html gerado");
aplicadas.forEach((a) => console.log("  ·", a));
console.log(`\n  ${(html.length / 1024).toFixed(0)} KB\n`);
