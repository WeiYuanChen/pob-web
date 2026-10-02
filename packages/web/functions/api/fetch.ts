interface Env {
  KV: KVNamespace;
}

interface FetchRequest {
  url: string;
  body?: string;
  headers: Record<string, string>;
}

function encodeQueryHash(rawUrl: string): string {
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex === -1) return rawUrl;
  const baseUrl = rawUrl.slice(0, queryIndex);
  const queryString = rawUrl.slice(queryIndex);
  return baseUrl + queryString.replace(/#/g, "%23");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const req: FetchRequest = await context.request.json();
  const targetUrl = encodeQueryHash(req.url);
  try {
    let r: Request;
    if (req.body) {
      r = new Request(targetUrl, {
        method: "POST",
        body: req.body,
        headers: Object.assign({}, req.headers, {
          // "User-Agent": "pob.cool",
        }),
      });
    } else {
      r = new Request(targetUrl, {
        method: "GET",
        headers: Object.assign({}, req.headers, {
          // "User-Agent": "pob.cool",
        }),
      });
    }
    const rep = await fetch(r);

    const headers: Record<string, string> = {};
    for (const [key, value] of rep.headers.entries()) {
      headers[key] = value;
    }

    return new Response(
      JSON.stringify({
        body: await rep.text(),
        headers,
        status: rep.status,
      }),
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        body: undefined,
        headers: {},
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
};
