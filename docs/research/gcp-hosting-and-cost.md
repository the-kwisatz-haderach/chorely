# Hosting and cost on Google Cloud (issue #7)

Research for wayfinder ticket #7, part of map #1. Gathered 2026-10-30. This is findings and options, not a decision.

Question: what does a low-budget production setup look like on Google Cloud with Terraform for a small app (Cloud Run, managed Postgres or MongoDB Atlas, alternatives)? Give realistic monthly costs at small scale, and note cheaper options outside GCP if materially better.

Constraints: solo part-time builder, under about $50/month, Next.js web plus Expo client, near-real-time updates while online, small real launch.

## Bottom line

- A GCP-native stack fits the budget. Cloud Run (free tier) + Cloud SQL Postgres `db-f1-micro` is about $10-12/month on the numbers below. Adding a Load Balancer for a custom domain would take it to about $30.
- The biggest cost risk is not the database. It is **near-real-time** on Cloud Run: open WebSocket connections keep an instance billed as active (see "Real-time").
- The cheapest sound managed-database path is a serverless Postgres free tier (Neon Free, $0), at the price of leaving GCP for the data tier.
- MongoDB Atlas Flex ($8-30/month, 5 GB cap) works but costs more than the Cloud SQL micro and has no obvious advantage for this data model (Group, Member, Chore, Queue Position).
- Atlas Dedicated M10 ($56.94+/month) is over budget by itself.
- Cloud SQL shared-core instances have **no SLA**. The "small real launch" tolerance for that is a human call.

## Sources and dates

All fetched 2026-10-30. Prices are USD. Each pricing page can change at any time.

| Ref | Source |
|---|---|
| [CR] | Cloud Run pricing, https://cloud.google.com/run/pricing |
| [SQL] | Cloud SQL pricing, https://cloud.google.com/sql/pricing |
| [FREE] | Google Cloud Free Tier features, https://docs.cloud.google.com/free/docs/free-cloud-features |
| [WS] | Cloud Run WebSockets docs, https://docs.cloud.google.com/run/docs/triggering/websockets |
| [DOM] | Cloud Run custom domains, https://docs.cloud.google.com/run/docs/mapping-custom-domains |
| [NET] | VPC / Load Balancing network pricing, https://cloud.google.com/vpc/network-pricing |
| [SM] | Secret Manager pricing, https://cloud.google.com/secret-manager/pricing |
| [AR] | Artifact Registry pricing, https://cloud.google.com/artifact-registry/pricing |
| [FB] | Firebase pricing, https://firebase.google.com/pricing |
| [ATLAS] | MongoDB Atlas pricing, https://www.mongodb.com/pricing |
| [M0] | Atlas Free limits, https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ |
| [FLEX] | Atlas Flex limits, https://www.mongodb.com/docs/atlas/reference/flex-limitations/ |
| [NEON] | Neon pricing, https://neon.com/pricing |
| [SUPA] | Supabase pricing, https://supabase.com/pricing |
| [FLY] | Fly.io pricing, https://docs.fly.io/about/pricing |
| [HZ] | Hetzner Cloud, https://www.hetzner.com/cloud/ |
| [EXPO] | Expo EAS pricing, https://expo.dev/pricing |

Caveat on region: the Cloud SQL and Cloud Run tables are region-selectable, and the scraped text shows the default (first-listed, Iowa `us-central1`) values. Cloud Run `europe-west1` and `us-central1` are both listed as Tier 1 [CR], so Cloud Run prices below hold for both. **Cloud SQL prices for a European region were not verified**; expect them to be somewhat higher than the Iowa figures. Check in the console before committing to a region.

## Compute: Cloud Run

Facts [CR]:

- Request-based billing, Tier 1 regions: CPU $0.000024 per vCPU-second active, memory $0.0000025 per GiB-second active, $0.40 per million requests.
- Free per month (billing-account-wide): 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests. Also in [FREE].
- Min-instance idle time is billed at a lower rate: $0.0000025 per vCPU-second and per GiB-second. Idle instances that are not min instances are not charged.
- Instance-based billing (CPU always allocated), Tier 1: $0.000018 per vCPU-second, $0.000002 per GiB-second. Free: 240,000 vCPU-seconds and 450,000 GiB-seconds.
- Tier 1 includes `us-central1`, `europe-west1`, `europe-west4`, `europe-north1`, among others.

Arithmetic (mine, from the above):

- 1 vCPU + 512 MiB, request-based, scale-to-zero: the free tier covers 50 hours of active CPU per month. A small launch with short requests is plausibly $0.
- One warm min instance (1 vCPU, 512 MiB) at idle rates: 2.592M s x ($0.0000025 + 0.5 x $0.0000025) is about $9.70/month. This removes cold starts and costs under $10.
- One always-allocated instance (1 vCPU, 512 MiB, instance-based billing): about $46.7 CPU + $2.6 memory, minus free tier of about $5, so about $44/month. That alone approaches the budget.

Next.js on Cloud Run is standard container hosting. Whether web and API are one service or two is a separate ticket (backend shape).

## Real-time on Cloud Run

Facts [WS]:

- WebSockets work with no extra configuration but each connection is an HTTP request bound by the request timeout. Default 5 minutes, maximum 60 minutes. Clients must reconnect.
- Session affinity is best effort. Instances do not share state, so cross-instance fan-out needs an external system. Google suggests Redis Pub/Sub (Memorystore) or Firestore real-time updates.
- An instance with an open WebSocket is active and billed on instance-based billing.
- Up to 1,000 concurrent connections per container.
- SSE is not addressed specifically; the same timeout and reconnect rules presumably apply (inference).

Implications for a one-Group-per-Queue app:

- Holding connections open costs roughly a continuously warm instance (about $44/month at 1 vCPU, see above), not per-connection money. One instance can carry many connections.
- With more than one instance, a change handled by instance A must reach clients connected to instance B. Options: cap at max 1 instance (simple, a single point of capacity), use Postgres `LISTEN/NOTIFY`, add Memorystore (not priced here; typically not cheap, check before use), or use a hosted realtime service.
- Memorystore pricing was not researched. Hosted realtime services (Supabase Realtime, Firestore, Ably, Pusher) were only partially researched; see below.
- Short-interval polling or SSE with reconnect fits the free tier better, if "near-real-time" tolerates a few seconds. That is a product call for the real-time ticket.

## Postgres options

### Cloud SQL for PostgreSQL [SQL]

- `db-f1-micro` (shared CPU, 0.6 GiB RAM): $0.0105/hour, about $7.67/month. HA: $0.021/hour (about $15.33/month).
- `db-g1-small` (shared CPU, 1.7 GiB RAM): $0.035/hour, about $25.55/month. HA: $0.07/hour.
- SSD storage: $0.000232877 per GiB-hour, about $0.17 per GiB-month (10 GiB about $1.70). Backups (used): $0.000109589 per GiB-hour, about $0.08 per GiB-month.
- **Shared-core machines are not covered by the Cloud SQL SLA** [SQL].
- IPv4 address while idle: $0.01/hour [SQL]. The page does not make clear when this applies to a normal instance; verify in a Terraform plan or billing estimate.
- Terraform: Cloud SQL is a first-class resource in the Google provider (not re-verified here; the builder has Terraform experience).
- Cloud Run can connect to Cloud SQL via the built-in connector without a VPC connector or NAT (not re-verified here; check the Cloud Run Cloud SQL docs).

Estimated: micro + 10 GiB + small backups is about $10-11/month. Small-instance + HA is not worth it at this scale; no HA option for the micro makes sense without SLA.

### Neon [NEON]

- Free: $0, 100 CU-hours per project, 1 GB storage per project, scale-to-zero after 5 minutes (cannot be turned off), 6-hour history.
- Launch: pay as you go, $0.106 per CU-hour, $0.35 per GB-month storage, scale-to-zero can be disabled, 7-day history. No minimum monthly spend.
- Estimate (assumption: a 0.25 CU minimum, which the pricing page does not state): always-on at 0.25 CU is about 182 CU-hours, so about $19/month plus storage.
- Cold starts after 5 minutes of idleness would hit a mostly-idle small launch.
- Regions were not on the pricing page; confirm that a region near the Cloud Run region exists, because cross-region latency would apply per query.

### Supabase [SUPA]

- Free: 500 MB database, **paused after 1 week of inactivity**, no backups, 200 realtime concurrent connections, 2M realtime messages/month, 50,000 auth MAU.
- Pro: from $25/month, 8 GB disk, includes $10 compute credit, daily backups kept 7 days, 500 realtime concurrent connections.
- Interesting because it bundles Postgres, auth and realtime. It is a different backend shape (backend-as-a-service) and overlaps with tickets on backend shape and real-time, so noted only.

## MongoDB Atlas [ATLAS][M0][FLEX]

- Free (M0): $0, 0.5 GB, 100 ops/sec, 500 connections, **auto-paused after 30 days of zero connections**, daily snapshot (up to 4 kept) when enabled.
- Flex: usage-based $8-30/month ($0.0110/hour at 0-100 ops/sec, up to $0.0411/hour at 400-500 ops/sec), 5 GB cap with no auto-expand, 500 connections, one daily snapshot, **no point-in-time restore**, no outbound data transfer charge.
- Dedicated M10: $0.08/hour, from $56.94/month. Over budget.
- Free and Flex: no private endpoints or network peering [M0][FLEX]. A Cloud Run service therefore reaches Atlas over the public internet. Cloud Run egress IPs are not static by default, so in practice that means an open IP allowlist with SCRAM credentials (inference from the above; static egress would need Cloud NAT, which I did not price).
- Terraform: an Atlas provider exists but I did not verify its status or details.
- The domain (Queue ordering by Position, Due-date seeding, many-to-many membership, recurrence) is relational and ordering-heavy. This research does not argue for either; the data-store ticket owns that.

## Supporting GCP line items

- Secret Manager [SM]: the first 6 active versions and 10,000 access operations a month are free; extra access operations are $0.03 per 10,000. A handful of secrets costs about $0.
- Artifact Registry [AR]: first 0.5 GiB-month free, then about $0.10 per GiB-month. Container images cost cents.
- Cloud Build [FREE]: 2,500 build-minutes/month on `e2-standard-2` free. GitHub Actions is an alternative; CI/CD has its own ticket.
- Cloud Logging [FREE]: first 50 GiB/month per project free.
- Cloud Storage [FREE]: free tier applies only in `us-east1`, `us-west1`, `us-central1`.
- Firebase [FB]: Identity Platform lists 50K MAU free. Firestore free quota is 1 GiB and 20K writes/day. I did not confirm the Cloud Messaging pricing line; check before relying on it for push (separate ticket).
- Custom domain [DOM][NET]:
  - Cloud Run domain mapping is Preview and Google says it is "not production-ready" and "not recommended for production services."
  - The recommended path is a global external Application Load Balancer. A forwarding rule costs $0.025/hour in US pricing (about $18.25/month), plus data processing charges. This is the largest single fixed GCP item below the database.
  - Firebase Hosting in front of Cloud Run is the third documented option (pricing not researched).
  - Fronting Cloud Run with a non-Google CDN or proxy is a possible way to avoid the load balancer; not researched.
- Free-tier reality: the compute and registry free tiers are unlikely to be exceeded at launch scale. Billing alerts are free and worth setting in Terraform (not researched in detail).

## Monthly cost scenarios (mine; assumptions stated)

Assumptions: under 100 active Members, Cloud Run stays within or near free tier except where stated, 10 GiB data, one environment (production). A second (staging) environment would roughly double the database line unless it uses a free tier. Domain registration cost excluded.

| Scenario | Compute | Database | Other | Approx. total |
|---|---|---|---|---|
| A. GCP lean: Cloud Run scale-to-zero, Cloud SQL micro, no LB | ~$0 | ~$10 | ~$0-1 | **~$10-12** |
| B. A plus 1 warm instance (no cold starts) | ~$10 | ~$10 | ~$1 | **~$20-22** |
| C. B plus Load Balancer for custom domain | ~$10 | ~$10 | ~$18+ | **~$38-42** |
| D. Cloud Run + Neon Free | ~$0 | $0 (cold starts, 1 GB) | ~$0 | **~$0-10** |
| E. Cloud Run + Atlas Flex | ~$0-10 | $8-30 | ~$0 | **~$8-40** |
| F. Always-allocated instance for WebSocket (instead of warm min instance) | ~$44 | ~$10 | ~$1 | **~$55** (over budget) |
| G. Outside GCP: one Hetzner VM (from EUR 5.99-6.49/month) running app + Postgres in containers | included | included | included | **~EUR 6-8** plus ops time and backups you build yourself |

Scenario F shows why the real-time decision matters most. Scenario G is cheapest by far but it throws away the managed services, the Terraform-on-GCP path and automatic scaling, and makes the builder the operator and backup system. I did not research Hetzner features beyond price and locations (Germany, Finland, Singapore, US) [HZ].

Other non-GCP data points:

- Fly.io [FLY]: shared-cpu-1x 256 MB $2.19/month, 512 MB $3.69/month, volumes $0.15/GB-month, **Managed Postgres from $38/month**, dedicated IPv4 $2/month, no free tier for new orgs. Self-run Postgres on a volume is cheap but unmanaged.

## Client-side costs noted in passing

- Expo EAS [EXPO]: Free plan gives up to 15 Android and 15 iOS builds per month on a low-priority queue, with updates for 1,000 MAU. Starter is $19/month plus usage. Store fees are out of the stated budget.

## Open points for the grilling session

1. Real-time design: is polling or short-window SSE acceptable, or do WebSockets need a warm or always-allocated instance? This decides between about $10 and about $44 for compute.
2. Is "no SLA" acceptable for Cloud SQL `db-f1-micro`? The alternative within GCP is `db-g1-small` (also no SLA) or a dedicated-core tier (not priced here), or leaving GCP for the database.
3. Custom domain: pay about $18/month for a Load Balancer, or use another front (Firebase Hosting, a third-party proxy) after checking those.
4. Staging environment: does the budget allow a second database, or does staging use a free-tier database (Neon Free) or none?
5. Cloud SQL European-region pricing is unverified.

## What was not verified

- Cloud SQL prices outside the default region; Cloud Run Cloud SQL connector requirements; Terraform provider details (Google and Atlas); Memorystore pricing; Firebase Hosting and Cloud Messaging pricing; Neon minimum CU and regions; Cloud NAT; Hetzner per-plan specs.
- Traffic assumptions are guesses. No real usage data exists yet.
