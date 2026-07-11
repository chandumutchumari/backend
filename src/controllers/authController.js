const {
  startSRMLogin,
  completeSRMLogin,
  logoutSRMSession,
} = require("../services/loginService");

exports.startLogin = async (req, res) => {
  try {
    const applicationNumber = req.body?.applicationNumber;
    const password = req.body?.password ?? req.body?.dob;

    const result = await startSRMLogin({ applicationNumber, password });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Check your Network Connection",
    });
  }
};

exports.completeLogin = async (req, res) => {
  try {
    const { sessionId, captcha, applicationNumber, password } = req.body || {};
    const result = await completeSRMLogin({ sessionId, captcha, applicationNumber, password });
    return res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Unable to complete login",
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const result = await logoutSRMSession(req.body?.sessionId);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Unable to log out",
    });
  }
};
