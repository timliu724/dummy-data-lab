import '../vendor/papaparse.browser.min.js';

const Papa = globalThis.Papa;

if (!Papa || typeof Papa.parse !== 'function') {
  throw new Error('The local Papa Parse runtime is unavailable.');
}

export default Papa;
