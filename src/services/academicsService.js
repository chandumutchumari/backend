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

async function openSubjectsPage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const academicNav = page.getByText("Academic").first();
  if (await academicNav.count()) {
    await academicNav.click().catch(() => undefined);
  }

  let subjectLink = page.getByRole("link", { name: /Student\s*Wise\s*Subjects/i }).first();
  if (!(await subjectLink.count())) {
    subjectLink = page.getByText(/Student\s*Wise\s*Subjects/i).first();
  }

  if (await subjectLink.count()) {
    await subjectLink.click().catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await page.getByRole("columnheader", { name: /Code/i }).first().waitFor({ timeout: 15000 }).catch(() => undefined);
  }
}

async function scrapeSubjects(page) {
  try {
    const semester = await page.evaluate(() => {
      const romanToArabic = (value) => {
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
      };

      const text = Array.from(document.querySelectorAll("tr")).map((tr) => tr.textContent || "").join("\n");
      const match = text.match(/Semester\s*[:\-]?\s*([0-9]+|[IVXLCDM]+)/i);
      if (!match) return "";
      const candidate = match[1].trim().toUpperCase();
      if (/^[0-9]+$/.test(candidate)) return candidate;
      return romanToArabic(candidate) || "";
    });

    const subjects = await page.evaluate(() => {
      const table = Array.from(document.querySelectorAll("table")).find((tableElement) => {
        const headers = Array.from(tableElement.querySelectorAll("th")).map((th) => (th.textContent || "").trim().toLowerCase());
        return headers.includes("code") && headers.includes("description") && headers.includes("credit");
      });

      if (!table) return null;

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      return rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
        const code = cells[0] ?? "";
        const description = cells[1] ?? "";
        const creditText = cells[2] ?? "";
        const credits = parseFloat(creditText.replace(/[^0-9.]/g, ""));
        return {
          semester: "",
          code,
          name: description,
          credits: Number.isFinite(credits) ? credits : 0,
        };
      });
    });

    if (!Array.isArray(subjects)) {
      return null;
    }

    return subjects.map((subject) => ({ ...subject, semester: semester || subject.semester || "" }));
  } catch (error) {
    return null;
  }
}

async function openAttendancePage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const academicNav = page.getByText("Academic").first();
  if (await academicNav.count()) {
    await academicNav.click().catch(() => undefined);
  }

  let attendanceLink = page.getByRole("link", { name: /Attendance/i }).first();
  if (!(await attendanceLink.count())) {
    attendanceLink = page.getByText(/Attendance/i).first();
  }

  if (await attendanceLink.count()) {
    await attendanceLink.click().catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  }

  await page.locator("table").first().waitFor({ timeout: 15000 }).catch(() => undefined);
}

async function submitAttendanceCode(page, code) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const academicNav = page.getByText("Academic").first();
  if (await academicNav.count()) {
    await academicNav.click().catch(() => undefined);
  }

  const attendanceCodeLink = page.getByRole("link", { name: /Student Attendance/i }).first();
  if (await attendanceCodeLink.count()) {
    await attendanceCodeLink.click().catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.locator("#txtCode").first().waitFor({ timeout: 15000 }).catch(() => undefined);
  await page.locator("#txtCode").fill(String(code || ""));
  await page.getByRole("button", { name: /Submit/i }).click().catch(() => undefined);
  await page.waitForTimeout(1500);

  return {
    success: true,
    message: "Attendance code submitted.",
  };
}

async function scrapeAttendance(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    return rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
        if (cells.length < 7) return null;

        const [subjectCode, subjectDescription, classesConducted, attendanceEntered, present, absent, attendancePercentage] = cells;

        return {
          subjectCode: subjectCode.trim(),
          subjectDescription: subjectDescription.trim(),
          classesConducted: Number(classesConducted.replace(/[^0-9.]/g, "")) || 0,
          attendanceEntered: Number(attendanceEntered.replace(/[^0-9.]/g, "")) || 0,
          present: Number(present.replace(/[^0-9.]/g, "")) || 0,
          absent: Number(absent.replace(/[^0-9.]/g, "")) || 0,
          attendancePercentage: parseFloat(attendancePercentage.replace(/[^0-9.]/g, "")) || 0,
        };
      })
      .filter(Boolean);
  });
}

async function openTimetablePage(page) {
  const session = getAuthenticatedSession();
  const startUrl = session?.authenticatedUrl || SRM_LOGIN_URL;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const academicNav = page.getByText("Academic").first();
  if (await academicNav.count()) {
    await academicNav.click().catch(() => undefined);
  }

  let timetableLink = page.getByRole("link", { name: /Time\s*Table/i }).first();
  if (!(await timetableLink.count())) {
    timetableLink = page.getByText(/Time\s*Table/i).first();
  }

  if (await timetableLink.count()) {
    await timetableLink.click().catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  }

  await page.locator("table").first().waitFor({ timeout: 15000 }).catch(() => undefined);
}

async function scrapeTimetable(page) {
  return page.evaluate(() => {
    const normalizeHeader = (value) => {
      const text = String(value).trim().toLowerCase();
      if (/time/i.test(text)) return "time";
      if (/^mon(day)?$/i.test(text)) return "Mon";
      if (/^tue(sday)?$/i.test(text)) return "Tue";
      if (/^wed(nesday)?$/i.test(text)) return "Wed";
      if (/^thu(rsday)?$/i.test(text)) return "Thu";
      if (/^fri(day)?$/i.test(text)) return "Fri";
      if (/^sat(urday)?$/i.test(text)) return "Sat";
      return null;
    };

    const tables = Array.from(document.querySelectorAll("table"));
    if (!tables.length) return [];

    const table = tables.find((tableElement) => {
      const headers = Array.from(tableElement.querySelectorAll("th,td")).slice(0, 8).map((cell) => (cell.textContent || "").trim().toLowerCase());
      return headers.some((h) => /time/i.test(h)) && headers.some((h) => /mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?/.test(h));
    }) || tables[0];

    let headerCells = Array.from(table.querySelectorAll("thead tr th, thead tr td"));
    if (!headerCells.length) {
      const firstRow = table.querySelector("tr");
      headerCells = firstRow ? Array.from(firstRow.querySelectorAll("th,td")) : [];
    }

    const headers = headerCells.map((cell) => normalizeHeader(cell.textContent || "") || "");
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    const rows = bodyRows.length ? bodyRows : Array.from(table.querySelectorAll("tr")).slice(1);

    return rows
      .map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
        const item = { time: "", Mon: "", Tue: "", Wed: "", Thu: "", Fri: "", Sat: "" };

        cells.forEach((value, index) => {
          const key = headers[index];
          if (key && Object.prototype.hasOwnProperty.call(item, key)) {
            item[key] = value;
          }
        });

        return item;
      })
      .filter((row) => row.time || row.Mon || row.Tue || row.Wed || row.Thu || row.Fri || row.Sat);
  });
}

exports.getAcademicsData = async () => withSessionMetadata({
  attendance: [],
  registration: [],
  subjects: [],
  timetable: [],
});

exports.getAttendanceData = async () => {
  const session = getAuthenticatedSession();
  if (!session) {
    return [];
  }

  return withServicePage(async (page) => {
    await openAttendancePage(page);
    const attendance = await scrapeAttendance(page);
    return Array.isArray(attendance) ? attendance : [];
  });
};

exports.getSubjectsData = async () => {
  const session = getAuthenticatedSession();
  if (!session) {
    return withSessionMetadata([]);
  }

  return withServicePage(async (page) => {
    await openSubjectsPage(page);
    const subjects = await scrapeSubjects(page);
    return Array.isArray(subjects) ? subjects : [];
  });
};

exports.getTimetableData = async () => {
  const session = getAuthenticatedSession();
  if (!session) {
    return [
      { time: "09:00 - 10:00", Mon: "Data Structures", Tue: "DBMS", Wed: "OS", Thu: "Networks", Fri: "SE", Sat: "—" },
      { time: "10:00 - 11:00", Mon: "DBMS", Tue: "OS", Wed: "SE", Thu: "Data Structures", Fri: "Networks", Sat: "—" },
    ];
  }

  return withServicePage(async (page) => {
    await openTimetablePage(page);
    const timetable = await scrapeTimetable(page);
    return Array.isArray(timetable) ? timetable : [];
  });
};

exports.submitAttendanceCode = async (code) => {
  const session = getAuthenticatedSession();
  if (!session) {
    return { success: false, message: "No authenticated session available." };
  }

  return withServicePage(async (page) => submitAttendanceCode(page, code));
};
