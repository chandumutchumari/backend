require("./config/env");

const express = require("express");
const { createCorsMiddleware } = require("./config/cors");
const { setActiveSession } = require("./services/browser");

const app = express();

app.use(createCorsMiddleware());
app.use(express.json());

// Middleware to extract sessionId from Authorization header and set it as active session
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const sessionId = authHeader.slice(7); // Remove "Bearer " prefix
    setActiveSession(sessionId);
  }

  next();
});

const profileRoutes = require("./routes/profileRoutes");
const authRoutes = require("./routes/authRoutes");
const academicsRoutes = require("./routes/academicsRoutes");
const examinationsRoutes = require("./routes/examinationsRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");

app.get("/", (_req, res) => {
  res.json({ status: "Backend Running" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/profile", profileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/academics", academicsRoutes);
app.use("/api/examinations", examinationsRoutes);
app.use("/api/feedback", feedbackRoutes);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

function startServer() {
  const server = app.listen(PORT, HOST, () => {
    console.log(`Backend running on http://${HOST}:${PORT}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Failed to start server: port ${PORT} is already in use`);
    } else {
      console.error("Failed to start server:", error);
    }
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  return server;
}
;
 startServer();
