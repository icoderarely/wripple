require("winston-mongodb");
const winston = require("winston");

const logger = winston.createLogger({
  // Combine timestamp + JSON format and send logs to console, file, and MongoDB.
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      level: "debug",
    }),
    new winston.transports.File({
      filename: "logs/errors.log",
      level: "error",
    }),
    new winston.transports.MongoDB({
      db: process.env.DB,
      level: "error",
    }),
  ],
});

process.on("uncaughtException", (err) => {
  // Capture unexpected exceptions, flush logs, then exit to avoid bad state.
  logger.error("Uncaught Exception", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

process.on("unhandledRejection", (err) => {
  // Capture rejected promises without handlers, flush logs, then exit.
  logger.error("Unhandled Promise Rejection", err);
  logger.on("finish", () => {
    process.exit(1);
  });
  logger.end();
});

module.exports = logger;
