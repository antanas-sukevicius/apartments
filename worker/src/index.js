const ALLOWED_ORIGINS = new Set([
  "https://antanas-sukevicius.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300"
};

function jsonResponse(body, status, origin) {
  const headers = new Headers(JSON_HEADERS);
  if (status !== 200) headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Accept");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function parseIcs(icsText) {
  if (!/BEGIN:VCALENDAR/i.test(icsText)) {
    throw new Error("Calendar response is not a valid iCalendar feed");
  }

  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const unavailable = new Set();

  function getDate(propertyLine) {
    if (!propertyLine) return null;
    const separator = propertyLine.indexOf(":");
    if (separator < 0) return null;

    const property = propertyLine.slice(0, separator);
    const value = propertyLine.slice(separator + 1).trim();
    const dateOnly = /(?:^|;)VALUE=DATE(?:;|$)/i.test(property) || /^\d{8}$/.test(value);
    const match = dateOnly
      ? value.match(/^(\d{4})(\d{2})(\d{2})$/)
      : value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);

    if (!match) return null;
    const date = `${match[1]}-${match[2]}-${match[3]}`;

    if (dateOnly || !match[7]) return date;

    const instant = new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    ));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Vilnius",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  for (const event of events) {
    const lines = event.split(/\r?\n/);
    const startLine = lines.find((line) => /^DTSTART(?:;[^:]*)?:/i.test(line));
    const endLine = lines.find((line) => /^DTEND(?:;[^:]*)?:/i.test(line));
    const start = getDate(startLine);
    const end = getDate(endLine);
    if (!start || !end || end <= start) continue;

    const cursor = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    while (cursor < endDate) {
      unavailable.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return unavailable;
}

function validateCalendarUrl(value, expectedHost) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Calendar URL is missing or invalid");
  }

  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    throw new Error(`Calendar URL must use https://${expectedHost}`);
  }

  return url;
}

async function fetchCalendar(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar,text/plain,*/*" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Calendar host returned HTTP ${response.status}`);
  return parseIcs(await response.text());
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ error: "Origin is not allowed" }, 403, null);
    }
    if (url.pathname !== "/api/calendar") {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Vary": "Origin",
          "Access-Control-Allow-Origin": origin || "",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Accept",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, origin);
    }

    try {
      const bookingUrl = validateCalendarUrl(env.BOOKING_ICAL_URL, "ical.booking.com");
      const airbnbUrl = validateCalendarUrl(env.AIRBNB_ICAL_URL, "www.airbnb.com");
      const calendars = await Promise.all([
        fetchCalendar(bookingUrl),
        fetchCalendar(airbnbUrl)
      ]);
      const unavailableDates = [...new Set(calendars.flatMap((calendar) => [...calendar]))].sort();

      return jsonResponse({
        unavailableDates,
        updatedAt: new Date().toISOString()
      }, 200, origin);
    } catch (error) {
      console.error("Calendar availability request failed:", error.message);
      return jsonResponse({
        error: "Could not load both calendar feeds. Check the Worker secrets and calendar feed availability."
      }, 502, origin);
    }
  }
};
