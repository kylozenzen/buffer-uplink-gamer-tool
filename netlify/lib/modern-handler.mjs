// Keep the business logic testable while using Netlify's modern request context,
// which supplies the strongly consistent Blobs connection automatically.
export async function handle(request, handler) {
  const url = new URL(request.url);
  const result = await handler({
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text(),
  });
  const headers = new Headers(result.headers);
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) for (const value of values) headers.append(name, value);
  return new Response(result.body, { status: result.statusCode, headers });
}
