const fetch = require('node-fetch');

async function fetchJSON(url, opts = {}, retryOnce = true) {
  try {
    const response = await fetch(url, opts);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    if (retryOnce) {
      await new Promise(res => setTimeout(res, 1000));
      return fetchJSON(url, opts, false);
    }
    throw e;
  }
}

// Add more shared functions here later as we spot them in other apps.
// For example, if "normalizeExchangeForGoogle" is used elsewhere, paste it below.

module.exports = { fetchJSON };