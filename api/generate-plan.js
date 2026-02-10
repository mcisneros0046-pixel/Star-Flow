import https from "https";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const body = JSON.stringify(req.body);

  const options = {
    hostname: "api.anthropic.com",
    port: 443,
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(body)
    }
  };

  const apiReq = https.request(options, function(apiRes) {
    let data = "";
    apiRes.on("data", function(chunk) { data += chunk; });
    apiRes.on("end", function() {
      try {
        res.status(apiRes.statusCode).json(JSON.parse(data));
      } catch (e) {
        res.status(500).json({ error: "Bad AI response" });
      }
    });
  });

  apiReq.on("error", function(err) {
    res.status(500).json({ error: err.message });
  });

  apiReq.write(body);
  apiReq.end();
}
