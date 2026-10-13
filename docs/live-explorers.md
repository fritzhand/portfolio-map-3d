# Live explorers (optional)

Live explorers run in the classic walk world (`"walk": { "world": "classic" }` in `site/site.json`,
[configuration.md](./configuration.md#the-walk-world)); the campus does not have them yet.

With live explorers on, everyone walking your map's world at the same time sees everyone else:
a generated name ("Curious Manatee 42") and avatar over each explorer, moving in real time, with a
dot on the minimap. It runs on **Supabase Realtime** (presence and broadcast on one public channel;
no database tables) and is **off by default**.

## Turning it on

1. Create a Supabase project (the free plan allows 200 concurrent connections and 2 million
   messages a month). In **Realtime → Settings**, keep **"Allow public access"** on.
2. In `site/site.json`: `"live": { "enabled": true, "channel": "acme-walk" }`.
3. In your host's build environment, set `VITE_SUPABASE_URL` (`https://<project>.supabase.co`) and
   `VITE_SUPABASE_ANON_KEY` (the **publishable** key). The names the Vercel ↔ Supabase integration
   adds (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_*`) work too.
4. Redeploy.

Never use a secret / `service_role` key: the build refuses one under any of the names it reads,
and `scripts/check-bundle.mjs` fails the build if one reaches `dist/`. Only the URL, the
publishable key and the channel name reach the bundle.

## Channels

- Production deploys (`VERCEL_ENV=production`, or `LIVE_ENV=production` elsewhere) join
  `<channel>-v1`.
- Every other build (previews, local builds, CI) joins `<channel>-preview`, so testers never
  appear to real visitors.
- The dev server stays single-player unless the URL says `?live=supabase`; `?live=local` connects
  tabs of one browser to each other without Supabase; `?live=off` turns it off anywhere.

## What is shared, and what is trusted

Other explorers see the generated name, the avatar, where the explorer is and which area they are
in. The visitor id stored in the browser is never sent: each tab joins with a fresh random id. No
accounts; nothing is stored on a server.

The channel is public, so the client trusts nothing it receives: names that don't match the
generator's pattern show as "Explorer", moves faster than an explorer can run are held back until
confirmed, and when 60 explorers are shown, the one heard from least recently makes room. If the
service is unreachable the world falls back to single-player and says so.
