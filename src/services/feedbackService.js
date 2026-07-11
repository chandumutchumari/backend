const { getAuthenticatedSession } = require("./browser");

exports.getFeedbackData = async () => {
  const session = getAuthenticatedSession();
  const disabledResponse = {
    enabled: false,
    message: "Feedback is not enabled by the administrator.",
    completed: 0,
    pending: 0,
    history: [],
  };

  if (session?.page) {
    return {
      ...disabledResponse,
      source: "playwright-session",
      sessionId: session.sessionId,
    };
  }

  return disabledResponse;
};
