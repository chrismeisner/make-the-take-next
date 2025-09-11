/* eslint-disable no-console */
// scripts/perf-smoke.js
// Simple local smoke to hit a few endpoints and report timing stats.

const http = require('node:http');

function timeFetch(path, timeoutMs = 20000) {
  const url = `http://localhost:${process.env.PORT || 3001}${path}`;
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: true, ms: Date.now() - start, status: res.statusCode, path }));
    });
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error('timeout')); } catch {}
      resolve({ ok: false, ms: Date.now() - start, status: 0, path, error: 'timeout' });
    });
    req.on('error', (e) => resolve({ ok: false, ms: Date.now() - start, status: 0, path, error: e.message }));
  });
}

async function main() {
  const tests = [
    '/api/items',
    '/api/packs',
  ];
  const results = [];
  for (const p of tests) {
    const r = await timeFetch(p);
    results.push(r);
  }
  const fmt = (n) => `${n.toFixed(0)}ms`;
  const slow = results.filter(r => r.ms >= 1000);
  console.log('\nPerf smoke results:');
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.path} ${fmt(r.ms)} status=${r.status}${r.error ? ' ' + r.error : ''}`));
  if (slow.length) {
    console.warn('\nSlow endpoints (>=1000ms):');
    slow.forEach(r => console.warn(`- ${r.path} ${fmt(r.ms)}`));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


