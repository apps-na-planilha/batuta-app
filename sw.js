// Service worker minimo.
// Existe por dois motivos: o Chrome so oferece "Instalar" para paginas com um SW
// que tenha handler de fetch, e ele garante que a casca abra offline.
// O conteudo do app NUNCA e cacheado — vem do Apps Script, sempre fresco.

// ⚠️ BUMP OBRIGATORIO A CADA MUDANCA NA CASCA.
// O handler de `activate` apaga todo cache cujo nome nao seja este. Sem o
// bump, um index.html quebrado guardado aqui sobrevive ao deploy e volta a
// ser servido quando o aparelho estiver offline.
const CACHE = "batuta-casca-v5";
const CASCA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./ponte.js",
  "./icones/icone-192.png",
  "./icones/icone-512.png",
  "./icones/apple-touch-icon.png"
];

// Arquivos que DEFINEM a versao do app. Estes sao sempre revalidados contra
// o servidor, custe um 304.
//
// O motivo: o GitHub Pages serve o index.html com `Cache-Control: max-age=600`.
// Um `fetch(request)` comum respeita isso e nem pergunta ao servidor por 10
// minutos — entao um deploy podia nao chegar no aparelho, e a pessoa nao tinha
// como saber se estava vendo a versao nova. Mordeu de verdade no deploy da
// Sprint 12.
//
// Icone e manifest ficam de fora: mudam quase nunca, e revalidar todos eles a
// cada abertura custa ida e volta no 4G sem devolver nada.
const SEMPRE_FRESCO = /(^\/$)|(\/index\.html$)|(\/ponte\.js$)/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Tudo que nao for da propria casca passa direto para a rede.
  if (url.origin !== location.origin) return;

  // Guardar no cache nunca pode derrubar a resposta que o app espera.
  const guardar = (resposta) => {
    const copia = resposta.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
    return resposta;
  };

  const doCache = () =>
    caches.match(e.request).then((r) => r || caches.match("./index.html"));

  if (SEMPRE_FRESCO.test(url.pathname)) {
    // Busca pela URL em vez de repassar o Request: um request de navegacao
    // tem mode "navigate", e reconstrui-lo com outras opcoes lanca erro em
    // alguns navegadores. Como e sempre um GET simples, a URL basta.
    //
    // "no-cache" nao e "no-store": o navegador ainda manda o ETag e ganha um
    // 304 vazio quando nada mudou. O custo e um round-trip, nao o download.
    e.respondWith(
      fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
        .then(guardar)
        .catch(doCache)
    );
    return;
  }

  e.respondWith(fetch(e.request).then(guardar).catch(doCache));
});
