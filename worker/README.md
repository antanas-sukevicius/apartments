# Calendar API deployment

The GitHub Pages site is static, so it cannot fetch the Booking.com and Airbnb
feeds directly from a browser. This Cloudflare Worker fetches both feeds,
combines their unavailable dates, and returns JSON to the site.

## Important: rotate the existing calendar links

The original iCal URLs were included in a public GitHub commit. Treat those
links as exposed: regenerate the calendar links in Booking.com and Airbnb, then
use the newly generated URLs as the Worker secrets below. Do not reuse the old
links or add the replacement links to source control.

## Deploy the Worker

1. Install Node.js if it is not already installed.
2. Sign in to Cloudflare and register a `workers.dev` subdomain in the
   [Workers onboarding page](https://dash.cloudflare.com/?to=/:account/workers/onboarding).
   This is required to publish a Worker at its default `workers.dev` address.
3. From the project root, authenticate Wrangler with your Cloudflare account:

   ```powershell
   npx.cmd wrangler login
   ```

4. Deploy the Worker:

   ```powershell
   npx.cmd wrangler deploy --config worker/wrangler.toml
   ```

   The deployed Worker URL is
   `https://smolensko-calendar-api.antanas-sukevicius.workers.dev`.

5. In Cloudflare, open **Workers & Pages**, select `smolensko-calendar-api`,
   then **Settings → Variables and Secrets**. Add these two values as **Secrets**:

   - `BOOKING_ICAL_URL` — the full Booking.com iCal URL
   - `AIRBNB_ICAL_URL` — the full Airbnb iCal URL

   Enter the feed URLs directly in Cloudflare. Do not put them in source files,
   commit them, or send them in chat.

6. Push the updated `script.js` to GitHub so the Pages site uses the Worker API.
   The Worker already permits requests from the GitHub Pages origin for this
   repository. If you later add a custom website domain, add its origin to
   `ALLOWED_ORIGINS` in `worker/src/index.js` and redeploy.

7. Confirm the API responds by opening
   `https://smolensko-calendar-api.antanas-sukevicius.workers.dev/api/calendar`.
   A successful response contains `unavailableDates` and `updatedAt`.

The API caches responses in browsers for five minutes. If either calendar
provider is temporarily unavailable, it returns an error rather than showing
dates as available.

## Updating the service

After changing `worker/src/index.js`, deploy again with:

```powershell
npx.cmd wrangler deploy --config worker/wrangler.toml
```

Changing the iCal links does not require a code change; update the corresponding
secret with `wrangler secret put`.
