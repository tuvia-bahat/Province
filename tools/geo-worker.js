// Cloudflare Worker: returns the visitor's rough location (country / city / lat / lng) from Cloudflare's own data.
// Nothing is stored here. Deploy it in the Cloudflare dashboard (Workers & Pages -> Create -> Hello World -> paste -> Deploy).
const ALLOWED = ['https://province-game.com', 'https://www.province-game.com', 'http://localhost:8765'];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cf = request.cf || {};
    const body = JSON.stringify({
      country: cf.country || null,
      city: cf.city || null,
      lat: cf.latitude != null ? Number(cf.latitude) : null,
      lng: cf.longitude != null ? Number(cf.longitude) : null,
    });
    return new Response(body, {
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
        'vary': 'Origin',
        'cache-control': 'no-store',
      },
    });
  },
};
