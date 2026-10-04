// 存活模擬：離線用的快取（讓加到主畫面後沒網路也打得開）
// 做法：一律先上網抓最新的，抓到就順便存一份；沒網路才拿存著的。所以有網路時永遠是新版，不會卡在舊檔。
const CACHE = 'survsim';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match(req, { ignoreSearch: true })))
  );
});
