const {
  getExaminationsData,
  getSemesterResultData,
  getInternalMarksData,
  getExamMarkDetailsData,
} = require("../services/examinationsService");

exports.getExaminations = async (_req, res) => {
  try {
    res.json(await getExaminationsData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load examinations" });
  }
};

exports.getSemesterResult = async (_req, res) => {
  try {
    res.json(await getSemesterResultData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load semester result" });
  }
};

exports.getExamMarks = async (_req, res) => {
  try {
    res.json(await getExamMarkDetailsData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load exam marks" });
  }
};

exports.getInternalMarks = async (_req, res) => {
  try {
    res.json(await getInternalMarksData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load internal marks" });
  }
};
