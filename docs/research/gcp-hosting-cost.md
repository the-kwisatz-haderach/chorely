# Hosting and cost on Google Cloud (issue #7)

Retrieved 2026-10-30. Question: what does a low-budget production setup look like on GCP with Terraform (Cloud Run, Cloud SQL vs alternatives), with realistic monthly costs at small scale, and are non-GCP options materially cheaper?

Constraints: solo builder, under ~$50/month, PostgreSQL (ADR 0001), Next.js PWA in a pnpm monorepo, Expo later, near-real-time updates while online, no offline writes.

## Bottom line

- Cloud Run (request-based billing, min instances 0) plus Cloud SQL for PostgreSQL on a shared-core instance fits the budget at roughly $15-25/month at household scale. Everything is manageable in Terraform.
- The database is the fixed cost. Cloud SQL's cheapest tier is about $8/month for the instance alone, and it carries no SLA.
- Neon (serverless Postgres, not GCP) is materially cheaper for a tiny app (free, or a few dollars on Launch) and still fits ADR 0001. It is the main alternative worth weighing.
- Real-time is the cost trap on Cloud Run. An open SSE or WebSocket connection counts as an active request, so a held-open stream keeps the instance billed. Choose the real-time mechanism with this in mind (see below).
- AlloyDB is out of range. Supabase Pro ($25) is in range but buys features we do not need yet.

## Cloud Run

Source: https://cloud.google.com/run/pricing (retrieved 2026-10-30). Tier 1 region rates (us-central1 column; other Tier 1 regions such as europe-north1 and europe-west1 are listed as the same tier).

| Item (request-based billing) | Rate |
|---|---|
| CPU, active | $0.000024 / vCPU-second |
| Memory, active | $0.0000025 / GiB-second |
| Min instance, idle CPU | $0.0000025 / vCPU-second |
| Free tier per month (per billing account) | 180,000 vCPU-s, 360,000 GiB-s, 2 million requests |

| Item (instance-based billing) | Rate |
|---|---|
| CPU | $0.000018 / vCPU-second |
| Memory | $0.000002 / GiB-second |
| Free tier per month | 240,000 vCPU-s, 450,000 GiB-s |

Outbound internet transfer has a free tier of 1 GiB in North America per month (same page). Requests are billed only if they reach the container after authentication.

Real-time implications (https://docs.cloud.google.com/run/docs/triggering/websockets, retrieved 2026-10-30):
- WebSockets are treated as long-running HTTP requests with a request timeout of up to 60 minutes (default 5), so clients must reconnect.
- An instance with any open WebSocket connection is considered active, so CPU is allocated and it is billed.
- Clients may land on different instances, so fan-out across instances needs shared external state (database LISTEN/NOTIFY or a pub/sub service).

Estimates (my arithmetic from the rates above, 1 vCPU and 0.5 GiB instance):
- Request-based, instance active about 4 hours/day: 432,000 vCPU-s x $0.000024 = $10.37, minus the free tier credit (about $4.32) = about $6/month. Memory falls inside the free tier.
- Instance-based, always on (730 h): CPU $47.30 + memory $2.63, minus free tier (about $5.2) = about $45/month. This alone nearly uses the budget; avoid.
- No traffic and min instances 0: $0. The cost is cold-start latency instead.

## Database options

### Cloud SQL for PostgreSQL

Source: https://cloud.google.com/sql/pricing (retrieved 2026-10-30). The page has a region selector; the figures below are the default (first, US) column and I did not confirm the region mapping, so check the region you pick (europe-* is typically a little higher).

| Item | Rate | Monthly (730 h) |
|---|---|---|
| db-f1-micro (shared, 0.6 GiB) | $0.0105 / hour | about $7.67 |
| db-g1-small (shared, 1.7 GiB) | $0.035 / hour | about $25.55 |
| Same, HA | double the above | about $15.33 / $51.10 |
| SSD storage | $0.000232877 / GiB-hour | about $0.17 / GiB |
| Backups (used) | $0.000109589 / GiB-hour | about $0.08 / GiB |
| Ingress to Cloud SQL | free | |

Notes from the same page:
- Shared-core types (db-f1-micro, db-g1-small) are not covered by the Cloud SQL SLA.
- An "IPv4 addresses while idle" charge of $0.01/hour (about $7.30/month) is listed. I did not establish exactly when it applies; check the SKU description before enabling a public IP. Prefer the Cloud SQL connector via Unix socket from Cloud Run (https://docs.cloud.google.com/sql/docs/postgres/connect-run).
- Point-in-time recovery restores to a new instance (https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/pitr). PITR log storage billing was not verified.
- Free trial instance: 30 days, in a new project, Enterprise Plus 8 vCPU (https://docs.cloud.google.com/sql/docs/postgres/free-trial-instance). Good for evaluation, not for production.

Realistic monthly: db-f1-micro + 10 GiB SSD + a few GiB backups = about $10; db-g1-small = about $28. Both are the same engine, so moving up is easy.

### AlloyDB

Source: https://cloud.google.com/alloydb/pricing (retrieved 2026-10-30). Billed per vCPU-hour and GiB-hour; the free offer is 30-day trial clusters only (8 vCPU primary). The page lists vCPU at $0.06608/hour (first column, region unconfirmed): even 2 vCPUs would be about $96/month before memory. No free production tier found. Not viable at this budget.

### Neon (non-GCP, serverless Postgres)

Source: https://neon.com/pricing (retrieved 2026-10-30).

| | Free | Launch |
|---|---|---|
| Price | $0 | pay as you go |
| Compute | 100 CU-hours/project, up to 2 CU | $0.106 / CU-hour |
| Storage | 1 GB/project | $0.35 / GB-month |
| History (PITR) window | 6 hours | up to 7 days |
| Scale to zero | after 5 min idle, cannot disable | after 5 min, can disable |
| Egress included | 5 GB | 500 GB |

Estimate (my arithmetic): 0.25 CU active about 8 h/day = 60 CU-hours x $0.106 = about $6.4, plus storage under $1 = about $7/month on Launch. Always-on 0.25 CU would be about $19. The Free plan is $0 and plausible for early use, but a 6-hour history window is weak for real data. First query after idle pays a cold start. Cloud Run to Neon crosses the public internet (pick the nearest region). I did not verify Neon regions or a Terraform provider.

### Supabase (non-GCP, Postgres plus extras)

Source: https://supabase.com/pricing (retrieved 2026-10-30). Free: 500 MB DB, paused after 1 week of inactivity, no backups. Pro: from $25/month, 8 GB DB, daily backups kept 7 days, never paused, Realtime with 500 concurrent connections and 5 million messages included, $10 compute credit covering one Micro instance. It is Postgres, so ADR 0001 holds, and Realtime could cover the real-time need, but it pulls auth and access control toward Supabase patterns (ADR 0001 chose app-layer scoping without RLS). Free-tier pausing makes it unsuitable for production.

### MongoDB Atlas

Not researched; ADR 0001 already ruled it out.

## Other non-GCP compute

Hetzner Cloud: the docs page (https://docs.hetzner.com/cloud/servers/overview/, retrieved 2026-10-30) confirms an IPv4 Primary IP costs an extra EUR 0.50/month but does not list server prices (the pricing page is script-rendered and could not be read). Server prices are therefore not verified here. A small VPS running Node plus Postgres is likely the cheapest option overall but gives up managed backups and costs ops time. Not recommended for a solo part-time builder unless cost becomes binding.

## Candidate setups

| Setup | Est. monthly | Notes |
|---|---|---|
| A. Cloud Run + Cloud SQL db-f1-micro | about $15-20 | All-GCP, one provider, one bill. No DB SLA. 0.6 GiB RAM is tight for connection pooling. |
| A+. Cloud Run + Cloud SQL db-g1-small | about $33-38 | More headroom, still no SLA. |
| B. Cloud Run + Neon Launch | about $7-14 | Cheapest managed option with 7-day PITR; second vendor and a Terraform provider to evaluate. |
| C. Cloud Run + Neon Free | about $0-6 | Fine pre-launch; 6 h history. |

Cloud Run figures assume the about $6 request-based estimate above. Artifact Registry, Secret Manager, Cloud Logging and Cloud Build costs were not researched; at this scale expect them to be small, but verify.

## Terraform notes

- The Google provider covers Cloud Run, Cloud SQL, Artifact Registry and Secret Manager. I did not verify resource names against the provider docs.
- Keep deletion protection on, and automated backups and PITR enabled on Cloud SQL.

## Real-time options (cost-aware)

1. Short polling or revalidate-on-focus for a small Group: no extra infrastructure, near-real-time at a few seconds, fits request-based billing.
2. SSE or WebSockets on Cloud Run: works, but each open stream bills as active time, and multi-instance fan-out needs shared state. Fine if the connected population is small and max instances is capped.
3. Managed pub/sub or Realtime service (Supabase Realtime, others): not priced here beyond Supabase's figures above.

## Recommendation

Start with Cloud Run (request-based, min instances 0, max instances capped) and Cloud SQL db-f1-micro in a single GCP project managed with Terraform, expected about $15-20/month. This keeps one cloud and one bill and leaves about $30 of headroom for g1-small, HA or logging. Accept the lack of a shared-core SLA for v1. Use polling or SSE with a low instance cap for "near-real-time" and defer a managed real-time service. Revisit Neon Launch if the fixed database cost starts to bind or 0.6 GiB RAM proves too small.

## Open items

- Confirm region and verify its Cloud SQL and Cloud Run rates in the pricing calculator.
- Check when the Cloud SQL idle IPv4 charge applies.
- Measure whether db-f1-micro handles Drizzle pooling plus Cloud Run concurrency.
- Pick the real-time mechanism (feeds the backend-shape ticket).
