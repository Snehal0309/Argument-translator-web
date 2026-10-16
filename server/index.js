import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const ORIGIN = process.env.CLIENT_ORIGIN || "*";
const app = express();
app.use(cors({ origin: ORIGIN }));
app.get("/health", (_, res) => res.send("ok")); // ping this with UptimeRobot

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN } });

const LANGS = { "hi-IN": "Hindi", "ta-IN": "Tamil", "mr-IN": "Marathi", "en-IN": "English", "te-IN": "Telugu", "bn-IN": "Bengali", "gu-IN": "Gujarati", "kn-IN": "Kannada" };
const rooms = new Map(); // roomId -> Map(socketId -> { name, lang })

// Translation via Gemini free tier, with retry + model fallback (503s happen).
const MODELS = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest").split(",");

async function callGemini(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }),
  });
  const j = await r.json();
  if (!r.ok) {
    const err = new Error(String(r.status));
    err.status = r.status;
    err.body = JSON.stringify(j).slice(0, 200);
    throw err;
  }
  return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function translate(text, from, to, intensity) {
  const prompt =
    `Translate from ${LANGS[from] || from} to ${LANGS[to] || to}. ` +
    `This is a heated live argument. Keep the emotion, interruptions, sarcasm, hedges and rudeness level exactly. ` +
    `The speaker's voice was ${intensity}. Do not soften or censor. Output ONLY the translation.\n\n${text}`;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const t = await callGemini(model, prompt);
        if (t) return t;
      } catch (e) {
        console.error("Gemini", model, e.status || e.message, e.body || "");
        if (e.status === 404 || e.status === 400) break; // wrong model/key: try next model
        await new Promise((res) => setTimeout(res, 600));
      }
    }
  }
  return `[translation failed] ${text}`;
}

io.on("connection", (socket) => {
  let roomId = null;

  socket.on("join", ({ room, name, lang }) => {
    roomId = room;
    socket.join(room);
    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room).set(socket.id, { name, lang });
    io.to(room).emit("peers", [...rooms.get(room).entries()].map(([id, p]) => ({ id, ...p })));
  });

  // live partial captions (untranslated) so the other person sees overlap instantly
  socket.on("partial", (text) => {
    if (roomId) socket.to(roomId).emit("peer-partial", { from: socket.id, text });
  });

  // finished chunk: translate separately for every other person in the room
  socket.on("final", async ({ text, intensity = "calm" }) => {
    const members = rooms.get(roomId);
    if (!members || !text) return;
    const me = members.get(socket.id);
    const id = `${Date.now()}-${socket.id}`;
    socket.emit("message", { id, mine: true, original: text, translated: null, intensity, name: me.name });
    for (const [sid, peer] of members) {
      if (sid === socket.id) continue;
      const translated = peer.lang === me.lang ? text : await translate(text, me.lang, peer.lang, intensity);
      io.to(sid).emit("message", { id, mine: false, original: text, translated, intensity, name: me.name });
    }
  });

  socket.on("disconnect", () => {
    const members = rooms.get(roomId);
    if (!members) return;
    members.delete(socket.id);
    if (members.size === 0) rooms.delete(roomId);
    else io.to(roomId).emit("peers", [...members.entries()].map(([id, p]) => ({ id, ...p })));
  });
});

server.listen(process.env.PORT || 4000, () => console.log("server up"));
