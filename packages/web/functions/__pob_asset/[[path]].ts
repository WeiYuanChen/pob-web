export const onRequest: PagesFunction = async (context) => {
  const path = context.params.path;
  const pathStr = Array.isArray(path) ? path.join("/") : (path ?? "");
  const url = new URL(context.request.url);
  const targetUrl = `https://asset.pob.cool/${pathStr}${url.search}`;

  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set("Host", "asset.pob.cool");

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: requestHeaders,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
