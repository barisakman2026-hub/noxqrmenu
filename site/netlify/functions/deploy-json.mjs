export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const AUTH = context.headers.get("x-api-key") || "";
  const SITE_ID = context.env.SITE_ID || "08915c59-d86c-4e8d-9633-45bbadcdd580";
  const NL_TOKEN = context.env.NETLIFY_AUTH_TOKEN || "";

  if (!NL_TOKEN) {
    return new Response(JSON.stringify({ error: "NETLIFY_AUTH_TOKEN env missing" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const files = body.files;
  if (!files || typeof files !== "object") {
    return new Response(JSON.stringify({ error: "files object required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const headers = {
    Authorization: `Bearer ${NL_TOKEN}`,
    "Content-Type": "application/json",
  };

  const payload = {
    files: {},
    branch: "main",
    message: "NOX admin panel guncelleme",
  };

  for (const [path, content] of Object.entries(files)) {
    payload.files[path] = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  }

  try {
    const resp = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data.message || `HTTP ${resp.status}` }), { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, deploy_id: data.id, state: data.state, url: data.ssl_url || data.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const config = {
  path: "/.netlify/functions/deploy-json",
  method: "POST",
};
