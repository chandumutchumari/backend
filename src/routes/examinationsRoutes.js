const express = require("express");
const router = express.Router();
const {
  getExaminations,
  getSemesterResult,
  getExamMarks,
  getInternalMarks,
} = require("../controllers/examinationsController");

router.get("/", getExaminations);
router.get("/semester", getSemesterResult);
router.get("/marks", getExamMarks);
router.get("/internals", getInternalMarks);

module.exports = router;
