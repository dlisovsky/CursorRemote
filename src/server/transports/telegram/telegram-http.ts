import https from 'node:https';

/** Node fetch() can fail to reach api.telegram.org on some macOS setups; IPv4 https works. */
export async function telegramFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  const parsed = new URL(url);
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  const body = init?.body != null ? String(init.body) : undefined;
  const timeoutMs = init?.timeoutMs ?? 30_000;

  const { status, responseBody } = await new Promise<{ status: number; responseBody: string }>((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        family: 4,
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, responseBody: data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    if (body) req.write(body);
    req.end();
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(responseBody) as unknown;
    },
  };
}
