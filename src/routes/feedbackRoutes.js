const express = require("express");
const router = express.Router();
const { getFeedback } = require("../controllers/feedbackController");

router.get("/", getFeedback);

module.exports = router;
