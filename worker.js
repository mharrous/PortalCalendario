const APP_CODE = "calendario-eventos";
const SESSION_COOKIE = "portal_calendario_session";
const SESSION_SECONDS = 180 * 24 * 60 * 60;
const DEFAULT_PORTAL_ORIGIN = "https://portal.camaraceuta.workers.dev";
const DEFAULT_EMBED_PARENT_ORIGIN = "https://portal-jornadas.pages.dev";
const DEFAULT_SUPABASE_URL = "https://oqeyynrgustgotpcoewh.supabase.co";
const DEFAULT_EMBED_VIEWER_EMAIL = "[REDACTED]";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/auth/portal" && request.method === "GET") return portalCallback(request, env);
      if (url.pathname === "/api/auth/session" && request.method === "GET") return sessionStatus(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/embed/data" && request.method === "GET") return embeddedData(request, env);
      if (url.pathname.startsWith("/api/")) return json({ error: "Ruta no encontrada" }, 404);

      if (request.method === "GET" && acceptsHtml(request)) {
        if (url.searchParams.get("auth_error")) return assetResponse(request, env);
        const session = await authorizedSession(request, env);
        if (!session) {
          const loginUrl = url.searchParams.get("embed") === "1"
            ? `${embedParentOrigin(env)}/api/calendar/launch`
            : `${portalOrigin(env)}/api/apps/${APP_CODE}/launch`;
          return redirect(loginUrl);
        }
      }
      return assetResponse(request, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "calendar_worker_error", message: error instanceof Error ? error.message : String(error) }));
      return json({ error: "Error interno" }, 500);
    }
  },
};

async function portalCallback(request, env) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "");
  const embedded = url.searchParams.get("embed") === "1";
  if (!code) return redirect(embedded ? "/?auth_error=access_denied&embed=1" : "/?auth_error=access_denied");
  const response = await portalRequest(env, "/api/sso/calendario/exchange", { code });
  if (!response.ok) return redirect(embedded ? "/?auth_error=access_denied&embed=1" : "/?auth_error=access_denied");
  const result = await response.json();
  const token = await createSessionToken(result.user, env, embedded);
  return redirect(embedded ? "/?embed=1" : "/", {
    "set-cookie": sessionCookie(token, SESSION_SECONDS, embedded),
    "referrer-policy": "no-referrer",
  });
}

async function sessionStatus(request, env) {
  const session = await authorizedSession(request, env);
  if (!session) return json({ error: "Acceso no autorizado" }, 401);
  return json({ user: session.user });
}

async function logout(request, env) {
  if (!sameOrigin(request)) return json({ error: "Origen no permitido" }, 403);
  const token = cookies(request)[SESSION_COOKIE];
  const session = await verifySessionToken(token, env);
  return json(
    { ok: true, logoutUrl: `${portalOrigin(env)}/logout` },
    200,
    { "set-cookie": sessionCookie("", 0, Boolean(session?.embedded)) },
  );
}

async function embeddedData(request, env) {
  const session = await authorizedSession(request, env);
  if (!session?.embedded) return json({ error: "Acceso incrustado no autorizado" }, 403);

  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!serviceKey) return json({ error: "La vista de calendario no está configurada" }, 503);

  const [profiles, reservations, departments] = await Promise.all([
    fetchSupabaseRows(env, serviceKey, "profiles", "select=*&order=nombre.asc&limit=500"),
    fetchSupabaseRows(env, serviceKey, "reservas", "select=*&order=starts_at.asc&limit=5000"),
    fetchSupabaseRows(env, serviceKey, "departamentos", "select=*&order=nombre.asc&limit=200"),
  ]);

  const viewerEmail = String(env.EMBED_VIEWER_EMAIL || DEFAULT_EMBED_VIEWER_EMAIL).trim().toLowerCase();
  const viewer = profiles.find((profile) => String(profile.email || "").trim().toLowerCase() === viewerEmail);
  if (!viewer || viewer.activo === false) return json({ error: "El perfil de consulta de Usuario de consulta no está disponible" }, 503);

  return json({
    viewer: { ...viewer, rol: "consulta" },
    profiles,
    reservations,
    departments,
  }, 200, { "cache-control": "no-store" });
}

async function fetchSupabaseRows(env, serviceKey, table, query) {
  const response = await fetch(`${supabaseOrigin(env)}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceKey,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: "calendar_embed_data_error", table, status: response.status }));
    throw new Error(`No se pudo consultar ${table}`);
  }
  const result = await response.json();
  return Array.isArray(result) ? result : [];
}

async function authorizedSession(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  const session = await verifySessionToken(token, env);
  if (!session) return null;
  const response = await portalRequest(env, "/api/sso/calendario/introspect", { userId: session.user.id });
  if (!response.ok) return null;
  const result = await response.json();
  return result.active && result.user ? { ...session, user: result.user } : null;
}

async function portalRequest(env, pathname, payload) {
  const secret = String(env.PORTAL_SSO_SECRET || "");
  if (!secret) return new Response(null, { status: 503 });
  return fetch(`${portalOrigin(env)}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function createSessionToken(user, env, embedded = false) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
    user: {
      id: Number(user.id),
      displayName: String(user.displayName || user.email || "Usuario"),
      email: String(user.email || ""),
      role: String(user.role || "user"),
    },
    embedded,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })));
  return `${payload}.${await sign(payload, env)}`;
}

async function verifySessionToken(token, env) {
  if (!token || !String(env.PORTAL_SSO_SECRET || "")) return null;
  const [payload, signature, extra] = String(token).split(".");
  if (!payload || !signature || extra) return null;
  const expected = await sign(payload, env);
  if (!secureEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!parsed?.user?.id || Number(parsed.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function sign(payload, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(env.PORTAL_SSO_SECRET || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function secureEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function cookies(request) {
  const result = {};
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function sessionCookie(value, maxAge, embedded = false) {
  const crossSiteAttributes = embedded ? "; SameSite=None; Partitioned" : "; SameSite=Lax";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure${crossSiteAttributes}`;
}

function toBase64Url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function acceptsHtml(request) {
  return String(request.headers.get("accept") || "").includes("text/html");
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function portalOrigin(env) {
  return String(env.PORTAL_ORIGIN || DEFAULT_PORTAL_ORIGIN).replace(/\/$/, "");
}

function embedParentOrigin(env) {
  return String(env.EMBED_PARENT_ORIGIN || DEFAULT_EMBED_PARENT_ORIGIN).replace(/\/$/, "");
}

function supabaseOrigin(env) {
  return String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...headers } });
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

async function assetResponse(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  headers.delete("x-frame-options");
  headers.set("content-security-policy", `frame-ancestors 'self' ${embedParentOrigin(env)}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
