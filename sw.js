/* 考研工作台 Service Worker：缓存静态资源，支持离线使用 */
'use strict';
const CACHE = 'kaoyan-workbench-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/core.js',
  './js/pomodoro.js',
  './js/vocab.js',
  './js/ui.js',
  './js/data/syllabus_math.js',
  './js/data/syllabus_english.js',
  './js/data/syllabus_politics.js',
  './js/data/vocab1.js',
  './js/data/vocab2.js',
  './js/data/vocab3.js',
  './js/data/vocab4.js',
  './js/data/quotes.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 数据 API 不缓存（api/load、api/save、LeanCloud）
  if(url.pathname.indexOf('/api/') >= 0 || url.hostname.indexOf('lncld') >= 0) return;
  // 只处理同源 GET
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if(res && res.ok){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
