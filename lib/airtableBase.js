// lib/airtableBase.js
// Airtable disabled: export a stub that throws if used

function throwDisabled(method) {
  const err = new Error(`Airtable is disabled. Attempted to call: ${method}`);
  // eslint-disable-next-line no-console
  console.error('[airtableBase]', err.message);
  throw err;
}

export const airtableBase = function disabledBase() {
  return {
    select: () => throwDisabled('base().select'),
    find: () => throwDisabled('base().find'),
    update: () => throwDisabled('base().update'),
    create: () => throwDisabled('base().create'),
    destroy: () => throwDisabled('base().destroy'),
  };
};

export default airtableBase;
