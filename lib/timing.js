// lib/timing.js

export function withRouteTiming(routeName, handler) {
  return async function timedHandler(req, res) {
    const startNs = (typeof process !== 'undefined' && process.hrtime && process.hrtime.bigint)
      ? process.hrtime.bigint()
      : null;
    const startMs = startNs ? null : Date.now();
    let statusCode = 200;
    try {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        statusCode = res.statusCode || 200;
        return originalJson(body);
      };
      return await handler(req, res);
    } finally {
      const endNs = startNs ? process.hrtime.bigint() : null;
      const durationMs = startNs ? Number(endNs - startNs) / 1e6 : (Date.now() - startMs);
      const slowMs = Number.parseInt(process.env.API_SLOW_MS || '1000', 10);
      try {
        const msg = `[route] ${routeName} ${durationMs.toFixed(1)}ms · ${statusCode}`;
        // eslint-disable-next-line no-console
        if (Number.isFinite(durationMs) && durationMs >= slowMs) console.warn(msg);
        else console.log(msg);
      } catch {}
    }
  }
}


