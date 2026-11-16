# Apartment Smolensko

Static apartment rental website published with GitHub Pages.

- `index.html` — page content
- `styles.css` — responsive styling
- `script.js` — calendar display and booking request form
- `worker/` — Cloudflare Worker that combines the Booking.com and Airbnb calendars

## Calendar proxy setup

GitHub Pages cannot read the iCal feeds directly because their providers block
browser cross-origin requests. Follow [the Worker deployment guide](worker/README.md)
to deploy the calendar API, configure its private feed URLs, and connect the site.

The booking form currently opens a prefilled email; it does not submit bookings
to a backend.
