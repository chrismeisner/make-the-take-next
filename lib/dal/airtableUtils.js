// lib/dal/airtableUtils.js
// Utilities for safe Airtable usage

export function escapeFormulaValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape double quotes for use inside {field} = "value"
  return str.replace(/"/g, '\\"');
}


