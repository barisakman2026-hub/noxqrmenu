/* NOX — Netlify Deploy Proxy (Netlify Function, V1 handler)
   api.netlify.com tarayıcıdan gelen POST /deploys isteklerine bozuk CORS
   başlığı (cift Access-Control-Allow-Origin) dondurduğu icin, panel bu
   fonksiyon uzerinden ayni origin'de proxy'lenir. Fonksiyon sunucu tarafinda
   API'ye istek atar (sunucular arasi istekte CORS yoktur). */

export const handler = async (event) => {
  const auth = event.headers["authorization"] || "";
  if (!auth) return json(401, { error: "authorization eksik" });

  const base = "https://api.netlify.com/api/v1";
  try {
    if (event.httpMethod === "GET") {
      const r = await fetch(base + "/sites?filter=all&per_page=100", {
        headers: { Authorization: auth }
      });
      return { statusCode: r.status, body: await r.text() };
    }

    if (event.httpMethod === "POST") {
      const siteId = event.headers["x-nox-site"] || "";
      if (!siteId) return json(400, { error: "X-Nox-Site header eksik" });
      const body = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body || "", "utf8");
      const r = await fetch(base + "/sites/" + encodeURIComponent(siteId) + "/deploys", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/zip" },
        body
      });
      return { statusCode: r.status, body: await r.text() };
    }

    return json(405, { error: "metod desteklenmiyor" });
  } catch (e) {
    return json(502, { error: String(e) });
  }
};

function json(status, obj) {
  return { statusCode: status, body: JSON.stringify(obj) };
}