"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
const LANGS = [
  ["hi-IN", "Hindi"], ["ta-IN", "Tamil"], ["mr-IN", "Marathi"], ["en-IN", "English"],
  ["te-IN", "Telugu"], ["bn-IN", "Bengali"], ["gu-IN", "Gujarati"], ["kn-IN", "Kannada"],
];
const langName = (c: string) => LANGS.find((l) => l[0] === c)?.[1] || c;
type Msg = { id: string; mine: boolean; original: string; translated: string | null; intensity: string; name: string };
type Peer = { id: string; name: string; lang: string };

const css = `
.app{min-height:100vh;background:#f1f3f9;color:#1b1f2a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;justify-content:center}
.card{width:100%;max-width:640px;display:flex;flex-direction:column;min-height:100vh;background:#fff;box-shadow:0 0 40px rgba(0,0,0,.06)}
.join{margin:auto;padding:32px;width:100%;max-width:400px}
.join h1{font-size:26px;margin:0 0 4px}
.sub{color:#6b7280;font-size:14px;margin:0 0 20px}
.field{width:100%;padding:12px;border:1px solid #d5d9e4;border-radius:10px;font-size:15px;margin-bottom:12px;background:#fff;color:#1b1f2a;box-sizing:border-box}
.btn{width:100%;padding:13px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
.btn:hover{background:#4338ca}
.hint{font-size:12px;color:#6b7280;margin:10px 0}
.hdr{padding:14px 18px;border-bottom:1px solid #eceef5;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.hdr b{font-size:16px}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;background:#eef0fb;color:#4338ca;margin-right:6px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#9ca3af}
.dot.ok{background:#22c55e}
.small{padding:6px 12px;border:1px solid #d5d9e4;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:#1b1f2a}
.status{padding:10px 18px;font-size:13px;color:#6b7280;background:#fafbff;border-bottom:1px solid #eceef5}
.chat{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px}
.empty{margin:auto;color:#9ca3af;text-align:center;font-size:14px}
.row{display:flex}
.row.mine{justify-content:flex-end}
.bub{max-width:80%;padding:10px 14px;border-radius:16px;line-height:1.35}
.mine .bub{background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
.theirs .bub{background:#eef0f6;color:#1b1f2a;border-bottom-left-radius:4px}
.who{font-size:11px;opacity:.7;margin-bottom:2px}
.orig{font-size:11px;opacity:.6;margin-top:4px}
.heated .t{font-size:19px;font-weight:600}
.shouting .t{font-size:24px;font-weight:800;text-transform:uppercase}
.theirs.heated .bub,.theirs.shouting .bub{background:#fee2e2;color:#991b1b}
.mine.heated .bub{background:#7c3aed}.mine.shouting .bub{background:#be123c}
.live{padding:6px 18px;font-size:13px;color:#6b7280;font-style:italic;min-height:24px}
.live.me{text-align:right}
.bar{padding:14px 18px;border-top:1px solid #eceef5;display:flex;align-items:center;gap:14px}
.mic{padding:12px 20px;border:0;border-radius:999px;background:#4f46e5;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.mic.on{background:#dc2626;animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(220,38,38,.5)}70%{box-shadow:0 0 0 12px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}
.meter{flex:1;height:8px;background:#eceef5;border-radius:99px;overflow:hidden}
.meter i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#eab308,#ef4444);transition:width .1s}
`;

export default function Page() {
  const [room, setRoom] = useState("");
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("");
  const [lang, setLang] = useState("hi-IN");
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [peerLive, setPeerLive] = useState("");
  const [myLive, setMyLive] = useState("");
  const [listening, setListening] = useState(false);
  const [meter, setMeter] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");

  const sock = useRef<Socket | null>(null);
  const rec = useRef<any>(null);
  const micOn = useRef(false);
  const level = useRef(0);
  const vol = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    const r = new URLSearchParams(location.search).get("room");
    setRoom(r || Math.random().toString(36).slice(2, 7));
    setOrigin(location.origin);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, peerLive, myLive]);

  useEffect(() => {
    if (!listening) { setMeter(0); return; }
    const t = setInterval(() => setMeter(Math.min(1, vol.current * 4)), 100);
    return () => clearInterval(t);
  }, [listening]);

  function speak(text: string, intensity: string) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langRef.current;
    u.rate = intensity === "shouting" ? 1.3 : intensity === "heated" ? 1.15 : 1;
    u.pitch = intensity === "shouting" ? 1.3 : 1;
    u.volume = intensity === "calm" ? 0.8 : 1;
    speechSynthesis.speak(u);
  }

  function join() {
    const s = io(SERVER);
    sock.current = s;
    s.on("connect", () => { setConnected(true); s.emit("join", { room, name: name || "Guest", lang }); });
    s.on("disconnect", () => setConnected(false));
    s.on("peers", (p: Peer[]) => setPeers(p));
    s.on("peer-partial", ({ text }) => { setPeerLive(text); speechSynthesis.cancel(); });
    s.on("message", (m: Msg) => {
      setMsgs((p) => [...p, m]);
      setPeerLive("");
      if (!m.mine && m.translated) speak(m.translated, m.intensity);
    });
    setJoined(true);
  }

  function leave() {
    stopMic();
    speechSynthesis.cancel();
    sock.current?.disconnect();
    setJoined(false); setMsgs([]); setPeers([]); setPeerLive(""); setMyLive("");
  }

  async function startMic() {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    try {
      if (isMobile) throw new Error("skip meter on phones");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        vol.current = rms;
        level.current = Math.max(level.current, rms);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Use Chrome (desktop or Android).");
    const r = new SR();
    r.continuous = !isMobile;
    r.interimResults = true;
    r.lang = langRef.current;
    r.onstart = () => setErr("");
    r.onerror = (e: any) => {
      console.log("SR error", e.error);
      if (e.error !== "no-speech") setErr(e.error === "aborted" ? "Another tab is using the mic. Chrome allows one listening tab at a time." : e.error || "unknown");
      if (["not-allowed", "service-not-allowed", "network", "aborted"].includes(e.error)) { const m = e.error; stopMic(); setErr(m === "aborted" ? "Another tab is using the mic. Chrome allows one listening tab at a time. Use typing in this tab." : m); }
    };
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          const lv = level.current;
          level.current = 0;
          const intensity = lv > 0.25 ? "shouting" : lv > 0.12 ? "heated" : "calm";
          sock.current?.emit("final", { text: t.trim(), intensity });
          setMyLive("");
        } else interim += t;
      }
      if (interim) {
        speechSynthesis.cancel();
        setMyLive(interim);
        sock.current?.emit("partial", interim);
      }
    };
    r.onend = () => { if (micOn.current) { try { r.start(); } catch {} } };
    micOn.current = true;
    r.start();
    rec.current = r;
    setListening(true);
  }

  function stopMic() {
    micOn.current = false;
    try { rec.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(rafRef.current);
    if (ctxRef.current && ctxRef.current.state !== "closed") ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
    vol.current = 0;
    setListening(false);
    setMyLive("");
  }

  function sendText() {
    const t = text.trim();
    if (!t) return;
    const bangs = (t.match(/!/g) || []).length;
    const caps = t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t);
    const intensity = caps || bangs >= 2 ? "shouting" : bangs === 1 ? "heated" : "calm";
    sock.current?.emit("final", { text: t, intensity });
    setText("");
  }

  function copyLink() {
    navigator.clipboard.writeText(`${origin}/?room=${room}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!joined)
    return (
      <div className="app"><style>{css}</style>
        <div className="join">
          <h1>Argue in any language</h1>
          <p className="sub">Two people, two languages, one live argument.</p>
          <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="field" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map(([c, n]) => <option key={c} value={c}>I speak {n}</option>)}
          </select>
          <p className="hint">Room: <b>{room}</b>{origin && <><br />Share: {origin}/?room={room}</>}</p>
          <p className="hint">Use headphones, or the mic will hear the translated voice.</p>
          <button className="btn" onClick={join}>Join room</button>
        </div>
      </div>
    );

  const other = peers.find((p) => p.id !== sock.current?.id);

  return (
    <div className="app"><style>{css}</style>
      <div className="card">
        <div className="hdr">
          <div>
            <b>Room {room}</b><br />
            <span className="pill">You: {langName(lang)}</span>
            {other && <span className="pill">{other.name}: {langName(other.lang)}</span>}
          </div>
          <div>
            <button className="small" onClick={copyLink}>{copied ? "Copied!" : "Copy invite link"}</button>{" "}
            <button className="small" onClick={leave}>Leave</button>
          </div>
        </div>
        <div className="status">
          <span className={"dot " + (connected ? "ok" : "")} />
          {!connected ? "Connecting to server…" : other ? `Talking with ${other.name}. Start the mic and argue.` : "Waiting for the other person to join with the invite link…"}
        </div>
        <div className="chat">
          {msgs.length === 0 && <div className="empty">No messages yet.<br />Press Start mic and speak.</div>}
          {msgs.map((m) => (
            <div key={m.id + (m.mine ? "m" : "t")} className={`row ${m.mine ? "mine" : "theirs"} ${m.intensity}`}>
              <div className="bub">
                <div className="who">{m.mine ? "You" : m.name}</div>
                <div className="t">{m.mine ? m.original : m.translated}</div>
                {!m.mine && <div className="orig">{m.original}</div>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {err && <div className="status" style={{ color: "#b91c1c" }}>Mic error: {err}</div>}
        <div className="live">{peerLive && `${other?.name || "They"}: ${peerLive}…`}</div>
        <div className="live me">{myLive && `${myLive}…`}</div>
        <div className="bar" style={{ borderTop: "1px solid #eceef5", paddingBottom: 0 }}>
          <input className="field" style={{ margin: 0 }} placeholder="Or type here and press Enter (use ! or CAPS for anger)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendText()} />
          <button className="small" onClick={sendText}>Send</button>
        </div>
        <div className="bar">
          <button className={"mic " + (listening ? "on" : "")} onClick={listening ? stopMic : startMic}>
            {listening ? "■ Stop mic" : "🎤 Start mic"}
          </button>
          <div className="meter"><i style={{ width: `${meter * 100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}
