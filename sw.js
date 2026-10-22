/* Sierra.ev brochure: keeps everything on the phone so it opens offline after the first visit */
const CACHE = 'sierra-ev-brochure-v10';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FILMS = ['./hero.mp4', './design.mp4', './interior.mp4', './summon.mp4', './autopark.mp4', './slope.mp4'];
// store the page first, then each film on its own (one slow or failed film never blocks the rest)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    for (const f of FILMS) { try { if (!(await c.match(f))) await c.add(f); } catch (err) {} }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// videos are requested in pieces (Range requests); answer them from the stored copy so playback works offline, Safari included
async function rangeFrom(cached, range) {
  const buf = await cached.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range || '') || [];
  let start = m[1] ? parseInt(m[1], 10) : 0, end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // the page itself: try the internet first (so updates show up), fall back to the stored copy when offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { const res = await fetch(req); if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); } return res; }
      catch (err) { return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error(); }
    })());
    return;
  }
  const range = req.headers.get('range');
  e.respondWith((async () => {
    const hit = await caches.match(req.url, { ignoreSearch: true });
    if (hit) return range ? rangeFrom(hit, range) : hit;
    try {
      const res = await fetch(req);
      if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.url, copy)); }
      return res;
    } catch (err) { return Response.error(); }
  })());
});
