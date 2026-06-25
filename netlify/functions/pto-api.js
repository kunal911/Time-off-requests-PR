const crypto = require("crypto");

const SESSION_HOURS = 8;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action, payload = {} } = body;

    if (action === "login") {
      return handleLogin(payload);
    }

    const session = readSession(event.headers.authorization || event.headers.Authorization || "");
    if (!session) {
      return response(401, { ok: false, error: "Please sign in again." });
    }

    const backendResult = await callAppsScript(action, payload);
    return response(200, backendResult);
  } catch (error) {
    return response(500, { ok: false, error: error.message || "Dashboard request failed." });
  }
};

function handleLogin(payload) {
  const expectedPassword = process.env.PTO_DASHBOARD_PASSWORD;
  const sessionSecret = process.env.PTO_SESSION_SECRET;

  if (!expectedPassword || !sessionSecret) {
    return response(500, { ok: false, error: "Dashboard auth is not configured in Netlify." });
  }

  if (!payload.password || payload.password !== expectedPassword) {
    return response(401, { ok: false, error: "Incorrect dashboard password." });
  }

  return response(200, {
    ok: true,
    sessionToken: createSessionToken(sessionSecret),
  });
}

async function callAppsScript(action, payload) {
  const backendUrl = process.env.PTO_BACKEND_URL;
  const apiToken = process.env.PTO_API_TOKEN;

  if (!backendUrl || !apiToken) {
    throw new Error("PTO backend is not configured in Netlify.");
  }

  const upstream = await fetch(backendUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: apiToken, action, payload }),
  });

  const text = await upstream.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Google Apps Script returned an unreadable response.");
  }

  if (!upstream.ok || result.ok === false) {
    throw new Error(result.error || "Google Apps Script request failed.");
  }

  return result;
}

function createSessionToken(secret) {
  const payload = {
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function readSession(header) {
  const token = header.replace(/^Bearer\s+/i, "");
  const secret = process.env.PTO_SESSION_SECRET;
  if (!token || !secret || !token.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  if (signature !== sign(encodedPayload, secret)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
