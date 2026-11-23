# RentEasy API

REST API for the RentEasy equipment rental platform.

- **Runtime:** Node.js 20/22/24 (CommonJS)
- **Framework:** Express 5
- **Database:** MongoDB Atlas via Mongoose
- **Auth:** BetterAuth JWTs verified against the client JWKS endpoint
- **Payments:** Stripe Checkout + signed webhooks
- **Deployment:** Vercel zero-config Express (root `index.js` exports the app)

## Local development

```bash
cp .env.example .env      # fill in the values
npm install
npm run sync-indexes      # creates MongoDB indexes (run after schema changes)
npm run seed              # optional demo data (non-destructive upsert)
npm run dev               # http://localhost:5000
```

Health checks:

- `GET /` – liveness (no database required)
- `GET /api/health` – readiness (returns `503` when MongoDB is unreachable)

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `CLIENT_URL` | yes | Allowed frontend origin(s), comma separated |
| `BETTER_AUTH_URL` | yes | Origin serving `/api/auth/jwks` |
| `STRIPE_SECRET_KEY` | payments | Stripe secret key (`sk_...`) |
| `STRIPE_WEBHOOK_SECRET` | payments | Stripe webhook signing secret (`whsec_...`) |
| `PORT` | no | Local listener port (default `5000`) |
| `ALLOW_VERCEL_PREVIEWS` | no | Allow `*.vercel.app` origins (`true`/`false`) |
| `REQUEST_TIMEOUT_MS` | no | Documented request budget (default `25000`) |

`CLIENT_URL` and `BETTER_AUTH_URL` must not contain a trailing slash. Multiple
client origins are supported in `CLIENT_URL`, for example
`https://app.example.com,https://www.app.example.com`.

## API overview

All protected routes expect `Authorization: Bearer <BetterAuth JWT>`.

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/equipment` | public (search/filter/sort/pagination) |
| GET | `/api/equipment/featured` | public |
| GET | `/api/equipment/:id` | authenticated (non-approved items only for owner/admin) |
| GET | `/api/equipment/owner/my` | owner |
| POST | `/api/equipment` | owner |
| PUT | `/api/equipment/:id` | owner/admin |
| DELETE | `/api/equipment/:id` | owner/admin (blocked with active rentals) |
| GET | `/api/equipment/admin/all` | admin |
| PATCH | `/api/equipment/:id/approve` | admin |
| PATCH | `/api/equipment/:id/reject` | admin |
| GET | `/api/users/me` | authenticated |
| PUT | `/api/users/me` | authenticated |
| GET | `/api/users/admin/all` | admin |
| PATCH | `/api/users/:id/role` | admin |
| DELETE | `/api/users/:id` | admin |
| POST | `/api/bookings` | customer |
| GET | `/api/bookings/my-rentals` | customer |
| GET | `/api/bookings/owner-rentals` | owner |
| GET | `/api/bookings` | admin |
| GET | `/api/bookings/:id` | customer/owner/admin |
| PATCH | `/api/bookings/:id/status` | owner/admin |
| GET/POST | `/api/favorites` | customer |
| DELETE | `/api/favorites/:equipmentId` | customer |
| POST | `/api/payments/create-checkout-session` | customer |
| POST | `/api/payments/verify/:sessionId` | customer |
| POST | `/api/payments/webhook` | Stripe (signature verified) |
| GET | `/api/analytics/admin` | admin |
| GET | `/api/analytics/owner` | owner |

## Deploying to Vercel

1. Import the repository into Vercel (framework preset: **Other**).
2. Add the environment variables above to **Production** and **Preview**.
3. Set the Stripe webhook endpoint to
   `https://<project>.vercel.app/api/payments/webhook` and copy its signing
   secret into `STRIPE_WEBHOOK_SECRET`.
4. Deploy. Vercel's zero-config Express preset runs the app exported by the
   root `index.js` as a single function and preserves the original path, so
   `/api/equipment` reaches Express unchanged. Do **not** add a catch-all
   rewrite to `/api`: newer Vercel builds route internal rewrites by their
   destination path, which collapses every route to `/api`. `vercel.json` only
   sets the 30 second duration and excludes `.env` from the function bundle.
5. Run `npm run sync-indexes` once locally against the production database (or
   from a CI job) after schema changes. Index creation is disabled during cold
   starts for performance.

### Troubleshooting

- **CORS error:** the browser origin must exactly match an entry in
  `CLIENT_URL` (scheme + host + port, no trailing slash).
- **401:** the JWT must be signed by `BETTER_AUTH_URL` and the user must already
  exist in the shared MongoDB `user` collection.
- **404:** check the path; unknown routes return JSON with `requestId`.
- **500:** the JSON response contains a `requestId`; the server logs include the
  same id with the full stack.
- **503:** MongoDB or Stripe is not configured/reachable.
- **504:** the function exceeded Vercel's duration limit; check Atlas latency and
  the Stripe status page. Connection and Stripe calls are capped at 8s/10s.

## Payments and stock consistency

- Checkout session creation is idempotent per booking.
- The webhook and the success-page verification share one idempotent confirmation
  path: stock is decremented at most once and a retried event is a no-op.
- If the last unit is rented before a payment settles, the payment is refunded
  automatically and the booking is cancelled.
- Cancelling a paid booking restores stock once and attempts a Stripe refund; if
  the refund call fails the response includes `refund.refunded === false` and the
  failure is logged for manual follow-up.
