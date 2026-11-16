"use strict";

// Both feeds belong to this apartment; dates booked on either feed are unavailable.
const property = {
  name: "Apartment Smolensko",
  calendarUrls: [
    "https://ical.booking.com/v1/export?t=d1aa823a-3a3a-4946-8e5d-ad7c01df3042",
    "https://www.airbnb.com/calendar/ical/1805287822772784418.ics?t=381ddf48b7364792a8d43977690fc9af"
  ]
};

// Replace these contact placeholders before publishing the site.
const contact = {
  phoneDisplay: "+370XXXXXXXX",
  phoneLink: "+370XXXXXXXX",
  email: "your@email.com"
};

const state = {
  unavailableDates: null,
  calendarLoading: true,
  calendarError: "",
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  checkin: "",
  checkout: ""
};

const elements = {
  calendarDays: document.getElementById("calendar-days"),
  calendarStatus: document.getElementById("calendar-status"),
  monthTitle: document.getElementById("month-title"),
  checkinSummary: document.getElementById("checkin-summary"),
  checkoutSummary: document.getElementById("checkout-summary"),
  checkinInput: document.getElementById("checkin-input"),
  checkoutInput: document.getElementById("checkout-input"),
  form: document.getElementById("booking-form"),
  feedback: document.getElementById("form-feedback")
};

// Use local calendar dates for the visible booking dates, avoiding UTC date drift.
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  if (!value) return "Select a date";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(parseDateKey(value));
}

// Parse unfolded iCalendar VEVENT blocks into occupied local dates (DTEND is exclusive).
function parseIcs(icsText) {
  if (!/BEGIN:VCALENDAR/i.test(icsText)) {
    throw new Error("Calendar response is not a valid iCalendar feed");
  }
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const unavailable = new Set();

  function getDate(propertyLine) {
    if (!propertyLine) return null;
    const [property, rawValue] = propertyLine.split(/:(.*)/s).filter((part) => part !== undefined);
    if (!property || rawValue === undefined) return null;
    const isDateOnly = /(?:^|;)VALUE=DATE(?:;|$)/i.test(property) || /^\d{8}$/.test(rawValue.trim());
    const value = rawValue.trim();
    if (isDateOnly) {
      const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
      return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
    }

    const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
    if (!dateTime) return null;
    if (dateTime[7]) {
      const instant = new Date(Date.UTC(
        Number(dateTime[1]), Number(dateTime[2]) - 1, Number(dateTime[3]),
        Number(dateTime[4]), Number(dateTime[5]), Number(dateTime[6] || 0)
      ));
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(instant);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
    }
    return new Date(Number(dateTime[1]), Number(dateTime[2]) - 1, Number(dateTime[3]));
  }

  for (const event of events) {
    const lines = event.split(/\r?\n/);
    const startLine = lines.find((line) => /^DTSTART(?:;[^:]*)?:/i.test(line));
    const endLine = lines.find((line) => /^DTEND(?:;[^:]*)?:/i.test(line));
    const start = getDate(startLine);
    const end = getDate(endLine);
    if (!start || !end || end <= start) continue;

    for (const occupied = new Date(start); occupied < end; occupied.setDate(occupied.getDate() + 1)) {
      unavailable.add(toDateKey(occupied));
    }
  }
  return unavailable;
}

async function loadCalendar() {
  state.calendarLoading = true;
  state.calendarError = "";
  renderCalendar();
  try {
    const calendars = await Promise.all(property.calendarUrls.map(async (url) => {
      const response = await fetch(url, { headers: { Accept: "text/calendar,text/plain,*/*" } });
      if (!response.ok) throw new Error(`Calendar server returned HTTP ${response.status}`);
      return parseIcs(await response.text());
    }));
    state.unavailableDates = new Set(calendars.flatMap((calendar) => [...calendar]));
  } catch (error) {
    console.error(`Unable to load all availability calendars for ${property.name}:`, error);
    state.calendarError = "Availability could not be loaded from both calendars. A calendar host may block browser requests (CORS); please contact us to confirm your dates.";
  } finally {
    state.calendarLoading = false;
    renderCalendar();
  }
}

function isPast(dateKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseDateKey(dateKey) < today;
}

function rangeHasUnavailableNight(checkin, checkout, unavailable) {
  const cursor = new Date(parseDateKey(checkin));
  while (toDateKey(cursor) < checkout) {
    if (unavailable.has(toDateKey(cursor))) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

function renderCalendar() {
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  elements.monthTitle.textContent = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(state.month);

  const unavailable = state.unavailableDates;
  if (state.calendarError) {
    elements.calendarStatus.textContent = state.calendarError;
    elements.calendarStatus.className = "calendar-status error";
  } else if (state.calendarLoading || !unavailable) {
    elements.calendarStatus.textContent = "Loading availability. Dates stay disabled until the calendar is checked.";
    elements.calendarStatus.className = "calendar-status";
  } else {
    elements.calendarStatus.textContent = `${unavailable.size} unavailable date${unavailable.size === 1 ? "" : "s"} synced from both calendars.`;
    elements.calendarStatus.className = "calendar-status success";
  }

  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey(new Date());
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  let html = "";

  for (let index = 0; index < cellCount; index += 1) {
    const dayNumber = index - mondayOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      html += '<span class="day outside" aria-hidden="true"></span>';
      continue;
    }
    const date = new Date(year, month, dayNumber);
    const key = toDateKey(date);
    const booked = unavailable ? unavailable.has(key) : false;
    const past = isPast(key);
    const selected = key === state.checkin || key === state.checkout;
    const inRange = state.checkin && state.checkout && key > state.checkin && key < state.checkout;
    const unknown = !unavailable;
    const disabled = past || booked || unknown;
    const classes = ["day"];
    if (booked) classes.push("booked");
    if (past) classes.push("past");
    if (selected) classes.push("selected");
    else if (inRange) classes.push("in-range");
    if (unknown && !past) classes.push("unknown");
    const label = `${formatDate(key)}${booked ? ", booked" : past ? ", past" : unknown ? ", availability not loaded" : ", available"}`;
    html += `<button class="${classes.join(" ")}" type="button" data-date="${key}" aria-label="${label}"${disabled ? " disabled" : ""}${selected ? ' aria-pressed="true"' : ""}>${dayNumber}</button>`;
  }
  elements.calendarDays.innerHTML = html;
  elements.calendarDays.querySelectorAll("[data-date]:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => selectDate(button.dataset.date));
  });
  elements.checkinSummary.textContent = formatDate(state.checkin);
  elements.checkoutSummary.textContent = formatDate(state.checkout);
  elements.checkinInput.value = state.checkin;
  elements.checkoutInput.value = state.checkout;
  elements.checkinInput.min = todayKey;
  elements.checkoutInput.min = state.checkin || todayKey;
}

function selectDate(dateKey) {
  const unavailable = state.unavailableDates;
  if (!unavailable || unavailable.has(dateKey) || isPast(dateKey)) return;

  if (!state.checkin || state.checkout || dateKey <= state.checkin) {
    state.checkin = dateKey;
    state.checkout = "";
  } else {
    if (rangeHasUnavailableNight(state.checkin, dateKey, unavailable)) {
      state.checkin = dateKey;
      state.checkout = "";
    } else {
      state.checkout = dateKey;
    }
  }
  elements.feedback.classList.remove("visible");
  renderCalendar();
}

function changeMonth(offset) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1);
  renderCalendar();
}

// This frontend-only submission creates a ready-to-send email; replace with an API call later.
function submitBooking(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const checkin = String(formData.get("checkin") || "");
  const checkout = String(formData.get("checkout") || "");
  const unavailable = state.unavailableDates;

  if (!unavailable) {
    showFormMessage("Availability is not loaded, so we can’t verify the selected dates yet. Please contact us directly.", true);
    return;
  }
  if (!checkin || !checkout || checkout <= checkin) {
    showFormMessage("Please select a valid check-in and a later check-out date.", true);
    return;
  }
  if (rangeHasUnavailableNight(checkin, checkout, unavailable)) {
    showFormMessage("Those dates include an unavailable night. Please choose another date range.", true);
    return;
  }

  const subject = `Booking request — ${property.name}`;
  const body = [
    `Property: ${property.name}`,
    `Name: ${formData.get("name")}`,
    `Email: ${formData.get("email")}`,
    `Phone: ${formData.get("phone")}`,
    `Check-in: ${checkin}`,
    `Check-out: ${checkout}`,
    `Guests: ${formData.get("guests")}`,
    `Message: ${formData.get("message") || "(none)"}`
  ].join("\n");
  window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  showFormMessage("Your email app should open with the booking request ready to send. Remember to press Send in your email app.");
}

function showFormMessage(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.add("visible");
  elements.feedback.style.color = isError ? "#963c3c" : "";
  elements.feedback.style.background = isError ? "var(--red-soft)" : "";
}

function setupContactLinks() {
  const phone = contact.phoneLink.replace(/[^\d+]/g, "");
  const whatsappNumber = phone.replace(/\D/g, "");
  document.getElementById("phone-link").href = `tel:${phone}`;
  document.getElementById("phone-link").querySelector("strong").textContent = contact.phoneDisplay;
  document.getElementById("email-link").href = `mailto:${contact.email}`;
  document.getElementById("email-link").querySelector("strong").textContent = contact.email;
  document.getElementById("whatsapp-link").href = `https://wa.me/${whatsappNumber}`;
  document.getElementById("viber-link").href = `viber://chat?number=${encodeURIComponent(`+${whatsappNumber}`)}`;
}

document.getElementById("previous-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
elements.form.addEventListener("submit", submitBooking);

for (const input of [elements.checkinInput, elements.checkoutInput]) {
  input.addEventListener("change", () => {
    const { checkin, checkout } = elements.form.elements;
    const unavailable = state.unavailableDates;
    if (!unavailable) {
      showFormMessage("Availability is not loaded. Please contact us to confirm your dates.", true);
      input.value = "";
      return;
    }
    if (input.value && (unavailable.has(input.value) || isPast(input.value))) {
      showFormMessage("That date is unavailable. Please choose a green date from the calendar.", true);
      input.value = "";
      return;
    }
    if (checkin.value && checkout.value && checkout.value <= checkin.value) {
      showFormMessage("Check-out must be later than check-in.", true);
      if (input === elements.checkoutInput) elements.checkoutInput.value = "";
      else elements.checkinInput.value = "";
      return;
    }
    if (checkin.value && checkout.value && rangeHasUnavailableNight(checkin.value, checkout.value, unavailable)) {
      showFormMessage("Your date range includes an unavailable night. Please choose different dates.", true);
      if (input === elements.checkoutInput) elements.checkoutInput.value = "";
      else elements.checkinInput.value = "";
      return;
    }
    state.checkin = checkin.value;
    state.checkout = checkout.value;
    renderCalendar();
  });
}

document.getElementById("current-year").textContent = new Date().getFullYear();
setupContactLinks();
renderCalendar();
loadCalendar();
