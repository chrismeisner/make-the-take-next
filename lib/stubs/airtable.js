// lib/stubs/airtable.js
// Minimal stub to crash fast if anything tries to import 'airtable'

class DisabledAirtable {
  constructor() {
    throw new Error('Airtable SDK is disabled in this build.');
  }
}

module.exports = DisabledAirtable;


