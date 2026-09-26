"use client";

/**
 * The short list a person picks a timezone from (master.txt 2.5).
 *
 * `Intl.supportedValuesOf` gives the runtime's own list, which is authoritative
 * for whatever Node or browser is running, but it returns ~400 entries and the
 * overwhelming majority are obscure. This is a fixed, curated set of the zones a
 * social team is realistically in, always including the workspace default, and
 * the search box above it still accepts any zone name the browser knows.
 *
 * Kept as its own module because both the calendar filters and the post editor
 * need it, and neither can import the server-only data layer.
 */

export const COMMON_TIME_ZONES: { value: string; label: string; region: string }[] = [
  { value: "UTC", label: "UTC", region: "Universal" },
  { value: "Asia/Karachi", label: "Karachi", region: "Asia" },
  { value: "Asia/Kolkata", label: "Kolkata", region: "Asia" },
  { value: "Asia/Dhaka", label: "Dhaka", region: "Asia" },
  { value: "Asia/Dubai", label: "Dubai", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore", region: "Asia" },
  { value: "Asia/Jakarta", label: "Jakarta", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo", region: "Asia" },
  { value: "Asia/Seoul", label: "Seoul", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", region: "Asia" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur", region: "Asia" },
  { value: "Asia/Kabul", label: "Kabul", region: "Asia" },
  { value: "Asia/Tehran", label: "Tehran", region: "Asia" },
  { value: "Asia/Riyadh", label: "Riyadh", region: "Asia" },
  { value: "Australia/Sydney", label: "Sydney", region: "Oceania" },
  { value: "Australia/Melbourne", label: "Melbourne", region: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland", region: "Oceania" },
  { value: "Europe/London", label: "London", region: "Europe" },
  { value: "Europe/Dublin", label: "Dublin", region: "Europe" },
  { value: "Europe/Lisbon", label: "Lisbon", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid", region: "Europe" },
  { value: "Europe/Paris", label: "Paris", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam", region: "Europe" },
  { value: "Europe/Brussels", label: "Brussels", region: "Europe" },
  { value: "Europe/Zurich", label: "Zurich", region: "Europe" },
  { value: "Europe/Rome", label: "Rome", region: "Europe" },
  { value: "Europe/Warsaw", label: "Warsaw", region: "Europe" },
  { value: "Europe/Stockholm", label: "Stockholm", region: "Europe" },
  { value: "Europe/Oslo", label: "Oslo", region: "Europe" },
  { value: "Europe/Copenhagen", label: "Copenhagen", region: "Europe" },
  { value: "Europe/Helsinki", label: "Helsinki", region: "Europe" },
  { value: "Europe/Athens", label: "Athens", region: "Europe" },
  { value: "Europe/Istanbul", label: "Istanbul", region: "Europe" },
  { value: "Europe/Kiev", label: "Kyiv", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow", region: "Europe" },
  { value: "America/New_York", label: "New York", region: "Americas" },
  { value: "America/Chicago", label: "Chicago", region: "Americas" },
  { value: "America/Denver", label: "Denver", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles", region: "Americas" },
  { value: "America/Vancouver", label: "Vancouver", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City", region: "Americas" },
  { value: "America/Bogota", label: "Bogota", region: "Americas" },
  { value: "America/Lima", label: "Lima", region: "Americas" },
  { value: "America/Sao_Paulo", label: "Sao Paulo", region: "Americas" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", region: "Americas" },
  { value: "Africa/Lagos", label: "Lagos", region: "Africa" },
  { value: "Africa/Cairo", label: "Cairo", region: "Africa" },
  { value: "Africa/Nairobi", label: "Nairobi", region: "Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg", region: "Africa" },
];

/** The short offset label shown next to a zone, e.g. "UTC+5". */
export function timeZoneOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);

    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
