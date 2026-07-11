const { chromium } = require("playwright");

const CHROMIUM_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

function getChromiumLaunchOptions() {
  return {
    headless: true,
    args: CHROMIUM_LAUNCH_ARGS,
  };
}

async function createPlaywrightBrowser() {
  return chromium.launch(getChromiumLaunchOptions());
}

module.exports = {
  CHROMIUM_LAUNCH_ARGS,
  getChromiumLaunchOptions,
  createPlaywrightBrowser,
};
