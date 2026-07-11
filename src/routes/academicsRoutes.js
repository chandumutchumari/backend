const express = require("express");
const router = express.Router();
const {
  getAcademics,
  getAttendance,
  getSubjects,
  getTimetable,
  submitAttendanceCode,
} = require("../controllers/academicsController");

router.get("/", getAcademics);
router.get("/attendance", getAttendance);
router.get("/subjects", getSubjects);
router.get("/timetable", getTimetable);
router.post("/attendance-code", submitAttendanceCode);

module.exports = router;
