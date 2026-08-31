// ═══════════════════════════════════════════════════
//  ارتقاء — Service Worker (PWA)
//  Cache Strategy: Stale-While-Revalidate + Network-first للـ API
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'irtiqaa-v1';
const STATIC_CACHE = 'irtiqaa-static-v1';
const DYNAMIC_CACHE = 'irtiqaa-dynamic-v1';

// الملفات الأساسية التي تُخزَّن عند التثبيت
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './404.html',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Tajawal:wght@300;400;500;700;800&display=swap',
  'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj5nl7CCqQ-4HI6rT_ed-XnI5XWXXbRzmBLiPM8axh0vQbcXEB45ALFiPEvtU57a-dzBAeBKT2ARZJmigzXBYNgVG-Q0y_oXFp78Quwo561IksZxYkH_kZ5CPiCDcnOXo3Fh_U2ueMnTw3gv5vfgIPnJ8XXMCRBHwcfLpxJJr5O01w_b24wpT7JqTdteaJi/s845/333087.png'
];

// ══════ التثبيت: تخزين الملفات الأساسية ══════
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install failed:', err))
  );
});

// ══════ التنشيط: حذف الكاشات القديمة ══════
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ══════ الاستراتيجيات حسب نوع الطلب ══════
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) تجاوز طلبات Google Forms — لا تكاش أبدًا
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com/forms')) return;

  // 2) تجاوز طلبات analytics / tracking
  if (url.hostname.includes('google-analytics') || url.hostname.includes('gtag')) return;

  // 3) HTML (صفحات الموقع): Network-first + fallback للكاش
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./404.html')))
    );
    return;
  }

  // 4) الصور والخطوط الخارجية: Stale-While-Revalidate
  if (request.destination === 'image' || url.hostname.includes('fonts.gstatic') || url.hostname.includes('blogger.googleusercontent')) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request)
            .then(response => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 5) باقي الأصول (CSS/JS داخل الموقع): Cache-first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => new Response('Offline', { status: 503 }))
    )
  );
});

// ══════ رسائل من الصفحة (مثلاً: مسح الكاش) ══════
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
