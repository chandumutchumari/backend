const { getFeedbackData } = require("../services/feedbackService");

exports.getFeedback = async (_req, res) => {
  try {
    res.json(await getFeedbackData());
  } catch (error) {
    res.status(500).json({ error: "Failed to load feedback" });
  }
};
