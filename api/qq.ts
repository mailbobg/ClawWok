/**
 * QQ Bot Webhook Receiver → Vercel KV
 *
 * Receives webhook POST from QQ Open Platform, validates the signature,
 * stores the message in Vercel KV for the local Gateway to poll via /api/poll.
 *
 * Required env vars:
 *   QQ_BOT_SECRET  — QQ bot AppSecret (used for signature verification)
 *   RELAY_TOKEN    — shared token between this relay and the local Gateway
 *
 * Deploy: Vercel serverless function (user deploys to their own Vercel account)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@vercel/kv";
import { createHmac } from "crypto";

const KV_PREFIX = "qq:msg:";
const MAX_MESSAGES = 200;

function getKV() {
  return createClient({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

/**
 * QQ webhook signature verification
 * QQ signs payloads with Ed25519, but for the HTTP callback validation flow
 * the platform first sends a "challenge" request that must be answered.
 */
function verifySignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const payload = timestamp + body;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.QQ_BOT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "QQ_BOT_SECRET not configured" });
  }

  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // ── Handle QQ validation challenge ──
  // QQ sends { "d": { "plain_token": "...", "event_ts": "..." }, "op": 13 }
  if (parsed.op === 13) {
    const plainToken = parsed.d?.plain_token ?? "";
    const eventTs = parsed.d?.event_ts ?? "";
    const hmac = createHmac("sha256", secret)
      .update(eventTs + plainToken)
      .digest("hex");
    return res.status(200).json({
      plain_token: plainToken,
      signature: hmac,
    });
  }

  // ── Signature verification for normal messages ──
  const timestamp = (req.headers["x-signature-timestamp"] as string) ?? "";
  const signature = (req.headers["x-signature-ed25519"] as string) ?? "";

  if (timestamp && signature) {
    if (!verifySignature(body, timestamp, signature, secret)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // ── Store message in KV ──
  try {
    const kv = getKV();
    const msgId = `${KV_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await kv.set(msgId, {
      payload: parsed,
      received_at: new Date().toISOString(),
    }, { ex: 3600 }); // expire after 1 hour

    // Append to the message queue list
    await kv.lpush("qq:queue", msgId);
    // Trim to keep bounded
    await kv.ltrim("qq:queue", 0, MAX_MESSAGES - 1);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("KV write error:", err);
    return res.status(500).json({ error: "Failed to store message" });
  }
}
