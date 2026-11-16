"use strict";

// Both feeds belong to this apartment; dates booked on either feed are unavailable.
const property = {
  name: "Apartment Smolensko"
};
const calendarApiUrl = "https://smolensko-calendar-api.antanas-sukevicius.workers.dev/api/calendar";

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

async function loadCalendar() {
  state.calendarLoading = true;
  state.calendarError = "";
  renderCalendar();
  try {
    const response = await fetch(calendarApiUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Calendar service returned HTTP ${response.status}`);
    const calendar = await response.json();
    if (!Array.isArray(calendar.unavailableDates) ||
        !calendar.unavailableDates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new Error("Calendar service returned invalid availability data");
    }
    state.unavailableDates = new Set(calendar.unavailableDates);
  } catch (error) {
    console.error(`Unable to load all availability calendars for ${property.name}:`, error);
    state.calendarError = "Availability could not be loaded. The calendar service may not be deployed or configured yet. Please contact us to confirm your dates.";
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
