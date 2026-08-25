// Service worker minimo.
// Existe por dois motivos: o Chrome so oferece "Instalar" para paginas com um SW
// que tenha handler de fetch, e ele garante que a casca abra offline.
// O conteudo do app NUNCA e cacheado — vem do Apps Script, sempre fresco.

const CACHE = "batuta-casca-v2";
const CASCA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./ponte.js",
  "./icones/icone-192.png",
  "./icones/icone-512.png",
  "./icones/apple-touch-icon.png"
];

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

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
