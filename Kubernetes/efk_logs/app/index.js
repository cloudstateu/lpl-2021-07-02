const express = require("express");
const addRequestId = require('express-request-id');
const { DateTime } = require("luxon");

const app = express();
app.use(addRequestId());

app.get("/", (req, res) => {
  logger.log(req.id, 'INFO', `Received request /. Redirecting to /ok.`);
  res.redirect('/ok');
});

app.get("/ok", (req, res) => {
  logger.log(req.id, 'INFO', `Received request /ok.`);
  res.json({status: 'ok', time: DateTime.now().toISO(), data: null});
})

app.get("/error", (req, res) => {
  logger.log(req.id, 'INFO', `Received request /error. This will cause an error.`);
  throw new Error("Expected error!");
});

app.use(function (err, req, res, next) {
  logger.log(req.id, 'ERROR', err.stack)
  res.status(500).json({status: "error", time: DateTime.now().toISO(), data: { err: err.message, stack: err.stack }});
});

const logger = {
  log: (requestId, level, message, namespace = 'index.js') => {
    // const msg = [
    //   DateTime.now().toISO(),
    //   requestId,
    //   level,
    //   namespace,
    //   message
    // ].join('|');
    const msg = {
      time: DateTime.now().toISO(),
      requestId,
      level,
      namespace,
      message
    }
    console.log(JSON.stringify(msg));
  }
};

const port = 8080;
app.listen(port, () => {
  console.log(`Running on http://localhost:${port}`);
});