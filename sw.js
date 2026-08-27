// sw.js – 介護福祉士国家試験対策アプリ
// 方式：ネットワーク優先（オンラインなら常に最新版を取得し、失敗時のみキャッシュを使用）

const CACHE_NAME = 'kaigo-vf-v15';

// 最初から保存しておくファイル
const ASSETS = [
  './',
  './index.html',
  './flashcard.html',
  './gift-logo.png',
  './muneishi-icon.png',
  './manifest.json',
  './exam/index.html',
  './exam/style.css',
  './exam/app.js',
  './exam/storage.js',
  './exam/theme.js',
  './exam/glossary.js',
  './exam/report.js',
  './exam/trend.js',


  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700;900&family=Noto+Sans+Thai:wght@400;700&family=Noto+Sans:wght@400;700&family=Poppins:wght@600;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.min.js'
];

/* =====================================================
 *  インストール
 *  1つでも取得に失敗すると全体が失敗するため、個別に処理する
 * ===================================================== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.warn('キャッシュに追加できませんでした: ' + url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

/* =====================================================
 *  有効化：古いキャッシュを削除
 * ===================================================== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* =====================================================
 *  通信の処理
 * ===================================================== */
self.addEventListener('fetch', event => {
  const req = event.request;

  // GET以外（質問送信などのPOST）はキャッシュを介さず素通しする
  if (req.method !== 'GET') return;

  // Google Apps Script への送信はキャッシュしない
  if (req.url.indexOf('script.google.com') !== -1) return;

  // 別タブへの遷移など、通常のページ遷移以外は扱わない
  if (req.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    fetch(req)
      .then(response => {
        // 正常に取得できたものだけ保存する
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, clone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // オフライン時：キャッシュを探す
        return caches.match(req).then(cached => {
          if (cached) return cached;

          // ページを開こうとして見つからない場合は案内を表示する
          if (req.mode === 'navigate') {
            return new Response(
              '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>オフライン</title></head>' +
              '<body style="margin:0;display:flex;justify-content:center;align-items:center;' +
              'min-height:100vh;background:#0F0C29;color:#fff;font-family:sans-serif;' +
              'text-align:center;padding:24px;box-sizing:border-box;">' +
              '<div><div style="font-size:3rem;margin-bottom:16px;">📡</div>' +
              '<div style="font-size:1.1rem;font-weight:700;margin-bottom:10px;">' +
              'インターネットに接続していません</div>' +
              '<div style="font-size:.9rem;opacity:.7;line-height:1.8;">' +
              '電波の良い場所で、もう一度お試しください。<br>' +
              '一度開いたページは、オフラインでも利用できます。</div></div>' +
              '</body></html>',
              { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
            );
          }

          // それ以外（画像やデータなど）は空の応答を返す
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
