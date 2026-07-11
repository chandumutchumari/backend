const express = require("express");
const router = express.Router();
const {
  startLogin,
  completeLogin,
  logout,
} = require("../controllers/authController");

router.post("/start", startLogin);
router.post("/login", completeLogin);
router.post("/logout", logout);

module.exports = router;
