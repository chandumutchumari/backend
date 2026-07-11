const axios = require("axios");
const browser = require("./browser");

const SRM_LOGIN_URL = "https://student.srmap.edu.in/srmapstudentcorner/StudentLoginPage";
const CAPTCHA_SELECTOR = "img[src*='captchas']";
const MIN_CAPTCHA_LENGTH = 4;
const CAPTCHA_RETRY_COUNT = 3;
const CAPTCHA_POLL_INTERVAL_MS = 5000;
const CAPTCHA_POLL_MAX_ATTEMPTS = 12;

const TWO_CAPTCHA_API_KEY = process.env.TWO_CAPTCHA_API_KEY || process.env.CAPTCHA_API_KEY || null;
const USE_2CAPTCHA = Boolean(TWO_CAPTCHA_API_KEY);

let ocrWorker = null;
let ocrReady = false;
let createWorker = null;

async function ensureOcrWorker() {
  if (ocrReady) return;
  if (!createWorker) {
    try {
      ({ createWorker } = require("tesseract.js"));
    } catch (error) {
      throw new Error(
        "OCR support is unavailable because the tesseract.js dependency is not installed. Run `npm install` in the backend folder or install dependencies manually."
      );
    }
  }

  ocrWorker = await createWorker();
  await ocrWorker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    tessedit_pageseg_mode: "7",
    preserve_interword_spaces: "0",
  });
  ocrReady = true;
}

function normalizeCaptchaText(text = "") {
  return String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

async function captureCaptchaImage(page) {
  const captchaLocator = page.locator(CAPTCHA_SELECTOR);
  await captchaLocator.waitFor({ state: "visible", timeout: 60000 });
  await captchaLocator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  return await captchaLocator.screenshot({ type: "png" });
}

async function solveCaptcha(imageBuffer) {
  await ensureOcrWorker();
  const { data } = await ocrWorker.recognize(imageBuffer);
  return normalizeCaptchaText(data?.text);
}

async function fillLoginCredentials(page, applicationNumber, password) {
  await page.locator("#UserName").fill(String(applicationNumber));
  await page.locator("#AuthKey").fill(String(password));

  await page.evaluate(
    ([user, pass]) => {
      const hiddenUser = document.querySelector("#txtUserName");
      const hiddenPass = document.querySelector("#txtAuthKey");
      if (hiddenUser) hiddenUser.value = user;
      if (hiddenPass) hiddenPass.value = pass;

      const mainUser = document.querySelector("#UserName");
      const mainPass = document.querySelector("#AuthKey");
      if (mainUser) mainUser.value = user;
      if (mainPass) mainPass.value = pass;
    },
    [String(applicationNumber), String(password)],
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function solveCaptchaWith2Captcha(imageBuffer) {
  if (!USE_2CAPTCHA) return null;

  const imageBase64 = imageBuffer.toString("base64");
  const form = new URLSearchParams();
  form.append("key", TWO_CAPTCHA_API_KEY);
  form.append("method", "base64");
  form.append("body", imageBase64);
  form.append("json", "1");

  const submitResponse = await axios.post("http://2captcha.com/in.php", form.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000,
  });

  if (!submitResponse?.data?.status || submitResponse.data.status !== 1) {
    console.error("2Captcha submit failed", submitResponse.data);
    return null;
  }

  const requestId = submitResponse.data.request;
  let attempt = 0;
  while (attempt < CAPTCHA_POLL_MAX_ATTEMPTS) {
    await sleep(CAPTCHA_POLL_INTERVAL_MS);
    const pollResponse = await axios.get("http://2captcha.com/res.php", {
      params: {
        key: TWO_CAPTCHA_API_KEY,
        action: "get",
        id: requestId,
        json: 1,
      },
      timeout: 30000,
    });

    if (!pollResponse?.data) {
      attempt += 1;
      continue;
    }

    if (pollResponse.data.status === 1) {
      return normalizeCaptchaText(pollResponse.data.request || "");
    }

    if (pollResponse.data.request === "CAPCHA_NOT_READY") {
      attempt += 1;
      continue;
    }

    console.error("2Captcha solved failed", pollResponse.data);
    return null;
  }

  console.error("2Captcha timed out waiting for result");
  return null;
}

async function solveCaptchaFromPage(page, attempts = CAPTCHA_RETRY_COUNT) {
  let lastResult = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const imageBuffer = await captureCaptchaImage(page);
    let text = await solveCaptcha(imageBuffer);
    if (!text && USE_2CAPTCHA) {
      text = await solveCaptchaWith2Captcha(imageBuffer);
    }

    lastResult = text;
    if (text.length >= MIN_CAPTCHA_LENGTH) {
      return text;
    }
    await page.waitForTimeout(250);
  }

  if (USE_2CAPTCHA && !lastResult) {
    const imageBuffer = await captureCaptchaImage(page);
    lastResult = await solveCaptchaWith2Captcha(imageBuffer);
  }

  return lastResult;
}

async function loginSRM({ applicationNumber, password, sessionId } = {}) {
  if (!applicationNumber || !password) {
    throw new Error("Application number and password are required");
  }

  const session = sessionId ? browser.getSession(sessionId) : null;
  const usedSession = session || (await browser.createBrowserSession());

  try {
    const page = usedSession.page;
await page.goto(
  "https://student.srmap.edu.in/srmapstudentcorner/StudentLoginPage",
  {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  }
);
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => undefined);

    let captchaText = await solveCaptchaFromPage(page);
    if (!captchaText || captchaText.length < MIN_CAPTCHA_LENGTH) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
      captchaText = await solveCaptchaFromPage(page);
    }

    if (!captchaText || captchaText.length < MIN_CAPTCHA_LENGTH) {
      throw new Error("Unable to solve captcha automatically. Please try again.");
    }

    await fillLoginCredentials(page, applicationNumber, password);
    await page.locator("#ccode").fill(captchaText);

    const submitButton = page.locator("button[type=submit], input[type=submit]").first();
    const loginResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/StudentLoginToPortal"),
        { timeout: 15000 },
      )
      .catch(() => null);

    await submitButton.click({ force: true });
    const loginResponse = await loginResponsePromise;

    return await processLoginOutcome(page, usedSession, loginResponse);
  } catch (error) {
    if (!sessionId) {
      await browser.closeSession(usedSession.sessionId);
    }
    console.error("SRM Login Error:", error);
    throw new Error(error.message || "Login process failed. Check your network connection.");
  }
}

/**
 * STEP 1: Start Login and optionally return a captcha image.
 */
async function startSRMLogin({ applicationNumber, password } = {}) {
  const session = await browser.createBrowserSession();

  try {
    const page = session.page;

    if (applicationNumber && password) {
      session.form = {
        applicationNumber: String(applicationNumber),
        password: String(password),
      };
    } else {
      session.form = {};
    }

    await page.goto(SRM_LOGIN_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
    const captchaBuffer = await captureCaptchaImage(page);
    const captchaImage = `data:image/png;base64,${captchaBuffer.toString("base64")}`;

    session.status = "awaiting-captcha";

    return {
      success: true,
      captchaImage,
      sessionId: session.sessionId,
    };
  } catch (error) {
    await browser.closeSession(session.sessionId);
    console.error("SRM Start Login Error:", error);
    throw new Error("Failed to initialize SRM portal. Try again.");
  }
}

async function completeSRMLogin({ sessionId, captcha, applicationNumber, password } = {}) {
  if (sessionId && captcha) {
    const session = browser.getSession(sessionId);
    if (!session) throw new Error("Session expired. Please restart the login.");
    return loginWithCaptcha({ session, captcha, applicationNumber, password });
  }

  return loginSRM({ sessionId, applicationNumber, password });
}

async function loginWithCaptcha({ session, captcha, applicationNumber, password }) {
  if (!captcha) throw new Error("Captcha is required");

  const page = session.page;
  const captchaInputSelector = "#ccode";
  await page.locator(captchaInputSelector).waitFor({ state: "visible", timeout: 10000 });

  const credentials = {
    applicationNumber: applicationNumber || session.form?.applicationNumber,
    password: password || session.form?.password,
  };

  if (!credentials.applicationNumber || !credentials.password) {
    const visibleUser = await page.locator("#UserName").inputValue().catch(() => "");
    const visiblePassword = await page.locator("#AuthKey").inputValue().catch(() => "");
    credentials.applicationNumber ||= visibleUser;
    credentials.password ||= visiblePassword;
  }

  if (!credentials.applicationNumber || !credentials.password) {
    throw new Error("Credentials are missing from the login session. Please restart authentication.");
  }

  await fillLoginCredentials(page, credentials.applicationNumber, credentials.password);
  await page.locator(captchaInputSelector).fill(String(captcha));

  const submitButton = page.locator("button[type=submit], input[type=submit]").first();
  const loginResponsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/StudentLoginToPortal"),
      { timeout: 15000 },
    )
    .catch(() => null);

  await submitButton.click({ force: true });
  return await processLoginOutcome(page, session, loginResponsePromise);
}

async function processLoginOutcome(page, session, loginResponse) {
  if (loginResponse) {
    const body = await loginResponse.text().catch(() => "");
    const lower = body.toLowerCase();
    const status = loginResponse.status();
    const locationHeader = loginResponse.headers()["location"] || "";

    if (
      lower.includes("captcha invalid") ||
      lower.includes("invalid password") ||
      lower.includes("invalid credentials") ||
      lower.includes("invalid user") ||
      lower.includes("invalid username") ||
      lower.includes("invalid login")
    ) {
      const immediateError = await page.locator("#divmsg").textContent().catch(() => null);
      await browser.closeSession(session.sessionId);
      return {
        success: false,
        message: immediateError?.trim() || "Invalid Credentials or CAPTCHA",
      };
    }

    if (
      status >= 300 ||
      lower.includes("welcome") ||
      lower.includes("logout") ||
      lower.includes("dashboard") ||
      lower.includes("student corner") ||
      lower.includes("my profile") ||
      lower.includes("attendance") ||
      locationHeader.toLowerCase().includes("studentdashboard")
    ) {
      session.status = "authenticated";
      session.authenticatedUrl = page.url();
      return {
        success: true,
        message: "Login Successful",
        sessionId: session.sessionId,
        finalUrl: page.url(),
      };
    }
  }

  const pageOutcome = await page
    .waitForFunction(
      () => {
        const divmsg = document.querySelector("#divmsg");
        if (divmsg?.textContent?.trim().length) return "error";
        const form = document.querySelector("#frmSL");
        if (!form) return "success";
        const bodyText = document.body.innerText.toLowerCase();
        if (
          bodyText.includes("welcome") ||
          bodyText.includes("logout") ||
          bodyText.includes("dashboard") ||
          bodyText.includes("student corner") ||
          bodyText.includes("my profile") ||
          bodyText.includes("attendance")
        ) {
          return "success";
        }
        return false;
      },
      { timeout: 3000 },
    )
    .catch(() => null);

  if (pageOutcome === "error") {
    const immediateError = await page.locator("#divmsg").textContent().catch(() => null);
    await browser.closeSession(session.sessionId);
    return {
      success: false,
      message: immediateError?.trim() || "Invalid Credentials or CAPTCHA",
    };
  }

  if (pageOutcome === "success") {
    session.status = "authenticated";
    session.authenticatedUrl = page.url();
    return {
      success: true,
      message: "Login Successful",
      sessionId: session.sessionId,
      finalUrl: page.url(),
    };
  }

  const immediateError = await page.locator("#divmsg").textContent().catch(() => null);
  if (immediateError && immediateError.trim()) {
    await browser.closeSession(session.sessionId);
    return {
      success: false,
      message: immediateError.trim(),
    };
  }

  const isSuccessful = await detectLoginSuccess(page);
  if (!isSuccessful) {
    const errorMsg = await page.locator("#divmsg").textContent().catch(() => "Login failed");
    await browser.closeSession(session.sessionId);
    return {
      success: false,
      message: errorMsg?.trim() || "Invalid Credentials or CAPTCHA",
    };
  }

  session.status = "authenticated";
  session.authenticatedUrl = page.url();
  return {
    success: true,
    message: "Login Successful",
    sessionId: session.sessionId,
    finalUrl: page.url(),
  };
}

/**
 * HELPER: Detect Login Success
 * Checks the real portal for indicators of a successful entry.
 */
async function detectLoginSuccess(page) {
  const currentUrl = (page.url() || "").toLowerCase();
  if (currentUrl.includes("studentloginpage")) return false;

  const content = await page.content().then((c) => c.toLowerCase());
  const successKeys = ["welcome", "logout", "dashboard", "student corner", "attendance", "profile"];
  return successKeys.some((key) => content.includes(key));
}

async function logoutSRMSession(sessionId) {
  return browser.closeSession(sessionId);
}

module.exports = {
  startSRMLogin,
  completeSRMLogin,
  logoutSRMSession,
  getSession: browser.getSession,
  closeSession: browser.closeSession,
};
