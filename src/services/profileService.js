const { getAuthenticatedSession, withServicePage, SRM_LOGIN_URL } = require("./browser");
const Student = require("../models/student");
const baseData = {
  studentName: " ",
  registerNumber: " ",
  institution: "-",
  semester: "-",
  program: "-",
  specialization: "-",
  dob: "-",
  gender: "-",
  phone: "-",
  email: "-",
  fatherName: "-",
  motherName: "-",
};

function normalizeValue(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function romanToArabic(value) {
  if (!value) return null;
  const roman = String(value).trim().toUpperCase();
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;

  for (let i = roman.length - 1; i >= 0; i -= 1) {
    const current = map[roman[i]];
    if (!current) return null;
    if (current < prev) {
      total -= current;
    } else {
      total += current;
    }
    prev = current;
  }

  return total > 0 ? total.toString() : null;
}

function normalizeSemester(value) {
  const raw = normalizeValue(value);
  if (!raw) return null;

  const match = raw.match(/(?:Semester\s*[:\-]?\s*)?([0-9]+|[IVXLCDM]+)/i);
  if (!match) return null;

  const candidate = match[1].toUpperCase();
  if (/^[0-9]+$/.test(candidate)) {
    return candidate;
  }

  return romanToArabic(candidate);
}

async function openProfilePage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const profileLink = page.getByRole("link", { name: /Profile/i }).first();
  if (await profileLink.count()) {
    await profileLink.click().catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  }

  await page.waitForSelector("tr", { timeout: 10000 }).catch(() => undefined);
}

exports.getProfileData = async () => {
  const session = getAuthenticatedSession();
  if (!session) {
    return baseData;
  }

  return withServicePage(async (page) => {
    await openProfilePage(page);

    const rows = await page.locator("tr").allTextContents();

    const findValue = (labelRegex) => {
      for (const row of rows) {
        if (labelRegex.test(row)) {
          const parts = row.split(":");
          return parts[1]?.trim() || "";
        }
      }
      return "";
    };

    const splitValue = (value) => {
      if (!value) return { left: "", right: "" };
      const parts = value.split("/");
      return {
        left: parts[0]?.trim() || "",
        right: parts[1]?.trim() || "",
      };
    };

    const liveName = normalizeValue(findValue(/Student Name/i)) || "";
    const liveRegisterNumber = normalizeValue(findValue(/Register|Reg No/i)) || "";
    const liveSemester = normalizeSemester(findValue(/Semester/i)) || "";
    const liveInstitution = normalizeValue(findValue(/Institution/i)) || "";
    const liveProgramRaw = normalizeValue(findValue(/Program/i)) || "";
    const liveSpecialization = normalizeValue(findValue(/Specialization/i)) || "";
    const liveDobGenderRaw = normalizeValue(findValue(/D\.O\.B|DOB|Gender/i)) || "";
    const liveContactRaw = normalizeValue(findValue(/Contact Number|Email/i)) || "";
    const liveParentRaw = normalizeValue(findValue(/Father Name|Mother Name/i)) || "";

    const programSplit = splitValue(liveProgramRaw);
    const dobGenderSplit = splitValue(liveDobGenderRaw);
    const contactSplit = splitValue(liveContactRaw);
    const parentSplit = splitValue(liveParentRaw);

    return {
      studentName: liveName,
      registerNumber: liveRegisterNumber,
      institution: liveInstitution,
      semester: liveSemester,
      program: programSplit.left,
      specialization: liveSpecialization,
      dob: dobGenderSplit.left,
      gender: dobGenderSplit.right,
      phone: contactSplit.left,
      email: contactSplit.right,
      fatherName: parentSplit.left,
      motherName: parentSplit.right,
      accessThrough: "Student Portal",
      source: "playwright-session",
      sessionId: session.sessionId,
    };
  });
};
