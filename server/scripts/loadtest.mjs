const url = process.argv[2] || 'http://127.0.0.1:4000/api/health';
const total = Number(process.argv[3] || 100);
const concurrency = Number(process.argv[4] || 20);

async function run() {
  let next = 0;
  let ok = 0;
  let failed = 0;
  const latencies = [];
  const started = performance.now();

  async function worker() {
    while (next < total) {
      const current = next;
      next += 1;
      if (current >= total) return;
      const t0 = performance.now();
      try {
        const response = await fetch(url);
        if (response.ok) ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      latencies.push(performance.now() - t0);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  latencies.sort((a, b) => a - b);
  const elapsed = (performance.now() - started) / 1000;
  const p = (ratio) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * ratio))] ?? 0;
  console.log(
    JSON.stringify(
      {
        url,
        total,
        concurrency,
        ok,
        failed,
        seconds: Number(elapsed.toFixed(2)),
        requestsPerSecond: Number((total / elapsed).toFixed(1)),
        latencyMs: {
          p50: Number(p(0.5).toFixed(1)),
          p95: Number(p(0.95).toFixed(1)),
          max: Number((latencies[latencies.length - 1] ?? 0).toFixed(1)),
        },
      },
      null,
      2,
    ),
  );
  if (failed) process.exitCode = 1;
}

run();
