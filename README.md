# Apartment Smolensko

Static apartment rental website published with GitHub Pages.

- `index.html` — page content
- `styles.css` — responsive styling
- `script.js` — calendar display and booking request form
- `worker/` — Cloudflare Worker that combines the Booking.com and Airbnb calendars

## Calendar proxy setup

GitHub Pages cannot read the iCal feeds directly because their providers block
browser cross-origin requests. The Cloudflare Worker handles calendar requests
and sends booking requests to Telegram. Follow [the Worker deployment guide](worker/README.md)
to configure the private calendar URLs and Telegram bot secrets.

The form sends a booking request notification; it does not automatically
approve a stay or take payment.
