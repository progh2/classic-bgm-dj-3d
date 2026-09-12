/*
 * 무거운 3D 자료를 기기에 한 번만 받아 두기 위한 서비스 워커.
 *
 * GitHub Pages 는 응답 헤더를 정할 수 없어 브라우저 캐시가 10분이면 만료된다.
 * 집사 모델 7.6MB, 환경광 1.7MB, 결 5.4MB 를 방문할 때마다 다시 받게 되므로
 * Cache Storage 에 넣어 두고 거기서 꺼내 쓴다.
 *
 * 음악 음원은 캐시하지 않는다. 이 서비스는 음원을 보관하지 않는다는 원칙이
 * 있고, 원 출처에서 그때그때 받아 듣는 것이 그 원칙의 핵심이다.
 * 다른 출처(cross-origin)의 응답에는 손대지 않는다.
 */

const VERSION = 'v1'
const CACHE = `salon-assets-${VERSION}`

/** 이 경로 아래의 것만 오래 담아 둔다. */
const KEEP = ['/models/', '/hdri/', '/textures/', '/props/', '/audio/', '/assets/']

self.addEventListener('install', (event) => {
  // 새 버전이 준비되면 기다리지 않고 바로 넘겨받는다.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 다른 출처 — 음원 스트리밍이 여기 해당한다. 손대지 않는다.
  if (url.origin !== self.location.origin) return
  if (!KEEP.some((prefix) => url.pathname.includes(prefix))) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request)
      if (hit) return hit

      const response = await fetch(request)
      // 부분 응답(206)이나 오류는 담지 않는다. 담으면 다음에 깨진 것을 꺼내 쓴다.
      if (response.ok && response.status === 200) {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })(),
  )
})
