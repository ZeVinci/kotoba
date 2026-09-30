/* =====================================================================
   Kotoba — Service Worker (accès hors ligne)
   Stratégie :
   - À l'installation : mise en cache de tous les fichiers de l'app.
   - Fichiers de l'app : "stale-while-revalidate" → réponse immédiate
     depuis le cache, puis mise à jour silencieuse en arrière-plan
     (la nouvelle version apparaît à l'ouverture suivante).
   - Google Fonts : mis en cache à la première utilisation en ligne.
   Incrémenter CACHE_VERSION seulement si la liste PRECACHE change.
   ===================================================================== */

const CACHE_VERSION = 'kotoba-v1';
const FONT_CACHE    = 'kotoba-fonts-v1';

// Fichiers indispensables : l'installation échoue si l'un manque.
const PRECACHE = [
  './',
  './index.html',
  './style2.css',
  './vocab2.js',
  './grammaire.js',
  './app2.js',
  './manifest.json'
];

// Fichiers facultatifs : mis en cache s'ils existent, ignorés sinon.
const OPTIONAL = [
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- Installation ---------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // cache: 'reload' → contourne le cache HTTP du navigateur
    await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
    await Promise.allSettled(
      OPTIONAL.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
    await self.skipWaiting();
  })());
});

/* ---------- Activation : nettoyage des anciens caches ---------- */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [CACHE_VERSION, FONT_CACHE];
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('kotoba-') && !keep.includes(n))
           .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* ---------- Interception des requêtes ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts (CSS + fichiers de polices)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE, event));
    return;
  }

  // Autres domaines : laisser passer
  if (url.origin !== self.location.origin) return;

  // Navigation (ouverture de l'app, start_url ".") → index.html
  if (req.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(new Request('./index.html'), CACHE_VERSION, event));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, CACHE_VERSION, event));
});

/* ---------- Stratégie commune ---------- */
async function staleWhileRevalidate(req, cacheName, event) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });

  // cache: 'no-cache' → revalide auprès de GitHub Pages (évite le max-age de 10 min)
  const network = fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' }))
    .then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);   // la mise à jour continue en arrière-plan
    return cached;
  }

  const res = await network;
  if (res) return res;

  return new Response('Hors ligne — ressource non disponible', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
