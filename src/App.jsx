import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── COLOURS ────────────────────────────────────────────────────────────────
const C = {
  bg:       "#0f0720",
  deep:     "#1a0a2e",
  panel:    "#241040",
  border:   "#3d1f6e",
  purple:   "#7C3AED",
  purpleL:  "#C084FC",
  purpleSoft:"#9B7ED4",
  purpleDim: "#2d1654",
  green:    "#10B981",
  greenDim: "#0a2e1e",
  red:      "#EF4444",
  redDim:   "#3a0a0a",
  amber:    "#F59E0B",
  text:     "#F3F0FF",
  textMid:  "#C4B5FD",
  textDim:  "#7C6FAD",
  white:    "#FFFFFF",
};

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
const ECHO_SYSTEM = `You are EchoBridge — a calm, invisible AI communication companion for autistic adults.

Your role is to speak FOR the user, not AT them. You are their voice when words are hard.

CORE RULES:
- Always speak in first person AS the user — never refer to "the user" or "they"
- Keep responses SHORT — 1-3 sentences maximum unless generating phrase options
- Never use clinical language, disability terms, or anything that draws attention
- Be natural, warm, and completely normal-sounding
- When generating phrase options, give exactly 3 options — short, natural, conversational
- Never explain what you're doing — just do it
- Match the energy of the situation — calm for overwhelm, firm for boundaries, friendly for social

MODES:
- SPEAK_FOR_ME: Generate what the user should say right now. Return ONLY the spoken phrase, nothing else.
- PHRASE_OPTIONS: Generate 3 short phrases the user can tap to speak. Return as JSON array: ["phrase1","phrase2","phrase3"]
- ADVOCATE: Describe situation → generate 3-5 ready phrases for that specific situation. Return as JSON array.
- PRIVATE: Answer the user's question privately — they see it but it won't be spoken aloud.
- CALL_HELPER: Help the user navigate a phone call. Generate what to say next based on context.

The user is autistic. They don't want to be treated differently. They just want tools to navigate a world not built for their brain — invisibly, privately, with dignity.`;

// ─── FEELINGS ───────────────────────────────────────────────────────────────
const FEELINGS = [
  { id: "overwhelmed", label: "Overwhelmed", emoji: "😰" },
  { id: "anxious",     label: "Anxious",     emoji: "😟" },
  { id: "frustrated",  label: "Frustrated",  emoji: "😤" },
  { id: "shutdown",    label: "Shutdown",     emoji: "😶" },
  { id: "confused",    label: "Confused",     emoji: "😵" },
  { id: "other",       label: "Other",        emoji: "💭" },
];

const ADVOCATE_SITUATIONS = [
  "Someone is talking too loud near me",
  "I need to leave but don't know how to say goodbye",
  "My boss keeps changing plans last minute",
  "Someone asked how I am and I froze",
  "I need to ask for a break at work",
  "Someone is touching my things without asking",
  "I need to reschedule an appointment",
  "I don't understand what someone wants from me",
  "I need to say no without offending someone",
  "Someone is standing too close to me",
];

const QUICK_PHRASES = [
  "I need a moment to think.",
  "Could you please repeat that?",
  "I'm doing okay, thank you.",
  "I'd prefer to communicate this way right now.",
  "Please give me some space.",
  "I understand. Thank you for your patience.",
  "I need a short break.",
  "Could we slow down a little?",
  "I'm listening. I just need time to respond.",
  "Thank you for being patient with me.",
];

// ─── UTILS ──────────────────────────────────────────────────────────────────
function speak(text, rate = 0.95, pitch = 1) {
  window.speechSynthesis?.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate; u.pitch = pitch; u.volume = 1;
  const voices = window.speechSynthesis?.getVoices() || [];
  const preferred = voices.find(v => v.lang.startsWith("en") && v.localService);
  if (preferred) u.voice = preferred;
  window.speechSynthesis?.speak(u);
}

function stopSpeaking() { window.speechSynthesis?.cancel(); }

async function callClaude(messages, system = ECHO_SYSTEM) {
  const res = await fetch("/.netlify/functions/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system,
      messages,
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ─── BUTTON ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = "primary", style = {}, size = "md" }) {
  const base = {
    border: "none", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 700, transition: "all 0.15s",
    opacity: disabled ? 0.5 : 1, display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8,
    padding: size === "lg" ? "16px 24px" : size === "sm" ? "8px 14px" : "12px 18px",
    fontSize: size === "lg" ? 17 : size === "sm" ? 13 : 15,
  };
  const variants = {
    primary:  { background: C.purple,   color: C.white },
    secondary:{ background: C.purpleDim, color: C.purpleL, border: `1px solid ${C.border}` },
    ghost:    { background: "transparent", color: C.textMid, border: `1px solid ${C.border}` },
    danger:   { background: C.redDim,   color: C.red, border: `1px solid ${C.red}44` },
    green:    { background: C.greenDim, color: C.green, border: `1px solid ${C.green}44` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inp = {
    background: C.panel, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "13px 16px", fontSize: 15,
    fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box",
  };

  const submit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth(data.user);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Account created — check your email to confirm, then sign in.");
        setMode("login");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSuccess("Password reset email sent. Check your inbox.");
        setMode("login");
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🌉</div>
          <h1 style={{ color: C.purpleL, fontSize: 28, fontWeight: 900, margin: "0 0 6px" }}>EchoBridge</h1>
          <p style={{ color: C.textDim, fontSize: 14, fontStyle: "italic" }}>Your voice, your way.</p>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0, textAlign: "center" }}>
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
          </h2>

          {error && <div style={{ background: "#3a0a0a", color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{error}</div>}
          {success && <div style={{ background: C.greenDim, color: C.green, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{success}</div>}

          {mode === "reset" ? (
            <>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email address" style={inp} />
              <Btn onClick={submit} disabled={loading || !email} size="lg" style={{ width: "100%" }}>{loading ? "Sending..." : "Send Reset Email"}</Btn>
              <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14, textAlign: "center" }}>← Back to sign in</button>
            </>
          ) : (
            <>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" style={inp} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Password" style={inp} />
              <Btn onClick={submit} disabled={loading || !email || !password} size="lg" style={{ width: "100%" }}>
                {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create free account"}
              </Btn>
              <button onClick={signInWithGoogle} disabled={loading} style={{ background: C.deep, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                <span style={{ fontSize: 18, fontWeight: 900 }}>G</span> Continue with Google
              </button>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); }} style={{ background: "none", border: "none", color: C.textMid, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                  {mode === "login" ? "No account? Sign up free" : "Already have an account?"}
                </button>
                {mode === "login" && (
                  <button onClick={() => { setMode("reset"); setError(""); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                    Forgot password?
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, color: C.textDim, fontSize: 12, lineHeight: 1.6 }}>
          7-day free trial · $9.99 AUD/month · Cancel anytime<br />
          <span style={{ color: C.purpleDim }}>By MM AI Technologies Pty Ltd · ABN 54 696 966 631</span>
        </div>
      </div>
    </div>
  );
}

// ─── EMERGENCY SCREEN ────────────────────────────────────────────────────────
function EmergencyScreen({ onDismiss, userName }) {
  const msg = `Emergency. ${userName ? `This person's name is ${userName}. They are` : "This person is"} autistic and is in distress. They may be non-verbal right now and need immediate support. Please speak calmly and slowly. Give them space. Ask yes or no questions only. Do not touch them without permission. If they are in physical danger, please call emergency services. Thank you for your patience and kindness.`;

  useEffect(() => {
    speak(msg, 0.85, 1);
    return () => stopSpeaking();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: C.redDim, zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🚨</div>
      <h1 style={{ color: C.white, fontSize: 26, fontWeight: 900, marginBottom: 16, textAlign: "center" }}>Emergency Alert</h1>
      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 16, padding: "20px 24px", maxWidth: 420, textAlign: "center", marginBottom: 32 }}>
        <p style={{ color: C.white, fontSize: 15, lineHeight: 1.8 }}>{msg}</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexDirection: "column", width: "100%", maxWidth: 340 }}>
        <button onClick={() => { speak(msg, 0.85, 1); }} style={{ background: "rgba(255,255,255,0.15)", color: C.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          🔊 Speak Again
        </button>
        <button onClick={() => { stopSpeaking(); onDismiss(); }} style={{ background: "transparent", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          ✕ I'm okay — Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── SESSION SCREEN ──────────────────────────────────────────────────────────
function SessionScreen({ user, profile, onEnd }) {
  const [tab, setTab] = useState("choose");
  const [phrases, setPhrases] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [privateReply, setPrivateReply] = useState("");
  const [history, setHistory] = useState([]);

  const introMsg = `Hi there. ${profile?.name ? `My name is ${profile.name}. I am` : "The person I'm with is"} autistic and ${profile?.name ? "I am" : "they are"} having a hard moment communicating right now. I'm EchoBridge, an AI assistant designed to help communicate on ${profile?.name ? "my" : "their"} behalf. ${profile?.name ? "I" : "They"} can hear and understand you — ${profile?.name ? "I'm" : "they're"} choosing responses through ${profile?.name ? "my" : "their"} device. Please be patient and kind. Let's continue the conversation together.`;

  useEffect(() => {
    speakPhrase(introMsg);
    generatePhrases();
  }, []);

  const speakPhrase = async (text) => {
    setSpeaking(true);
    speak(text);
    setTimeout(() => setSpeaking(false), text.length * 60);
  };

  const generatePhrases = async () => {
    setLoading(true);
    try {
      const ctx = profile?.feeling ? `The user is feeling ${profile.feeling}.` : "";
      const text = await callClaude([{
        role: "user",
        content: `${ctx} Generate 3 natural, short phrases I could say right now to keep the conversation going. Return ONLY a JSON array of 3 strings, nothing else.`
      }]);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setPhrases(parsed);
    } catch {
      setPhrases([
        "I appreciate your patience.",
        "Could we slow down a little?",
        "I'm doing my best right now.",
      ]);
    }
    setLoading(false);
  };

  const tapPhrase = (phrase) => {
    setHistory(h => [...h, { role: "user_spoke", text: phrase }]);
    speakPhrase(phrase);
    // Generate next phrases based on context
    setTimeout(() => generateNextPhrases(phrase), 1000);
  };

  const generateNextPhrases = async (lastSpoken) => {
    setLoading(true);
    try {
      const text = await callClaude([
        ...history.slice(-6).map(h => ({ role: "user", content: h.text })),
        { role: "user", content: `I just said: "${lastSpoken}". Generate 3 natural follow-up phrases I might need to say next. Return ONLY a JSON array of 3 strings.` }
      ]);
      const clean = text.replace(/```json|```/g, "").trim();
      setPhrases(JSON.parse(clean));
    } catch { /* keep existing phrases */ }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput("");

    if (tab === "message") {
      setLoading(true);
      const reply = await callClaude([
        ...history.slice(-10),
        { role: "user", content: `[PRIVATE - do not speak aloud] ${msg}` }
      ]);
      setPrivateReply(reply);
      setHistory(h => [...h, { role: "user", content: msg }, { role: "assistant", content: reply }]);
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", zIndex: 100 }}>
      {/* Header */}
      <div style={{ background: C.deep, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
          <span style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>Session Active</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => speakPhrase(introMsg)} style={{ background: "none", border: "none", color: C.textMid, cursor: "pointer", fontSize: 20 }}>🔊</button>
          <button onClick={onEnd} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
      </div>

      {/* Speaking indicator */}
      {speaking && (
        <div style={{ background: C.purpleDim, borderBottom: `1px solid ${C.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.purpleL, animation: "pulse 1s infinite" }} />
          <span style={{ color: C.purpleL, fontSize: 13, fontWeight: 600 }}>Speaking aloud...</span>
        </div>
      )}

      {/* Intro message */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ background: C.purpleDim, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🌉</span>
          <div>
            <div style={{ color: C.purpleL, fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>EchoBridge — Spoken Aloud</div>
            <div style={{ color: C.textMid, fontSize: 13, lineHeight: 1.6 }}>{introMsg}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.deep }}>
        {[["choose", "💬 Choose Response"], ["message", "🔒 Message AI"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: tab === id ? C.panel : "none", color: tab === id ? C.purpleL : C.textDim, border: "none", borderBottom: tab === id ? `2px solid ${C.purple}` : "2px solid transparent", padding: "12px 8px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {tab === "choose" && (
          <>
            <div style={{ color: C.textDim, fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Tap to speak:</div>
            {loading ? (
              <div style={{ textAlign: "center", color: C.textDim, padding: 32 }}>Generating phrases...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {phrases.map((p, i) => (
                  <button key={i} onClick={() => tapPhrase(p)} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", color: C.text, fontSize: 15, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.5 }}>
                    {p}
                  </button>
                ))}
                <button onClick={generatePhrases} style={{ background: "none", border: `1px dashed ${C.border}`, borderRadius: 14, padding: "12px", color: C.textDim, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  ↺ Generate new phrases
                </button>
              </div>
            )}
          </>
        )}

        {tab === "message" && (
          <>
            <div style={{ color: C.textDim, fontSize: 12, marginBottom: 12 }}>
              Type anything — your raw thoughts, fragments, or questions. I'll answer privately. This won't be spoken aloud.
            </div>
            {privateReply && (
              <div style={{ background: C.purpleDim, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ color: C.purpleL, fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>🔒 Private reply</div>
                <div style={{ color: C.textMid, fontSize: 14, lineHeight: 1.7 }}>{privateReply}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder="Type anything... I'll figure out what to do with it 💙" rows={3} style={{ flex: 1, background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit" }} />
              <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ background: C.purple, color: C.white, border: "none", borderRadius: 12, width: 48, cursor: "pointer", fontSize: 20, opacity: loading || !input.trim() ? 0.5 : 1 }}>↑</button>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ─── CALL HELPER ─────────────────────────────────────────────────────────────
function CallHelper({ onClose }) {
  const [stage, setStage] = useState("ready");
  const [callerInfo, setCallerInfo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [script, setScript] = useState(null);
  const [currentLine, setCurrentLine] = useState(0);
  const [loading, setLoading] = useState(false);
  const [theySaid, setTheySaid] = useState("");
  const [nextLine, setNextLine] = useState("");

  const inp = { background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" };

  const prepareCall = async () => {
    setLoading(true);
    try {
      const text = await callClaude([{
        role: "user",
        content: `I need to make or receive a phone call. Caller/company: "${callerInfo}". Purpose: "${purpose}". 
        Generate a simple call script for me — what to say when I answer/call, how to handle the main topic, and how to end the call. 
        Return as JSON: { "opening": "what to say first", "main": ["line1", "line2", "line3"], "closing": "how to end the call", "tips": ["tip1", "tip2"] }`
      }]);
      const clean = text.replace(/```json|```/g, "").trim();
      setScript(JSON.parse(clean));
      setStage("active");
    } catch {
      setScript({
        opening: "Hello, this is [your name]. I'm calling about [purpose].",
        main: ["Could you help me with that please?", "I understand. Thank you.", "Could you repeat that please?"],
        closing: "Thank you for your help. Goodbye.",
        tips: ["Speak slowly and clearly", "It's okay to ask them to repeat themselves"]
      });
      setStage("active");
    }
    setLoading(false);
  };

  const getNextResponse = async () => {
    if (!theySaid.trim()) return;
    setLoading(true);
    try {
      const text = await callClaude([{
        role: "user",
        content: `I'm on a phone call. They just said: "${theySaid}". The call is about: "${purpose}". What should I say next? Give me ONE short, natural sentence to say. Return ONLY the sentence.`
      }]);
      setNextLine(text.trim());
    } catch {
      setNextLine("Could you please repeat that?");
    }
    setTheySaid("");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100%", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.deep }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>←</button>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>📞 Call Helper</div>
          <div style={{ color: C.textDim, fontSize: 12 }}>Navigate phone calls with confidence</div>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {stage === "ready" && (
          <>
            <div style={{ background: C.purpleDim, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px", marginBottom: 20 }}>
              <div style={{ color: C.purpleL, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📞 Before you call</div>
              <div style={{ color: C.textMid, fontSize: 13, lineHeight: 1.65 }}>
                Tell me about the call and I'll prepare a script for you — what to say, how to handle it, and how to end it cleanly. You've got this.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ color: C.textMid, fontSize: 13, marginBottom: 6 }}>Who are you calling / who's calling you?</div>
                <input value={callerInfo} onChange={e => setCallerInfo(e.target.value)} placeholder="e.g. Doctor's office, Centrelink, My boss..." style={inp} />
              </div>
              <div>
                <div style={{ color: C.textMid, fontSize: 13, marginBottom: 6 }}>What's the call about?</div>
                <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Reschedule appointment, Ask about payment..." style={inp} />
              </div>
              <Btn onClick={prepareCall} disabled={loading || !callerInfo.trim() || !purpose.trim()} size="lg" style={{ width: "100%" }}>
                {loading ? "Preparing your script..." : "Prepare My Call Script →"}
              </Btn>
            </div>
          </>
        )}

        {stage === "active" && script && (
          <>
            <div style={{ background: C.greenDim, border: `1px solid ${C.green}44`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ color: C.green, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>✅ Script ready — tap any line to speak it</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <div style={{ color: C.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Opening</div>
              <button onClick={() => speak(script.opening)} style={{ background: C.panel, border: `1px solid ${C.green}44`, borderRadius: 14, padding: "14px 16px", color: C.text, fontSize: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.6 }}>
                {script.opening}
              </button>

              <div style={{ color: C.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>Main</div>
              {script.main.map((line, i) => (
                <button key={i} onClick={() => speak(line)} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", color: C.text, fontSize: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.6 }}>
                  {line}
                </button>
              ))}

              <div style={{ color: C.textDim, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>Closing</div>
              <button onClick={() => speak(script.closing)} style={{ background: C.panel, border: `1px solid ${C.red}44`, borderRadius: 14, padding: "14px 16px", color: C.text, fontSize: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.6 }}>
                {script.closing}
              </button>
            </div>

            {/* Real-time helper */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px" }}>
              <div style={{ color: C.purpleL, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>💬 They just said...</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={theySaid} onChange={e => setTheySaid(e.target.value)} onKeyDown={e => e.key === "Enter" && getNextResponse()} placeholder="Type what they said..." style={{ ...inp, flex: 1 }} />
                <button onClick={getNextResponse} disabled={loading || !theySaid.trim()} style={{ background: C.purple, color: C.white, border: "none", borderRadius: 12, padding: "0 16px", cursor: "pointer", fontWeight: 700, fontSize: 14, opacity: loading || !theySaid.trim() ? 0.5 : 1 }}>
                  {loading ? "..." : "→"}
                </button>
              </div>
              {nextLine && (
                <button onClick={() => speak(nextLine)} style={{ background: C.purpleDim, border: `1px solid ${C.purple}44`, borderRadius: 12, padding: "12px 14px", color: C.purpleL, fontSize: 14, cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit", fontWeight: 600 }}>
                  🔊 {nextLine}
                </button>
              )}
            </div>

            {script.tips?.length > 0 && (
              <div style={{ marginTop: 16, background: C.deepBg, padding: "12px 14px", borderRadius: 12 }}>
                <div style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>💡 Tips</div>
                {script.tips.map((tip, i) => <div key={i} style={{ color: C.textDim, fontSize: 13, marginBottom: 4 }}>• {tip}</div>)}
              </div>
            )}

            <Btn onClick={() => { stopSpeaking(); setStage("ready"); setScript(null); setNextLine(""); }} variant="ghost" style={{ width: "100%", marginTop: 16 }}>
              Start new call
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [feeling, setFeeling] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [advocateInput, setAdvocateInput] = useState("");
  const [advocatePhrases, setAdvocatePhrases] = useState([]);
  const [advocateLoading, setAdvocateLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [quickPhrasesOpen, setQuickPhrasesOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.__hideSplash) window.__hideSplash();

    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setInstalled(true); setInstallPrompt(null); });
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
        await ensureSubscription(session.user.id);
      }
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
        await ensureSubscription(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const ensureSubscription = async (uid) => {
    const { data } = await supabase.from("eb_subscriptions").select("id").eq("user_id", uid).maybeSingle();
    if (!data) {
      await supabase.from("eb_subscriptions").insert({ user_id: uid, status: "trial", trial_start: new Date().toISOString() });
    }
  };

  const loadProfile = async (uid) => {
    try {
      const { data } = await supabase.from("eb_profiles").select("*").eq("user_id", uid).maybeSingle();
      if (data) setProfile(data);
    } catch { /* profile not set up yet - ok */ }
  };

  const signOut = async () => { await supabase.auth.signOut(); setUser(null); setProfile(null); };

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setInstalled(true); setInstallPrompt(null); }
  };

  const generateAdvocatePhrases = async (situation) => {
    setAdvocateLoading(true);
    try {
      const text = await callClaude([{
        role: "user",
        content: `Situation: "${situation}". Generate 4 short, natural phrases I could say or show to handle this situation. Return ONLY a JSON array of 4 strings.`
      }]);
      const clean = text.replace(/```json|```/g, "").trim();
      setAdvocatePhrases(JSON.parse(clean));
    } catch {
      setAdvocatePhrases(["I need a moment.", "Could we talk about this differently?", "I appreciate your patience.", "Can we come back to this?"]);
    }
    setAdvocateLoading(false);
  };

  if (loading) return null;
  if (!user) return <AuthScreen onAuth={u => { setUser(u); loadProfile(u.id); }} />;
  if (emergency) return <EmergencyScreen userName={profile?.name} onDismiss={() => setEmergency(false)} />;
  if (sessionActive) return <SessionScreen user={user} profile={{ ...profile, feeling: feeling?.id }} onEnd={() => setSessionActive(false)} />;
  if (tab === "call") return <CallHelper onClose={() => setTab("home")} />;

  const TABS = [
    { id: "home",     icon: "🏠", label: "Home" },
    { id: "advocate", icon: "💜", label: "Advocate" },
    { id: "phrases",  icon: "💬", label: "Phrases" },
    { id: "call",     icon: "📞", label: "Calls" },
    { id: "profile",  icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", position: "relative" }}>

      {/* Install banner */}
      {installPrompt && !installed && (
        <div style={{ background: C.purpleDim, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ color: C.textMid, fontSize: 13 }}>📲 Install EchoBridge on this device</div>
          <button onClick={installApp} style={{ background: C.purple, color: C.white, border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Install</button>
        </div>
      )}

      {/* HOME TAB */}
      {tab === "home" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h1 style={{ color: C.purpleL, fontSize: 22, fontWeight: 900, margin: 0 }}>🌉 EchoBridge</h1>
              <p style={{ color: C.textDim, fontSize: 13, margin: 0, fontStyle: "italic" }}>Your voice, your way.</p>
            </div>
            {profile?.name && <div style={{ color: C.textMid, fontSize: 13 }}>Hi, {profile.name}</div>}
          </div>

          {/* BIG PANIC BUTTON */}
          <button
            onClick={() => setSessionActive(true)}
            style={{
              width: "100%", background: `radial-gradient(circle at 40% 40%, ${C.purple}, #4C1D95)`,
              border: "none", borderRadius: 24, padding: "32px 20px",
              cursor: "pointer", marginBottom: 16, position: "relative", overflow: "hidden",
              boxShadow: `0 8px 32px ${C.purple}44`,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 10 }}>✨</div>
            <div style={{ color: C.white, fontSize: 22, fontWeight: 900, marginBottom: 6 }}>I Need Help</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>Tap to start — EchoBridge will speak for you</div>
          </button>

          {/* Emergency button */}
          <button
            onClick={() => setEmergency(true)}
            style={{ width: "100%", background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 16, padding: "16px", cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 24 }}>🚨</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: C.red, fontWeight: 700, fontSize: 15 }}>Emergency — Speak for Me</div>
              <div style={{ color: "rgba(239,68,68,0.6)", fontSize: 12 }}>Alerts people around you immediately</div>
            </div>
          </button>

          {/* How are you feeling */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: "18px", marginBottom: 16 }}>
            <div style={{ color: C.textMid, fontSize: 13, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>How are you feeling?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {FEELINGS.map(f => (
                <button key={f.id} onClick={() => setFeeling(feeling?.id === f.id ? null : f)} style={{ background: feeling?.id === f.id ? C.purpleDim : C.deep, border: `1px solid ${feeling?.id === f.id ? C.purple : C.border}`, borderRadius: 12, padding: "12px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.15s", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 22 }}>{f.emoji}</span>
                  <span style={{ color: feeling?.id === f.id ? C.purpleL : C.textDim, fontSize: 11, fontWeight: 600 }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick access */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => setTab("advocate")} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>💜</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>Advocate</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>Get phrases for your situation</div>
            </button>
            <button onClick={() => setTab("call")} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>📞</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>Call Helper</div>
              <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>Navigate phone calls</div>
            </button>
          </div>
        </div>
      )}

      {/* ADVOCATE TAB */}
      {tab === "advocate" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 800, marginBottom: 6 }}>💜 Advocate</h2>
          <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Describe what's happening and I'll generate phrases you can say or show to the other person.</p>

          {/* Common situations */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: C.textDim, fontSize: 12, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Common situations:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ADVOCATE_SITUATIONS.map(s => (
                <button key={s} onClick={() => { setAdvocateInput(s); generateAdvocatePhrases(s); }} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", color: C.textMid, fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Custom situation */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px", marginBottom: 16 }}>
            <div style={{ color: C.textMid, fontSize: 13, marginBottom: 10 }}>Or describe your situation:</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={advocateInput} onChange={e => setAdvocateInput(e.target.value)} onKeyDown={e => e.key === "Enter" && generateAdvocatePhrases(advocateInput)} placeholder="What's happening right now..." style={{ flex: 1, background: C.deep, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
              <button onClick={() => generateAdvocatePhrases(advocateInput)} disabled={advocateLoading || !advocateInput.trim()} style={{ background: C.purple, color: C.white, border: "none", borderRadius: 10, padding: "0 16px", cursor: "pointer", fontWeight: 700, opacity: advocateLoading || !advocateInput.trim() ? 0.5 : 1 }}>
                {advocateLoading ? "..." : "→"}
              </button>
            </div>
          </div>

          {/* Generated phrases */}
          {advocatePhrases.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: C.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Tap to speak:</div>
              {advocatePhrases.map((p, i) => (
                <button key={i} onClick={() => speak(p)} style={{ background: C.purpleDim, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", color: C.text, fontSize: 15, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.5 }}>
                  🔊 {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PHRASES TAB */}
      {tab === "phrases" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 800, marginBottom: 6 }}>💬 Quick Phrases</h2>
          <p style={{ color: C.textDim, fontSize: 13, marginBottom: 20 }}>Tap any phrase to speak it immediately.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {QUICK_PHRASES.map((p, i) => (
              <button key={i} onClick={() => speak(p)} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px", color: C.text, fontSize: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, color: C.purpleL }}>🔊</span>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "profile" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px" }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 800, marginBottom: 20 }}>⚙️ Settings</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px" }}>
              <div style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>Signed in as</div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{user.email}</div>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px" }}>
              <div style={{ color: C.textDim, fontSize: 12, marginBottom: 10 }}>Your name (used in sessions)</div>
              <input
                defaultValue={profile?.name || ""}
                onBlur={async e => {
                  const name = e.target.value.trim();
                  if (!name) return;
                  try {
                    const { data: existing } = await supabase.from("eb_profiles").select("id").eq("user_id", user.id).maybeSingle();
                    if (existing) {
                      await supabase.from("eb_profiles").update({ name }).eq("user_id", user.id);
                    } else {
                      await supabase.from("eb_profiles").insert({ user_id: user.id, name });
                    }
                    setProfile(p => ({ ...(p || {}), name }));
                  } catch (err) { console.error("Profile save error:", err); }
                }}
                placeholder="Your first name (optional)"
                style={{ background: C.deep, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            </div>

            {installPrompt && !installed && (
              <Btn onClick={installApp} size="lg" style={{ width: "100%" }}>📲 Install EchoBridge on This Device</Btn>
            )}
            {installed && (
              <div style={{ background: C.greenDim, border: `1px solid ${C.green}44`, borderRadius: 12, padding: "12px 14px", color: C.green, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
                ✅ EchoBridge is installed on this device
              </div>
            )}

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px" }}>
              <div style={{ color: C.purpleL, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Subscription</div>
              <div style={{ color: C.textMid, fontSize: 13, marginBottom: 12 }}>7-day free trial · $9.99 AUD/month</div>
              <div style={{ color: C.textDim, fontSize: 12 }}>MM AI Technologies Pty Ltd · ABN 54 696 966 631</div>
            </div>

            <Btn onClick={signOut} variant="ghost" style={{ width: "100%" }}>Sign out</Btn>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.deep, borderTop: `1px solid ${C.border}`, padding: "8px 8px 12px", display: "flex", gap: 2, zIndex: 50 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { if (t.id === "call") { setTab("call"); setSessionActive(false); } else setTab(t.id); }} style={{ flex: 1, background: tab === t.id ? C.purpleDim : "none", border: "none", borderRadius: 12, padding: "8px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.15s" }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ color: tab === t.id ? C.purpleL : C.textDim, fontSize: 10, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
          </button>
        ))}
      </nav>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input, textarea, button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
