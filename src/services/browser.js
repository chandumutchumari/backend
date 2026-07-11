const { chromium } = require("playwright");
const { randomUUID } = require("crypto");
const { getChromiumLaunchOptions } = require("../config/playwright");

const sessions = new Map();
let activeSessionId = null;
let SESSION_TIMEOUT_MS = 20 * 60 * 1000;

const SRM_LOGIN_URL = "https://student.srmap.edu.in/srmapstudentcorner/StudentLoginPage";

// Reuse a single browser instance to avoid expensive cold starts.
let browserSingleton = null;
async function ensureBrowser() {
  if (browserSingleton) return browserSingleton;
  browserSingleton = await chromium.launch(getChromiumLaunchOptions());

  // ensure we close the browser on process exit
  const tryClose = async () => {
    try {
      await browserSingleton?.close();
    } catch (e) {
      // ignore
    }
  };
  process.once("exit", tryClose);
  process.once("SIGINT", () => {
    tryClose().finally(() => process.exit(0));
  });

  return browserSingleton;
}

// Pool of pre-created contexts/pages to speed up first-page loads (captcha etc.)
const contextPool = [];

async function precreateContext(url) {
  try {
    const browser = await ensureBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    // Try to warm the page; ignore failures and keep the context ready
    try {
      if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => undefined);
    } catch (e) {
      // ignore
    }
    contextPool.push({ context, page });
    // keep pool small
    if (contextPool.length > 3) {
      const old = contextPool.shift();
      old.page?.close().catch(() => undefined);
      old.context?.close().catch(() => undefined);
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function createBrowserSession() {
  const browser = await ensureBrowser();

  // If we have a pre-created context in the pool, reuse it for instant navigation
  if (contextPool.length > 0) {
    const pooled = contextPool.shift();
    const { context, page } = pooled;
    const sessionId = randomUUID();
    const session = {
      sessionId,
      browser,
      context,
      page,
      status: "initialized",
      createdAt: new Date().toISOString(),
    };
    sessions.set(sessionId, session);
    activeSessionId = sessionId;
    return session;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  const sessionId = randomUUID();
  const session = {
    sessionId,
    // we keep reference to the shared browser but close per-session context/page
    browser,
    context,
    page,
    status: "initialized",
    createdAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);
  activeSessionId = sessionId;
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function getActiveSession() {
  if (!activeSessionId) {
    return null;
  }

  return sessions.get(activeSessionId) || null;
}

function getAuthenticatedSession() {
  const session = getActiveSession();
  return session?.status === "authenticated" ? session : null;
}

function setActiveSession(sessionId) {
  const session = getSession(sessionId);
  if (session) {
    activeSessionId = sessionId;
    return true;
  }
  return false;
}

async function createServicePage() {
  const session = getAuthenticatedSession();
  if (!session) {
    throw new Error("No authenticated session available");
  }

  const page = await session.context.newPage();
  page.setDefaultTimeout(15000);

  const initialUrl = session.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(initialUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  return page;
}

async function withServicePage(callback) {
  const page = await createServicePage();
  try {
    return await callback(page);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  sessions.delete(sessionId);
  if (activeSessionId === sessionId) {
    activeSessionId = null;
  }

  try {
    await session.page?.close().catch(() => undefined);
  } catch (error) {
    // Ignore cleanup errors.
  }

  try {
    await session.context?.close().catch(() => undefined);
  } catch (error) {
    // Ignore cleanup errors.
  }

  // Do not close the shared browser instance here (browserSingleton is reused).

  return true;
}

module.exports = {
  createBrowserSession,
  getSession,
  getActiveSession,
  getAuthenticatedSession,
  setActiveSession,
  closeSession,
  precreateContext,
  createServicePage,
  withServicePage,
  SRM_LOGIN_URL,
};
