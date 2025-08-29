export const config = {
  runtime: "nodejs"
};

import WebSocket from "ws";

export default function handler(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(": connected\n\n");

  const apiKey = process.env.SECAPI_KEY;
  if (!apiKey) {
    res.write("event: error\ndata: Missing SECAPI_KEY\n\n");
    res.end();
    return;
  }

  const upstreamUrl = `wss://stream.sec-api.io?apiKey=${encodeURIComponent(apiKey)}`;

  let ws;

  try {
    ws = new WebSocket(upstreamUrl);

    ws.on("open", () => {
      res.write("event: open\ndata: connected to sec-api\n\n");
    });

    ws.on("message", (msg) => {
      res.write(`data: ${msg}\n\n`);
    });

    ws.on("error", (err) => {
      console.error("Upstream WS error", err);
      res.write(`event: error\ndata: ${err.message}\n\n`);
      res.end();
    });

    ws.on("close", () => {
      res.write("event: close\ndata: upstream closed\n\n");
      res.end();
    });

    req.on("close", () => {
      ws.close();
    });
  } catch (err) {
    console.error("failed to create upstream ws", err);
    res.write(`event: error\ndata: ${err.message}\n\n`);
    res.end();
  }
}