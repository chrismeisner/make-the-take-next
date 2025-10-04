// lib/dateFormat.js

export function formatDateTimeUtc(input) {
  try {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return formatter.format(date);
  } catch {
    return '';
  }
}


