# Real-time sync options for the shared Queue

Research for issue #4 (map: #1). Fetched 2026-10-30 from first-party docs. Items marked **[unverified]** could not be read from the primary source and need a check before they drive a decision. Items marked **[inference]** are my reasoning, not a sourced claim.

## Question

Realistic options for near-real-time Queue updates on web (Next.js) and React Native/Expo. Compare fit, cost at small scale and operational burden for a solo developer on Google Cloud.

## Load profile (assumption, not sourced)

[inference] A Group is a handful of Members, with a few Queue edits per day. Fan-out per change is tiny (about 2 to 10 subscribers), so every option below is far inside its limits. The deciding factors are operational burden, how Position ordering is stored, and fit with Expo, not throughput.

## Options

### 1. Firestore realtime listeners (Firebase)

- `onSnapshot()` fires immediately with current data, then on every change. Own writes appear instantly via "latency compensation". [Firestore listen docs](https://firebase.google.com/docs/firestore/query-data/listen)
- Expo: the Firebase JS SDK, including `firebase/firestore`, works in Expo Go with no plugins (requires `firebase@12.0.0` or later). React Native Firebase needs a dev build and is not needed for Firestore. [Expo Firebase guide](https://docs.expo.dev/guides/using-firebase/)
- Free quota (Standard edition): 1 GiB stored, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day. [Firestore pricing (Firebase)](https://firebase.google.com/docs/firestore/pricing)
- Listener billing: one read per document added or updated in the result set, none for deletes. A listener disconnected for over 30 minutes (persistence on), or on every reconnect (persistence off), is billed as a fresh query. Security-rule evaluation is also charged on listener start and reconnect. [same page]
- Paid per-operation rates: the Firebase page defers to the Google Cloud page, which I could not read. **[unverified]**
- Burden: no server to run for sync, and it is Google Cloud native. The cost is that the Queue lives in Firestore (a document store, not Postgres). [inference] Manual Position needs fractional or lexicographic ordering keys, and authorization is written in Firestore security rules.
- Offline writes come with the SDK, which would relax the v1 offline constraint. The listen page did not cover offline behaviour, so check the separate offline guide. **[unverified]**

### 2. Supabase (Postgres + Realtime)

- Realtime offers Broadcast, Presence and Postgres Changes. [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- Plans: Free $0, Pro from $25/month. Free includes 200 concurrent Realtime connections and 2M messages/month. Pro includes 500 connections and 5M messages, then $10 per 1,000 connections and $2.50 per million messages. Free projects pause after 1 week of inactivity. [Supabase pricing](https://supabase.com/pricing)
- Limits: Free 200 connections and 100 msgs/s. Pro 500 connections and 500 msgs/s. [Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- Postgres Changes caveats: each event is authorized per subscriber, changes are processed on a single thread, RLS is not applied to DELETE, and DELETE filtering needs replica identity full. Supabase recommends Broadcast beyond about 3,000 concurrent subscribers on the same changes. [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- React Native/Expo support is not stated on the pages read. **[unverified]**
- Burden: low, because it is managed. It is not on Google Cloud, so there is a second vendor and a second bill. Free-tier pausing is unsuitable for production, so realistically Pro at $25/month, about half the $50 budget. [inference]
- Fit: relational Queue in Postgres, matching the builder's experience. Supabase would also supply auth, which touches other map tickets. [inference]

### 3. Self-hosted push (WebSocket or SSE) on Cloud Run, fed by the database

Transport:
- Cloud Run supports WebSockets with no extra configuration. A WebSocket counts as an HTTP request, so the request timeout applies (default 5 minutes, maximum 60 minutes) and clients are disconnected at the limit and must reconnect. SSE is not mentioned on that page. [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)
- Session affinity is best-effort. Instances share no state, so fan-out across instances needs an external store or message system (the page suggests Redis Pub/Sub via Memorystore or Firestore). An instance with an open connection is billed as active (instance-based billing). [same page]
- Cloud Run rates and free tier: page unreadable. **[unverified]** Cloud SQL pricing: page unreadable. **[unverified]**
- Next.js self-hosting: streaming works with `next start` if proxies do not buffer (for example nginx needs `X-Accel-Buffering: no`). [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) [inference] Long-lived connections fit a separate small Node service better than serverless Next.js route handlers.
- Client: React Native has the `WebSocket` API. [RN networking](https://reactnative.dev/docs/network) `expo/fetch` supports streaming responses (example with `Accept: text/event-stream`), but SSE event parsing is manual. [Expo SDK docs](https://docs.expo.dev/versions/latest/sdk/expo/) `EventSource` is not documented in RN. [RN networking]

Change source, pick one:
- **Postgres LISTEN/NOTIFY**: payload under 8000 bytes, delivered only after commit, in commit order, per session on the channel. The pending queue is 8GB; if it fills, `NOTIFY` transactions fail at commit; a long-running transaction in a listener blocks cleanup. The page does not discuss poolers or offline listeners. [PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) [inference] Listener sessions need a direct (not transaction-pooled) connection, and notifications missed during a reconnect mean the client must refetch the Queue on (re)connect. If all writes go through your own API, you can skip the database signal and publish after the write.
- **MongoDB change streams**: only on replica sets and sharded clusters, read from the oplog, resumable via resume tokens, and each open stream holds a connection. Availability on Atlas free/shared tiers is not stated on the page. **[unverified]** [MongoDB change streams](https://www.mongodb.com/docs/manual/changeStreams/)

Burden: highest. You own reconnects, socket auth, multi-instance fan-out and a stateful always-on service. [inference] Cost is mostly the always-billed Cloud Run instance plus the database.

### 4. Managed pub/sub as a "something changed" signal (Ably, Pusher)

- Ably free plan: 6M messages/month, 200 concurrent connections, 200 concurrent channels. First paid tier $29/month plus usage. [Ably pricing](https://ably.com/pricing)
- Pusher Channels sandbox: 200k messages/day, 100 concurrent connections. Cheapest paid plan $49/month. [Pusher pricing](https://pusher.com/channels/pricing/) (page read only to character 100000 of about 104,000.)
- [inference] Pattern: the API writes to your own DB (Postgres or Mongo), then publishes a small event on a per-Group channel. Clients refetch or patch the Queue. This keeps your data store free and removes the socket servers, at the price of another vendor. SDK support for React Native was not checked. **[unverified]**

### 5. Baseline: polling or refetch-on-focus [inference, no source]

For a handful of users, polling every few seconds plus refetch on app focus may meet "near-real-time while online". Keep it as the fallback and as a first implementation behind a stable interface.

## Comparison

| Option | Fit with Expo and web | Cost at small scale | Operational burden | Data store implication |
|---|---|---|---|---|
| Firestore listeners | Strong (JS SDK works in Expo Go) | Likely inside free quota; paid rates unverified | Lowest, GCP native | Firestore replaces Postgres/Mongo; ordering keys needed |
| Supabase Realtime | Likely good, RN unverified | $0 with pausing, realistically $25/month | Low (managed, off GCP) | Postgres |
| Self-hosted WS/SSE on Cloud Run | Fine (WebSocket native in RN) | Always-on instance plus DB; unverified | Highest | Postgres or Mongo (replica set) |
| Ably/Pusher signal | RN unverified | Free tiers cover it; $29 to $49 next | Low to medium | Any |
| Polling | Trivial | None | Minimal | Any |

## Findings that constrain other tickets

- Real-time and data-store choice are coupled for Firestore and Supabase, but decoupled for options 3 to 5.
- Cloud Run connections cap at 60 minutes, so any socket design needs reconnect plus refetch-on-reconnect regardless of provider.
- Offline writes (out of v1) are likely cheap only with Firestore among these options. [inference]

## Open items to verify before deciding

- Firestore, Cloud Run and Cloud SQL paid rates (Google Cloud pricing pages did not load).
- Supabase client behaviour in React Native/Expo.
- Atlas tier support for change streams, if Mongo is chosen.
- Ably/Pusher React Native SDK support.
