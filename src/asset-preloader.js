const DEFAULT_CONCURRENCY = 4;

export function startAssetPreload({
  urls,
  cacheName,
  concurrency = DEFAULT_CONCURRENCY,
  onProgress = () => {},
  onError = () => {},
  onComplete = () => {},
} = {}) {
  const assetUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!assetUrls.length) {
    onComplete({ total: 0, completed: 0, failed: 0 });
    return Promise.resolve({ total: 0, completed: 0, failed: 0 });
  }

  const total = assetUrls.length;
  const state = { total, completed: 0, failed: 0 };
  const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_CONCURRENCY, total));
  let nextIndex = 0;

  const reportProgress = () => onProgress({ ...state });

  async function preloadOne(url, cache) {
    const request = new Request(url, { cache: "force-cache" });
    if (cache) {
      const cached = await cache.match(request);
      if (cached) return;
    }

    const response = await fetch(request);
    if (!response.ok) {
      throw new Error(`Preload failed for ${url}: ${response.status}`);
    }

    if (cache) {
      await cache.put(request, response.clone());
    }
  }

  async function createCache() {
    if (!("caches" in window) || !cacheName) return null;
    try {
      return await caches.open(cacheName);
    } catch (error) {
      onError(error, { cacheName });
      return null;
    }
  }

  return createCache()
    .then(async (cache) => {
      async function worker() {
        while (nextIndex < total) {
          const url = assetUrls[nextIndex++];
          try {
            await preloadOne(url, cache);
          } catch (error) {
            state.failed += 1;
            onError(error, { url });
          } finally {
            state.completed += 1;
            reportProgress();
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      const result = { ...state };
      onComplete(result);
      return result;
    });
}