// next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Alias the 'airtable' package to a local stub to prevent any Airtable usage
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['airtable'] = path.resolve(__dirname, 'lib/stubs/airtable.js');
    return config;
  },
};

module.exports = nextConfig;
