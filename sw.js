// TransGest Service Worker — cache e suporte offline
const CACHE_NAME = "transgest-v1";

// Ficheiros essenciais para funcionar offline
const PRECACHE = [
  "/",
  "/index.html"
];

// Instala e faz cache dos recursos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Limpa caches antigas quando atualiza
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: Network first, fallback para cache
self.addEventListener("fetch", (event) => {
  // Ignora pedidos ao Supabase (precisam de rede)
  if (event.request.url.includes("supabase.co")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guarda em cache se for um recurso válido
        if (
          response.status === 200 &&
          event.request.method === "GET"
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, clone)
          );
        }
        return response;
      })
      .catch(() => {
        // Sem rede: serve da cache
        return caches.match(event.request).then(
          (cached) => cached || caches.match("/index.html")
        );
      })
  );
});
