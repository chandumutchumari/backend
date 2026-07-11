const {
  getAcademicsData,
  getAttendanceData,
  getSubjectsData,
  getTimetableData,
  submitAttendanceCode,
} = require("../services/academicsService");

exports.getAcademics = async (_req, res) => {
  try {
    res.json(await getAcademicsData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load academics" });
  }
};

exports.getAttendance = async (_req, res) => {
  try {
    res.json(await getAttendanceData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load attendance" });
  }
};

exports.getSubjects = async (_req, res) => {
  try {
    res.json(await getSubjectsData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load subjects" });
  }
};

exports.getTimetable = async (_req, res) => {
  try {
    res.json(await getTimetableData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load timetable" });
  }
};

exports.submitAttendanceCode = async (req, res) => {
  try {
    const result = await submitAttendanceCode(req.body?.code);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to submit attendance code" });
  }
};
