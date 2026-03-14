/**
 * Poll endpoint — local OpenClaw Gateway polls this to retrieve QQ messages
 *
 * GET /api/poll?token=RELAY_TOKEN
 *
 * Returns pending messages from Vercel KV and deletes them after retrieval.
 * The Gateway calls this endpoint periodically (e.g. every 2 seconds).
 *
 * Required env vars:
 *   RELAY_TOKEN — shared secret between this relay and the local Gateway
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@vercel/kv";

function getKV() {
  return createClient({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const relayToken = process.env.RELAY_TOKEN;
  const token = (req.query.token as string) ?? req.headers.authorization?.replace("Bearer ", "");

  if (!relayToken || token !== relayToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const kv = getKV();

    // Pop all pending message IDs from the queue
    const queueLen = await kv.llen("qq:queue");
    if (queueLen === 0) {
      return res.status(200).json({ messages: [] });
    }

    // Get all message IDs
    const msgIds = await kv.lrange("qq:queue", 0, -1);

    // Fetch all messages
    const messages: unknown[] = [];
    for (const id of msgIds) {
      const msg = await kv.get(id as string);
      if (msg) {
        messages.push(msg);
        // Delete the message after retrieval
        await kv.del(id as string);
      }
    }

    // Clear the queue
    await kv.del("qq:queue");

    return res.status(200).json({ messages });
  } catch (err) {
    console.error("Poll error:", err);
    return res.status(500).json({ error: "Failed to poll messages" });
  }
}
