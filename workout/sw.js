const CACHE_PREFIX='workout-note-pwa-';
const CACHE=CACHE_PREFIX+'v6';
const CORE=['./','./index.html','./manifest.webmanifest','../icons/icon-192.png','../icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  const scopePath=new URL(self.registration.scope).pathname;
  const isApp=u.pathname.startsWith(scopePath);
  const isIcon=u.pathname==='/icons/icon-192.png'||u.pathname==='/icons/icon-512.png';
  if(!isApp&&!isIcon)return;

  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(r=>{
        const c=r.clone();
        caches.open(CACHE).then(x=>x.put('./index.html',c));
        return r;
      }).catch(()=>caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      const c=r.clone();
      caches.open(CACHE).then(x=>x.put(e.request,c));
      return r;
    }))
  );
});
