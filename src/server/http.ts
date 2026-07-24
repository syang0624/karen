export function assertSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new Error("Cross-site request rejected");
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  if (new URL(origin).host !== requestUrl.host) {
    throw new Error("Request origin does not match");
  }
}

export function json(
  body: unknown,
  init: ResponseInit & { setCookie?: string | null } = {}
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-store");
  if (init.setCookie) headers.append("set-cookie", init.setCookie);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(error: unknown, fallbackStatus = 400) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status =
    message === "Case not found"
      ? 404
      : message.includes("not belong")
        ? 403
        : fallbackStatus;
  return json({ error: message }, { status });
}
