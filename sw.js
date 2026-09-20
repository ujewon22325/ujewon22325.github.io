const CACHE_PREFIX='workout-note-pwa-';
const CACHE=CACHE_PREFIX+'v4';
const CORE=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];

function isWorkoutRequest(request){
  const u=new URL(request.url);
  if(u.origin!==self.location.origin)return false;
  return u.pathname==='/' ||
    u.pathname==='/index.html' ||
    u.pathname==='/manifest.webmanifest' ||
    u.pathname==='/icons/icon-192.png' ||
    u.pathname==='/icons/icon-512.png';
}

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys
        .filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE)
        .map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!isWorkoutRequest(e.request))return;

  const u=new URL(e.request.url);
  if(e.request.mode==='navigate'||u.pathname==='/'||u.pathname==='/index.html'){
    e.respondWith(
      fetch(e.request)
        .then(r=>{
          const c=r.clone();
          caches.open(CACHE).then(x=>x.put('./index.html',c));
          return r;
        })
        .catch(()=>caches.match('./index.html'))
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
