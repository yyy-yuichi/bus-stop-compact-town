const WALK_BASE = 'https://pub-64cdb45739c446ef86342de34ccd47a6.r2.dev/data/walk/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/data/walk/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      const filename = url.pathname.slice('/data/walk/'.length);
      if (!/^-?\d+(?:\.\d+)?_-?\d+(?:\.\d+)?\.json$/.test(filename)) return new Response('Not found', { status: 404 });
      try {
        // Fetch only public catchments; never forward visitor cookies or auth headers.
        const upstream = await fetch(WALK_BASE + filename, { method: request.method, redirect: 'manual' });
        if (!upstream.ok) {
          console.error('Walking proxy upstream status', upstream.status);
          return new Response('Walking data unavailable', { status: upstream.status === 404 ? 404 : 502 });
        }
        return new Response(upstream.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
      } catch (error) {
        console.error('Walking proxy request failed', error instanceof Error ? error.message : 'Unknown fetch error');
        return new Response('Walking data unavailable', { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
