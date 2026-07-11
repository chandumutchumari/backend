const { getAuthenticatedSession, withServicePage, SRM_LOGIN_URL } = require("./browser");

function withSessionMetadata(data) {
  const session = getAuthenticatedSession();
  if (!session) {
    return data;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return {
    ...data,
    source: "playwright-session",
    sessionId: session.sessionId,
  };
}

exports.getExaminationsData = async () => withSessionMetadata({
  semester: [],
  marks: [],
  registration: [],
  internals: [],
});

async function openSemesterResultsPage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const examNav = page.getByText("Examination").first();
  if (await examNav.count()) {
    await examNav.click().catch(() => undefined);
  }

  const currentSemesterLink = page.getByRole("link", { name: /Current Semester Results/i }).first();
  if (await currentSemesterLink.count()) {
    await currentSemesterLink.click().catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.getByText(/S\.G\.P\.A/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
}

async function openExamMarkDetailsPage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const examNav = page.getByText("Examination").first();
  if (await examNav.count()) {
    await examNav.click().catch(() => undefined);
  }

  const examMarkDetailsLink = page.getByRole("link", { name: /Exam Mark Details/i }).first();
  if (await examMarkDetailsLink.count()) {
    await examMarkDetailsLink.click().catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
}

async function openInternalMarksPage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const examNav = page.getByText("Examination").first();
  if (await examNav.count()) {
    await examNav.click().catch(() => undefined);
  }

  const internalMarksLink = page.getByRole("link", { name: /Internal Mark Details/i }).first();
  if (await internalMarksLink.count()) {
    await internalMarksLink.click().catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
}

async function scrapeInternalMarks(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    const toNumber = (value) => {
      const num = Number(String(value).replace(/[^\d.]/g, ""));
      return Number.isNaN(num) ? 0 : num;
    };

    const isHeaderRow = (cells) => {
      const joined = cells.join(" ").toLowerCase();
      return (
        joined.includes("name") && joined.includes("mark secured")
        || joined.includes("cla")
        || joined.includes("mid semester exam")
        || joined.includes("semester exam")
        || joined.includes("converted")
      );
    };

    return rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((cell) => (cell.textContent || "").trim());
        if (cells.length < 4 || isHeaderRow(cells)) return null;

        return {
          subjectCode: cells[0] || "",
          subjectDescription: cells[1] || "",
          marksObtained: toNumber(cells[2]),
          maxMarks: toNumber(cells[3]),
        };
      })
      .filter(Boolean);
  });
}

function normalizeSemester(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/Semester\s*[:\-]?\s*([0-9]+|[IVXLCDM]+)/i);
  if (!match) return null;

  const candidate = match[1].toUpperCase();
  if (/^[0-9]+$/.test(candidate)) return candidate;

  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;

  for (let i = candidate.length - 1; i >= 0; i -= 1) {
    const current = map[candidate[i]];
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

async function getLiveGpa(page) {
  try {
    const gpa = await page.evaluate(() => {
      const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
      const rows = Array.from(document.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td, th")).map((cell) => normalize(cell.textContent))
      );

      for (const cells of rows) {
        if (!cells.length) continue;
        const label = normalize(cells[0]).replace(/\s+/g, "").toUpperCase();
        if (/^S\.G\.P\.A$/i.test(label) || /^SGPA$/i.test(label) || /^S\.G\.P\.A\.$/i.test(label)) {
          const valueCell = cells.slice(1).find((cell) => /[0-9]+(\.[0-9]+)?/.test(cell));
          if (valueCell) {
            const parsed = parseFloat(valueCell.replace(/[^0-9.]/g, ""));
            return Number.isFinite(parsed) ? parsed : null;
          }
        }
      }
      return null;
    });

    return gpa;
  } catch (error) {
    return null;
  }
}

async function getLiveCgpa(page) {
  try {
    const examMarkDetailsLink = page.getByRole("link", { name: /Exam Mark Details/i }).first();
    if (await examMarkDetailsLink.count()) {
      await examMarkDetailsLink.click().catch(() => undefined);
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
    }

    const text = await page.locator("body").innerText();
    const match = text.match(/CGPA\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (!match) return null;

    const parsed = parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function getLiveCurrentSemesterResults(page) {
  try {
    return await page.evaluate(() => {
      const normalize = (text) => (text || "").trim();
      const table = Array.from(document.querySelectorAll("table")).find((table) => {
        const content = table.textContent || "";
        return /Semester/i.test(content)
          && /Subject Code/i.test(content)
          && /Subject Description/i.test(content)
          && /Grade/i.test(content)
          && /Result/i.test(content);
      });
      if (!table) return [];

      return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((cell) => normalize(cell.textContent));
        if (cells.length < 6) return null;

        return {
          semester: cells[0] || "",
          subjectCode: cells[1] || "",
          subjectDescription: cells[2] || "",
          credits: Number(cells[3]) || 0,
          grade: cells[4] || "",
          result: cells[5] || "",
        };
      }).filter(Boolean);
    });
  } catch (error) {
    return [];
  }
}

async function getLiveSemester(page) {
  try {
    const semesterText = await page.evaluate(() => {
      const text = Array.from(document.querySelectorAll("tr,td,th")).map((node) => node.textContent || "").join("\n");
      const match = text.match(/Semester\s*[:\-]?\s*([0-9]+|[IVXLCDM]+)/i);
      return match ? match[0] : null;
    });
    return normalizeSemester(semesterText) || null;
  } catch (error) {
    return null;
  }
}

async function getSemesterResultLive(page) {
  await openSemesterResultsPage(page);
  const [semester, gpa, cgpa, currentSemesterResults] = await Promise.all([
    getLiveSemester(page),
    getLiveGpa(page),
    getLiveCgpa(page),
    getLiveCurrentSemesterResults(page),
  ]);
  return { semester, gpa, cgpa, currentSemesterResults };
}

async function getExamMarkDetails(page) {
  await openExamMarkDetailsPage(page);

  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((cell) => (cell.textContent || "").trim());
      if (cells.length < 9) return null;

      return {
        semester: cells[0] || "",
        examMonthYear: cells[1] || "",
        subjectCode: cells[2] || "",
        subjectDescription: cells[3] || "",
        credits: Number(cells[4]) || 0,
        grade: cells[5] || "",
        gradePoints: Number(cells[6]) || 0,
        result: cells[7] || "",
        attempt: cells[8] || "",
      };
    }).filter(Boolean);
  });
}

exports.getSemesterResultData = async () => {
  const fallback = {
    semester: "",
    gpa: 0.0,
    cgpa: 0.0,
    totalCredits: 0,
    rows: [],
    currentSemesterResults: [],
  };

  const session = getAuthenticatedSession();
  if (!session) {
    return withSessionMetadata(fallback);
  }

  const liveData = await withServicePage(async (page) => {
    const liveResult = await getSemesterResultLive(page);
    if (!liveResult.gpa && !liveResult.semester && !liveResult.currentSemesterResults?.length) {
      return null;
    }
    return {
      ...fallback,
      gpa: liveResult.gpa != null ? liveResult.gpa : fallback.gpa,
      cgpa: liveResult.cgpa != null ? liveResult.cgpa : fallback.cgpa,
      semester: liveResult.semester || "",
      currentSemesterResults: liveResult.currentSemesterResults || [],
    };
  });

  return withSessionMetadata(liveData || fallback);
};

exports.getInternalMarksData = async () => {
  const session = getAuthenticatedSession();
  if (!session) {
    return withSessionMetadata([]);
  }

  return withServicePage(async (page) => {
    await openInternalMarksPage(page);
    const internals = await scrapeInternalMarks(page);
    return withSessionMetadata(Array.isArray(internals) ? internals : []);
  });
};

exports.getExamMarkDetailsData = async () => {
  const fallback = [];
  const session = getAuthenticatedSession();
  if (!session) return withSessionMetadata(fallback);

  const liveData = await withServicePage(async (page) => {
    const details = await getExamMarkDetails(page);
    return Array.isArray(details) ? details : fallback;
  });

  return withSessionMetadata(liveData || fallback);
};
