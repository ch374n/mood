import { getStore } from "@netlify/blobs";

/* The five moods the page knows about. Anything else is rejected. */
const MOODS = ["great", "calm", "flat", "low", "stormy"];

/* Who exists, and the secret that proves you are them.
   Names and keys come from Netlify environment variables. */
function people() {
  return [
    { id: "a", name: process.env.NAME_A || "Me",  key: process.env.KEY_A || "" },
    { id: "b", name: process.env.NAME_B || "Her", key: process.env.KEY_B || "" }
  ];
}

/* Constant-time compare, so the response time never leaks how much
   of a guessed key was correct. */
function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

export default async (req) => {
  const presented = req.headers.get("x-mood-key") || "";
  const me = people().find((p) => sameKey(p.key, presented));

  if (!me) {
    return json({ error: "unauthorized" }, 401);
  }

  const store = getStore("moods");

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    if (!MOODS.includes(body.mood)) {
      return json({ error: "unknown_mood" }, 400);
    }
    /* A key can only ever write its own slot — the person id is taken
       from the key, never from the request body. */
    await store.setJSON(me.id, { mood: body.mood, at: Date.now() });
  } else if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const records = await Promise.all(
    people().map(async (p) => {
      let rec = null;
      try {
        rec = await store.get(p.id, { type: "json" });
      } catch {
        rec = null;
      }
      return [p.id, { name: p.name, mood: rec?.mood ?? null, at: rec?.at ?? null }];
    })
  );

  return json({ you: me.id, people: Object.fromEntries(records) });
};

export const config = { path: "/api/mood" };
