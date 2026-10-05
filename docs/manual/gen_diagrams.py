#!/usr/bin/env python3
"""Generate SVG diagrams for the AI-to-QPU technical manual."""
from pathlib import Path

OUT = Path(__file__).parent / "diagrams"
OUT.mkdir(exist_ok=True)

SLATE = "#475569"
BLUE = "#007AFF"
ORANGE = "#FF9500"
GREEN = "#34C759"
RED = "#FF3B30"
GRAY = "#8E8E93"
BG = "#0f172a"


def save(name: str, svg: str) -> None:
    (OUT / name).write_text(svg)
    print(f"  {name} ({len(svg)} B)")


def header(title: str, dark: bool = False) -> str:
    bg = "#0b1220" if dark else "#ffffff"
    fg = "#94a3b8" if dark else SLATE
    return f'<rect width="720" height="HGT" fill="{bg}"/><text x="16" y="22" font-size="10" fill="{fg}" letter-spacing="1.2">{title}</text>'


# --- architecture ---
eps = [
    (105, "POST /goals", BLUE),
    (138, "POST /calibrate", BLUE),
    (171, "POST /circuit/bell", BLUE),
    (204, "GET /device/state", SLATE),
    (237, "GET /device/detuning/{q}", SLATE),
    (270, "GET /jobs / traces / metrics", SLATE),
    (303, "GET /sse/jobs/{id}", SLATE),
    (336, "POST /demo/* guardrails", ORANGE),
]
ep = "\n".join(
    f'<rect x="235" y="{y}" width="170" height="26" rx="3" fill="{c}"/>'
    f'<text x="320" y="{y+17}" text-anchor="middle" font-size="8.5" fill="#fff">{lab}</text>'
    for y, lab, c in eps
)

save(
    "fig-architecture.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 420" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="740" height="420" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">SYSTEM ARCHITECTURE - COMPONENT + DATA FLOW</text>
  <rect x="20" y="40" width="160" height="360" rx="8" fill="{BG}"/>
  <text x="100" y="68" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">OPERATOR UI</text>
  <text x="100" y="86" text-anchor="middle" font-size="8" fill="#94a3b8">ui/ - Next.js :3000</text>
  <rect x="35" y="100" width="130" height="48" rx="4" fill="#1e293b"/>
  <text x="100" y="122" text-anchor="middle" font-size="9" fill="{BLUE}">Stage 65%</text>
  <text x="100" y="138" text-anchor="middle" font-size="8" fill="#64748b">calibration-surface</text>
  <rect x="35" y="158" width="130" height="48" rx="4" fill="#1e293b"/>
  <text x="100" y="180" text-anchor="middle" font-size="9" fill="{ORANGE}">Dock 35%</text>
  <text x="100" y="196" text-anchor="middle" font-size="8" fill="#64748b">ledger - composer</text>
  <rect x="35" y="216" width="130" height="36" rx="4" fill="#334155"/>
  <text x="100" y="238" text-anchor="middle" font-size="9" fill="#e2e8f0">Cmd+K palette</text>
  <rect x="35" y="262" width="130" height="36" rx="4" fill="#334155"/>
  <text x="100" y="284" text-anchor="middle" font-size="9" fill="#e2e8f0">lib/api.ts</text>
  <text x="100" y="330" text-anchor="middle" font-size="8" fill="#64748b">poll 6.5s - SSE jobs</text>
  <text x="100" y="348" text-anchor="middle" font-size="8" fill="#64748b">Sonner - motion</text>
  <text x="100" y="380" text-anchor="middle" font-size="8" fill="#475569">progressive blur dock</text>
  <rect x="220" y="40" width="200" height="360" rx="8" fill="#f8fafc" stroke="{SLATE}" stroke-width="1.5"/>
  <text x="320" y="68" text-anchor="middle" font-size="11" fill="{BG}" font-weight="600">CONTROL PLANE</text>
  <text x="320" y="86" text-anchor="middle" font-size="8" fill="{SLATE}">FastAPI - api/server.py :8000</text>
  {ep}
  <rect x="460" y="40" width="250" height="360" rx="8" fill="#fff7ed" stroke="{ORANGE}" stroke-width="1.5"/>
  <text x="585" y="68" text-anchor="middle" font-size="11" fill="{ORANGE}" font-weight="600">RUNTIME SEAM</text>
  <text x="585" y="86" text-anchor="middle" font-size="8" fill="{SLATE}">Orchestrator + Adapter</text>
  <rect x="480" y="105" width="210" height="55" rx="5" fill="{SLATE}"/>
  <text x="585" y="128" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">Orchestrator</text>
  <text x="585" y="146" text-anchor="middle" font-size="8" fill="#cbd5e1">5 tools - ToolTrace buffer</text>
  <rect x="480" y="170" width="210" height="55" rx="5" fill="{BLUE}"/>
  <text x="585" y="193" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">CalibrationService</text>
  <text x="585" y="211" text-anchor="middle" font-size="8" fill="#dbeafe">threshold 0.88 - max 60</text>
  <rect x="480" y="240" width="210" height="70" rx="5" fill="{ORANGE}"/>
  <text x="585" y="265" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">QPUAdapter</text>
  <text x="585" y="283" text-anchor="middle" font-size="8" fill="#ffedd5">NoisySimulator (default)</text>
  <text x="585" y="297" text-anchor="middle" font-size="8" fill="#ffedd5">or ConductorShaped stub</text>
  <rect x="480" y="325" width="210" height="50" rx="5" fill="{BG}"/>
  <text x="585" y="348" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">InMemoryJobStore</text>
  <text x="585" y="364" text-anchor="middle" font-size="8" fill="#94a3b8">non-durable - max 4096</text>
  <path d="M180 200 H220" stroke="{BG}" stroke-width="1.5"/>
  <path d="M420 200 H460" stroke="{BG}" stroke-width="1.5"/>
  <text x="200" y="192" font-size="8" fill="{SLATE}">HTTP</text>
</svg>''',
)

# dataflow
actors = [(70, "UI"), (200, "API"), (340, "Orch"), (480, "CalSvc"), (620, "Adapter")]
actor_svg = "".join(
    f'<text x="{x}" y="50" text-anchor="middle" font-size="10" fill="{BG}" font-weight="600">{t}</text>'
    f'<line x1="{x}" y1="58" x2="{x}" y2="280" stroke="#e2e8f0" stroke-width="1"/>'
    for x, t in actors
)
msgs = [
    (80, 70, 200, "POST /goals", BLUE),
    (105, 200, 340, "run_goal()", SLATE),
    (130, 340, 340, "plan_from_goal", SLATE),
    (160, 340, 480, "calibrate_qubit", BLUE),
    (185, 480, 620, "apply_update x N", ORANGE),
    (210, 620, 480, "CalibrationResult", GREEN),
    (235, 480, 340, "ToolResult + history", GREEN),
    (255, 340, 200, "traces + metrics", SLATE),
    (275, 200, 70, "GoalResponse", BLUE),
]
msg_svg = []
for y, x1, x2, lab, col in msgs:
    if x1 == x2:
        msg_svg.append(f'<text x="{x1+12}" y="{y}" font-size="8" fill="{col}">{lab}</text>')
    else:
        mid = (x1 + x2) / 2
        msg_svg.append(
            f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{col}" stroke-width="1.5" marker-end="url(#m)"/>'
            f'<text x="{mid}" y="{y-4}" text-anchor="middle" font-size="8" fill="{col}">{lab}</text>'
        )

save(
    "fig-dataflow.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="300" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">GOAL TO TOOLS TO ADAPTER TO DEVICE STATE</text>
  {actor_svg}
  {"".join(msg_svg)}
  <defs><marker id="m" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="{BG}"/></marker></defs>
</svg>''',
)

save(
    "fig-drift.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="280" fill="#f8fafc"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">NOISY SIM - HIDDEN TRUE VS APPLIED</text>
  <line x1="80" y1="220" x2="420" y2="220" stroke="{BG}" stroke-width="1.2"/>
  <line x1="80" y1="220" x2="80" y2="50" stroke="{BG}" stroke-width="1.2"/>
  <text x="250" y="250" text-anchor="middle" font-size="9" fill="{SLATE}">time (state reads / poll ticks)</text>
  <text x="40" y="140" text-anchor="middle" font-size="9" fill="{SLATE}" transform="rotate(-90 40 140)">frequency</text>
  <path d="M80 140 C120 120, 150 160, 190 130 S260 100, 300 145 S360 180, 420 110" fill="none" stroke="{BLUE}" stroke-width="2.5"/>
  <text x="430" y="114" font-size="10" fill="{BLUE}" font-weight="600">true (hidden)</text>
  <path d="M80 160 H160 V155 H240 V148 H320 V130 H420" fill="none" stroke="{ORANGE}" stroke-width="2.5"/>
  <text x="430" y="134" font-size="10" fill="{ORANGE}" font-weight="600">applied</text>
  <path d="M190 130 V155 M240 148 V130 M300 145 V130 M360 160 V130" stroke="{RED}" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"/>
  <text x="250" y="95" text-anchor="middle" font-size="9" fill="{RED}">dfreq = |applied - true|</text>
  <rect x="500" y="60" width="190" height="160" rx="6" fill="#fff" stroke="#e2e8f0"/>
  <text x="515" y="85" font-size="10" fill="{BG}" font-weight="600">Per-qubit state</text>
  <circle cx="525" cy="110" r="6" fill="{BLUE}"/>
  <text x="540" y="114" font-size="9" fill="{SLATE}">_true_params[q]</text>
  <circle cx="525" cy="140" r="6" fill="{ORANGE}"/>
  <text x="540" y="144" font-size="9" fill="{SLATE}">_applied_params[q]</text>
  <text x="515" y="175" font-size="8" fill="{SLATE}">drift: random walk +</text>
  <text x="515" y="190" font-size="8" fill="{SLATE}">sinusoidal wander</text>
  <text x="515" y="205" font-size="8" fill="{SLATE}">rate ~ 0.002 / step</text>
</svg>''',
)

save(
    "fig-fidelity-surface.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="300" fill="#0b1220"/>
  <text x="16" y="24" font-size="10" fill="#94a3b8" letter-spacing="1.2">FIDELITY LANDSCAPE - dfreq x damp (UI MEANING)</text>
  <ellipse cx="280" cy="160" rx="180" ry="100" fill="#1e293b" stroke="{GRAY}" stroke-width="1"/>
  <ellipse cx="300" cy="145" rx="120" ry="70" fill="#334155" stroke="{ORANGE}" stroke-width="1" opacity="0.9"/>
  <ellipse cx="320" cy="130" rx="60" ry="35" fill="#1e3a5f" stroke="{BLUE}" stroke-width="1.5"/>
  <circle cx="320" cy="130" r="10" fill="{BLUE}"/>
  <circle cx="250" cy="175" r="8" fill="{ORANGE}"/>
  <text x="320" y="118" text-anchor="middle" font-size="9" fill="{BLUE}" font-weight="600">true</text>
  <text x="250" y="198" text-anchor="middle" font-size="9" fill="{ORANGE}" font-weight="600">applied</text>
  <text x="280" y="270" text-anchor="middle" font-size="9" fill="#64748b">peak fidelity near true - falloff with ||d||^2</text>
  <rect x="500" y="50" width="200" height="210" rx="6" fill="#111827"/>
  <text x="520" y="78" font-size="10" fill="#e2e8f0" font-weight="600">Colour mapping</text>
  <rect x="520" y="95" width="14" height="14" rx="2" fill="{BLUE}"/>
  <text x="545" y="107" font-size="9" fill="#cbd5e1">f &gt;= 0.88  high / true</text>
  <rect x="520" y="120" width="14" height="14" rx="2" fill="{ORANGE}"/>
  <text x="545" y="132" font-size="9" fill="#cbd5e1">f &gt;= 0.75  mid / applied</text>
  <rect x="520" y="145" width="14" height="14" rx="2" fill="{GRAY}"/>
  <text x="545" y="157" font-size="9" fill="#cbd5e1">else  low</text>
  <text x="520" y="190" font-size="9" fill="#94a3b8">Source: calibration-</text>
  <text x="520" y="205" font-size="9" fill="#94a3b8">surface.tsx estimate-</text>
  <text x="520" y="220" font-size="9" fill="#94a3b8">Fidelity(dx,dy,base)</text>
  <text x="520" y="245" font-size="8" fill="#64748b">WebGPU with WebGL fallback</text>
</svg>''',
)

save(
    "fig-ui-layout.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="420" fill="#000"/>
  <text x="16" y="22" font-size="10" fill="#94a3b8" letter-spacing="1.2">CODA 2 - THREE-PANE INSTRUMENT: DRIFT | DEVICE 3D | CRYOSTAT + DOCK</text>
  <rect x="20" y="36" width="680" height="28" fill="#0b0b0c" stroke="#27272a"/>
  <text x="32" y="54" font-size="10" fill="#fff" font-weight="600">Coda 2</text>
  <rect x="78" y="43" width="34" height="14" rx="3" fill="{GREEN}"/>
  <text x="95" y="53.5" text-anchor="middle" font-size="7.5" fill="#000" font-weight="700">LIVE</text>
  <text x="360" y="54" text-anchor="middle" font-size="9" fill="{GREEN}" font-family="Menlo, monospace">READY</text>
  <rect x="610" y="43" width="18" height="14" rx="3" fill="none" stroke="#3f3f46"/><text x="619" y="53.5" text-anchor="middle" font-size="8" fill="#a1a1aa">⌘</text>
  <rect x="636" y="43" width="52" height="14" rx="3" fill="none" stroke="#3f3f46"/><text x="662" y="53.5" text-anchor="middle" font-size="8" fill="#a1a1aa">refresh</text>
  <rect x="20" y="64" width="680" height="336" fill="#050505" stroke="#27272a"/>
  <!-- left: drift -->
  <text x="30" y="82" font-size="8" fill="#a1a1aa" font-family="Menlo, monospace">● true  ● applied  drift=…</text>
  <polygon points="40,240 180,160 240,175 110,265" fill="#6b7280" opacity="0.85"/>
  <path d="M190 200 C 200 120, 210 90, 222 95 C 232 100, 236 150, 240 178 Z" fill="{BLUE}"/>
  <path d="M196 192 C 205 160, 215 150, 228 160 L 236 180 Z" fill="{ORANGE}" opacity="0.8"/>
  <circle cx="120" cy="215" r="5" fill="{ORANGE}"/>
  <text x="130" y="300" text-anchor="middle" font-size="10" fill="#e4e4e7" font-weight="600">LEFT - parameter drift</text>
  <text x="130" y="314" text-anchor="middle" font-size="8" fill="#71717a">fidelity surface - applied vs true</text>
  <!-- splitter 1 -->
  <line x1="246" y1="64" x2="246" y2="400" stroke="#3f3f46"/><rect x="243" y="200" width="6" height="28" rx="3" fill="#52525b"/>
  <!-- center: device -->
  <rect x="380" y="74" width="100" height="58" rx="3" fill="#0b0b0c" stroke="#3f3f46"/>
  <text x="388" y="88" font-size="7.5" fill="#e4e4e7" font-family="Menlo, monospace">readout</text><text x="472" y="88" text-anchor="end" font-size="7.5" fill="{GREEN}" font-family="Menlo, monospace">READY</text>
  <text x="388" y="102" font-size="7" fill="{BLUE}" font-family="Menlo, monospace">Q0 99.5%  T1 T2</text>
  <text x="388" y="114" font-size="7" fill="{BLUE}" font-family="Menlo, monospace">Q1 93.0%  T1 T2</text>
  <text x="388" y="126" font-size="6.5" fill="#71717a" font-family="Menlo, monospace">err - mK</text>
  <rect x="262" y="185" width="214" height="70" fill="#0f172a" opacity="0.9"/>
  <line x1="285" y1="200" x2="455" y2="200" stroke="#334155" stroke-width="3"/>
  <circle cx="272" cy="195" r="20" fill="{BLUE}"/><circle cx="466" cy="195" r="20" fill="{BLUE}"/>
  <text x="258" y="165" font-size="7.5" fill="#a1a1aa" font-family="Menlo, monospace">Q0 100%</text>
  <text x="365" y="300" text-anchor="middle" font-size="10" fill="#e4e4e7" font-weight="600">CENTER - device 3D</text>
  <text x="365" y="314" text-anchor="middle" font-size="8" fill="#71717a">qubits - chiplets - resonators - readout card</text>
  <!-- splitter 2 -->
  <line x1="484" y1="64" x2="484" y2="400" stroke="#3f3f46"/><rect x="481" y="200" width="6" height="28" rx="3" fill="#52525b"/>
  <!-- right: cryostat -->
  <rect x="512" y="96" width="134" height="180" fill="#0c0c0c" stroke="#27272a"/>
  <text x="518" y="108" font-size="6.5" fill="#71717a">FIG 1</text><text x="640" y="108" text-anchor="end" font-size="6.5" fill="#71717a">DILUTION FRIDGE</text>
  <g fill="none" stroke="#d4d4d8" stroke-width="0.8">
    <ellipse cx="579" cy="124" rx="34" ry="7"/><ellipse cx="579" cy="150" rx="28" ry="6"/><ellipse cx="579" cy="176" rx="26" ry="6"/>
    <ellipse cx="579" cy="202" rx="24" ry="5"/><ellipse cx="579" cy="226" rx="20" ry="5"/><ellipse cx="579" cy="248" rx="12" ry="3"/>
    <ellipse cx="579" cy="186" rx="40" ry="72"/>
    <line x1="566" y1="124" x2="566" y2="248"/><line x1="592" y1="124" x2="592" y2="248"/>
  </g>
  <text x="579" y="270" text-anchor="middle" font-size="6.5" fill="{GREEN}" font-family="Menlo, monospace">● READY  Q0 100%  mK  Δf</text>
  <rect x="650" y="252" width="44" height="13" rx="6.5" fill="none" stroke="#3f3f46"/><text x="672" y="261.5" text-anchor="middle" font-size="6.5" fill="#e4e4e7">● READY</text>
  <text x="592" y="300" text-anchor="middle" font-size="10" fill="#e4e4e7" font-weight="600">RIGHT - cryostat</text>
  <text x="592" y="314" text-anchor="middle" font-size="8" fill="#71717a">plate - status strip - state chip</text>
  <!-- dock -->
  <defs><linearGradient id="dockfade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="35%" stop-color="#000" stop-opacity="0.6"/><stop offset="100%" stop-color="#000" stop-opacity="0.92"/>
  </linearGradient></defs>
  <rect x="20" y="288" width="680" height="112" fill="url(#dockfade)" opacity="0.55"/>
  <rect x="408" y="322" width="110" height="14" rx="7" fill="#0b2545"/><text x="463" y="332" text-anchor="middle" font-size="7.5" fill="#e4e4e7">Bring qubit 0 to ready</text>
  <rect x="200" y="340" width="190" height="14" rx="7" fill="#27272a"/><text x="208" y="350" font-size="7.5" fill="#e4e4e7">Q0 … READY for circuits.</text>
  <g font-size="7" fill="#e4e4e7" text-anchor="middle">
    <rect x="200" y="360" width="50" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="225" y="369">Calibrate Q0</text>
    <rect x="254" y="360" width="38" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="273" y="369">Bell pair</text>
    <rect x="296" y="360" width="50" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="321" y="369">Q0 readiness</text>
    <rect x="350" y="360" width="52" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="376" y="369">Device status</text>
    <rect x="406" y="360" width="50" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="431" y="369">Improve Bell</text>
    <rect x="460" y="360" width="52" height="13" rx="6.5" fill="none" stroke="#52525b"/><text x="486" y="369">Diagnose Q0</text>
  </g>
  <rect x="196" y="378" width="320" height="18" rx="9" fill="#2c2c2e" stroke="#3f3f46"/>
  <text x="208" y="390" font-size="7.5" fill="#a1a1aa" font-family="Menlo, monospace">Type a goal… or pick above</text>
  <text x="36" y="392" font-size="7.5" fill="#71717a">DOCK: transcript - workflow chips - composer</text>
  <text x="690" y="392" text-anchor="end" font-size="7.5" fill="#71717a">bottom-third frost</text>
</svg>''',
)

save(
    "fig-why-instrument.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="300" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">WHY INSTRUMENT UI BEATS CHAT-ONLY FOR QUANTUM OPS</text>
  <rect x="30" y="45" width="300" height="230" rx="8" fill="#fef2f2" stroke="{RED}" stroke-width="1.5"/>
  <text x="180" y="75" text-anchor="middle" font-size="12" fill="{RED}" font-weight="600">Chat-only surface</text>
  <text x="50" y="105" font-size="10" fill="{SLATE}">- Serial text; device state is prose</text>
  <text x="50" y="125" font-size="10" fill="{SLATE}">- No continuous drift visibility</text>
  <text x="50" y="145" font-size="10" fill="{SLATE}">- Traces buried in paragraphs</text>
  <text x="50" y="165" font-size="10" fill="{SLATE}">- Metrics not instrument-native</text>
  <text x="50" y="185" font-size="10" fill="{SLATE}">- Easy to miss threshold miss</text>
  <text x="50" y="205" font-size="10" fill="{SLATE}">- No spatial param landscape</text>
  <text x="50" y="240" font-size="9" fill="{RED}">Wrong primary surface for ops</text>
  <rect x="390" y="45" width="300" height="230" rx="8" fill="#f0fdf4" stroke="{GREEN}" stroke-width="1.5"/>
  <text x="540" y="75" text-anchor="middle" font-size="12" fill="{GREEN}" font-weight="600">Stage + dock instrument</text>
  <text x="410" y="105" font-size="10" fill="{SLATE}">- Stage always shows live drift</text>
  <text x="410" y="125" font-size="10" fill="{SLATE}">- Mono readouts: fid / mK / Df</text>
  <text x="410" y="145" font-size="10" fill="{SLATE}">- Ledger = ToolTrace turns</text>
  <text x="410" y="165" font-size="10" fill="{SLATE}">- Composer is secondary</text>
  <text x="410" y="185" font-size="10" fill="{SLATE}">- Details expand in-rail only</text>
  <text x="410" y="205" font-size="10" fill="{SLATE}">- True/applied markers spatial</text>
  <text x="410" y="240" font-size="9" fill="{GREEN}">Ops-first - agent-callable</text>
</svg>''',
)

save(
    "fig-thresholds.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="220" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">TWO THRESHOLDS - READINESS VS CALIBRATION SUCCESS</text>
  <line x1="60" y1="140" x2="200" y2="140" stroke="{RED}" stroke-width="8"/>
  <line x1="200" y1="140" x2="380" y2="140" stroke="{ORANGE}" stroke-width="8"/>
  <line x1="380" y1="140" x2="480" y2="140" stroke="{BLUE}" stroke-width="8"/>
  <line x1="480" y1="140" x2="660" y2="140" stroke="{GREEN}" stroke-width="8"/>
  <text x="60" y="170" font-size="8" fill="{SLATE}">0.55 floor</text>
  <text x="200" y="170" font-size="8" fill="{ORANGE}">0.82 readiness</text>
  <text x="380" y="170" font-size="8" fill="{BLUE}">0.88 cal target</text>
  <text x="640" y="170" text-anchor="end" font-size="8" fill="{GREEN}">~0.99</text>
  <text x="130" y="110" text-anchor="middle" font-size="9" fill="{RED}">stuck / capped</text>
  <text x="290" y="110" text-anchor="middle" font-size="9" fill="{ORANGE}">device not ready</text>
  <text x="430" y="110" text-anchor="middle" font-size="9" fill="{BLUE}">ready; climbing</text>
  <text x="570" y="110" text-anchor="middle" font-size="9" fill="{GREEN}">calibrated</text>
  <text x="60" y="200" font-size="8" fill="{SLATE}">READINESS_READOUT_FIDELITY_THRESHOLD=0.82 - CalibrationService.fidelity_threshold=0.88 - sim clamp [0.55, 0.999]</text>
</svg>''',
)

# sequence
steps = [
    (75, 80, 220, "click Calibrate Q0", BLUE),
    (100, 220, 360, "POST /goals", BLUE),
    (125, 360, 500, "plan -> calibrate_qubit", SLATE),
    (150, 500, 640, "get_calibration(0)", ORANGE),
    (175, 500, 640, "measure_fidelity", ORANGE),
    (205, 500, 640, "apply_update x N", ORANGE),
    (235, 640, 500, "CalibrationResult", GREEN),
    (260, 500, 360, "ToolTrace + history", GREEN),
    (285, 360, 220, "GoalResponse", GREEN),
    (310, 220, 80, "ledger + surface update", BLUE),
    (340, 220, 360, "GET /device/state", SLATE),
]
slines = []
for y, x1, x2, lab, col in steps:
    mid = (x1 + x2) / 2
    slines.append(
        f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{col}" stroke-width="1.4" marker-end="url(#s)"/>'
        f'<text x="{mid}" y="{y-4}" text-anchor="middle" font-size="7.5" fill="{col}">{lab}</text>'
    )
actors2 = [(80, "Operator"), (220, "UI"), (360, "API"), (500, "Orch"), (640, "Sim")]
asvg = "".join(
    f'<text x="{x}" y="48" text-anchor="middle" font-size="9" fill="{BG}" font-weight="600">{t}</text>'
    f'<line x1="{x}" y1="55" x2="{x}" y2="365" stroke="#e2e8f0"/>'
    for x, t in actors2
)
save(
    "fig-seq-calibrate.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 380" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="380" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">WALKTHROUGH - CALIBRATE Q0</text>
  {asvg}
  {"".join(slines)}
  <defs><marker id="s" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="{BG}"/></marker></defs>
</svg>''',
)

# Bell sequence
bsteps = [
    (80, 80, 220, "click Bell pair", BLUE),
    (110, 220, 360, "POST /goals", BLUE),
    (140, 360, 500, "plan -> run_bell_pair", SLATE),
    (170, 500, 640, "submit_job CIRCUIT", ORANGE),
    (200, 640, 500, "counts + est fidelity", GREEN),
    (230, 500, 360, "ToolResult", GREEN),
    (260, 360, 220, "GoalResponse", GREEN),
    (290, 220, 80, "ledger shows counts", BLUE),
]
blines = []
for y, x1, x2, lab, col in bsteps:
    mid = (x1 + x2) / 2
    blines.append(
        f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{col}" stroke-width="1.4" marker-end="url(#s2)"/>'
        f'<text x="{mid}" y="{y-4}" text-anchor="middle" font-size="7.5" fill="{col}">{lab}</text>'
    )
save(
    "fig-seq-bell.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 340" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="340" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">WALKTHROUGH - BELL PAIR</text>
  {asvg.replace("365", "320")}
  {"".join(blines)}
  <defs><marker id="s2" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="{BG}"/></marker></defs>
</svg>''',
)

methods = [
    (40, 50, "submit_job", "QPUJob -> UUID"),
    (260, 50, "poll_job", "UUID -> QPUJob"),
    (480, 50, "cancel_job", "UUID -> bool"),
    (40, 150, "get_device_state", "-> DeviceState"),
    (260, 150, "get_calibration", "qubit -> Params"),
    (480, 150, "apply_calibration_update", "Params -> Result"),
]
mp = []
for x, y, t, s in methods:
    mp.append(f'<rect x="{x}" y="{y}" width="200" height="70" rx="6" fill="{ORANGE}"/>')
    mp.append(f'<text x="{x+100}" y="{y+30}" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">{t}</text>')
    mp.append(f'<text x="{x+100}" y="{y+50}" text-anchor="middle" font-size="9" fill="#ffedd5">{s}</text>')
save(
    "fig-adapter-contract.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 320" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="320" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">QPUADAPTER - SIX-METHOD CONTRACT</text>
  {"".join(mp)}
  <rect x="40" y="245" width="640" height="50" rx="6" fill="#f1f5f9" stroke="{SLATE}"/>
  <text x="360" y="268" text-anchor="middle" font-size="10" fill="{BG}" font-weight="600">factory.create_backend() - CONDUCTOR_QPU_BACKEND=sim|stub</text>
  <text x="360" y="284" text-anchor="middle" font-size="8" fill="{SLATE}">src/conductor_qpu/adapter/base.py - factory.py - noisy_sim.py - hardware_stub.py</text>
</svg>''',
)

tools = [
    ("calibrate_qubit", "CalibrationService.calibrate", BLUE),
    ("run_bell_pair", "submit CIRCUIT bell", ORANGE),
    ("get_device_state", "adapter snapshot", SLATE),
    ("get_job_status", "poll by UUID", SLATE),
    ("cancel_job", "cancel if non-terminal", RED),
]
tp = []
for i, (n, d, c) in enumerate(tools):
    x = 30 + (i % 3) * 230
    y = 50 + (i // 3) * 110
    tp.append(f'<rect x="{x}" y="{y}" width="210" height="90" rx="6" fill="{c}"/>')
    tp.append(f'<text x="{x+105}" y="{y+35}" text-anchor="middle" font-size="12" fill="#fff" font-weight="600">{n}</text>')
    tp.append(f'<text x="{x+105}" y="{y+58}" text-anchor="middle" font-size="9" fill="#f1f5f9">{d}</text>')
save(
    "fig-tools.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="280" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">ORCHESTRATOR TOOL CATALOG (5)</text>
  {"".join(tp)}
</svg>''',
)

cards = [
    (30, "time_to_calibrated", "wall time start to threshold", "seconds - successes only"),
    (255, "calibration_success_rate", "successes / attempts", "running aggregate"),
    (480, "interface_latency", "decision to backend ack", "per apply step sample"),
]
cp = []
for x, t, d, n in cards:
    cp.append(f'<rect x="{x}" y="45" width="210" height="130" rx="8" fill="{BG}"/>')
    cp.append(f'<text x="{x+105}" y="85" text-anchor="middle" font-size="11" fill="{BLUE}" font-weight="600">{t}</text>')
    cp.append(f'<text x="{x+105}" y="115" text-anchor="middle" font-size="10" fill="#e2e8f0">{d}</text>')
    cp.append(f'<text x="{x+105}" y="145" text-anchor="middle" font-size="9" fill="#94a3b8">{n}</text>')
save(
    "fig-metrics.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 200" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="200" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">THE THREE METRICS</text>
  {"".join(cp)}
</svg>''',
)

# failure modes
save(
    "fig-failure-modes.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 260" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="260" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">CALIBRATION FAILURE MODES</text>
  <rect x="30" y="50" width="200" height="180" rx="8" fill="#fef2f2" stroke="{RED}"/>
  <text x="130" y="80" text-anchor="middle" font-size="11" fill="{RED}" font-weight="600">Fid cap (demo)</text>
  <text x="45" y="110" font-size="9" fill="{SLATE}">set_demo_fid_cap(0.69)</text>
  <text x="45" y="130" font-size="9" fill="{SLATE}">POST /demo/fail_next_cal</text>
  <text x="45" y="150" font-size="9" fill="{SLATE}">fidelity stuck below 0.88</text>
  <text x="45" y="180" font-size="9" fill="{SLATE}">success=False</text>
  <text x="45" y="200" font-size="9" fill="{SLATE}">attempts still counted</text>
  <rect x="260" y="50" width="200" height="180" rx="8" fill="#fff7ed" stroke="{ORANGE}"/>
  <text x="360" y="80" text-anchor="middle" font-size="11" fill="{ORANGE}" font-weight="600">Max iterations</text>
  <text x="275" y="110" font-size="9" fill="{SLATE}">max_iterations=60 (API)</text>
  <text x="275" y="130" font-size="9" fill="{SLATE}">patience restarts widen</text>
  <text x="275" y="150" font-size="9" fill="{SLATE}">best_fid may be &lt; thresh</text>
  <text x="275" y="180" font-size="9" fill="{SLATE}">message: In progress /</text>
  <text x="275" y="200" font-size="9" fill="{SLATE}">Max iterations reached</text>
  <rect x="490" y="50" width="200" height="180" rx="8" fill="#f1f5f9" stroke="{SLATE}"/>
  <text x="590" y="80" text-anchor="middle" font-size="11" fill="{SLATE}" font-weight="600">Stub backend</text>
  <text x="505" y="110" font-size="9" fill="{SLATE}">measure_fidelity = 0.55</text>
  <text x="505" y="130" font-size="9" fill="{SLATE}">is_ready always False</text>
  <text x="505" y="150" font-size="9" fill="{SLATE}">circuits fail NotImpl</text>
  <text x="505" y="180" font-size="9" fill="{SLATE}">shape-only seam for</text>
  <text x="505" y="200" font-size="9" fill="{SLATE}">real driver plug-in</text>
</svg>''',
)

# colour legend plate diagram
save(
    "fig-colour-legend.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="160" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">DIAGRAM COLOUR LEGEND</text>
  items = []
</svg>''',
)

items = [
    (40, SLATE, "Slate", "Control plane / orchestrator"),
    (180, BLUE, "Blue #007AFF", "True / target / high fidelity"),
    (360, ORANGE, "Orange #FF9500", "Applied / mid / threshold"),
    (540, GREEN, "Green #34C759", "Success / ready / LIVE"),
]
ip = []
for x, c, name, desc in items:
    ip.append(f'<rect x="{x}" y="50" width="130" height="80" rx="6" fill="{c}"/>')
    ip.append(f'<text x="{x+65}" y="85" text-anchor="middle" font-size="10" fill="#fff" font-weight="600">{name}</text>')
    ip.append(f'<text x="{x+65}" y="105" text-anchor="middle" font-size="8" fill="#f8fafc">{desc.split("/")[0].strip()}</text>')
save(
    "fig-colour-legend.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="720" height="160" fill="#fff"/>
  <text x="16" y="22" font-size="10" fill="{SLATE}" letter-spacing="1.2">DIAGRAM COLOUR LEGEND</text>
  {"".join(ip)}
  <text x="40" y="150" font-size="8" fill="{RED}">Red #FF3B30 = failure / cancel / chat-only critique</text>
</svg>''',
)

# package layout
save(
    "fig-package.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 340" font-family="Menlo, Consolas, monospace">
  <rect width="720" height="340" fill="#0f172a"/>
  <text x="16" y="24" font-size="10" fill="#94a3b8" letter-spacing="1.2" font-family="Helvetica Neue, sans-serif">PACKAGE LAYOUT - src/conductor_qpu</text>
  lines = [
    "conductor_qpu/",
    "  adapter/          QPUAdapter + sim + stub + factory",
    "  api/              FastAPI server (CORS, SSE, demos)",
    "  calibration/      CalibrationService + metrics",
    "  jobs/             InMemoryJobStore",
    "  models/           types.py (Job*, DeviceState, Params)",
    "  observability/    MetricsAggregator",
    "  orchestrator/     Orchestrator + planner",
    "  ui/               legacy Python UI entry (optional)",
    "",
    "ui/                 Next.js instrument (separate tree)",
    "tests/              pytest contract + convergence",
    "demo_scripts/       founder / cal / circuit demos",
  ]
  y=50
  out=[]
</svg>''',
)

pkg_lines = [
    ("conductor_qpu/", BLUE),
    ("  adapter/          QPUAdapter + sim + stub + factory", "#e2e8f0"),
    ("  api/              FastAPI server (CORS, SSE, demos)", "#e2e8f0"),
    ("  calibration/      CalibrationService + metrics", "#e2e8f0"),
    ("  jobs/             InMemoryJobStore", "#e2e8f0"),
    ("  models/           types.py (Job*, DeviceState, Params)", "#e2e8f0"),
    ("  observability/    MetricsAggregator", "#e2e8f0"),
    ("  orchestrator/     Orchestrator + planner", "#e2e8f0"),
    ("  ui/               legacy Python UI entry (optional)", "#94a3b8"),
    ("", "#e2e8f0"),
    ("ui/                 Next.js instrument (separate tree)", ORANGE),
    ("tests/              pytest contract + convergence", GREEN),
    ("demo_scripts/       founder / cal / circuit demos", GREEN),
]
pl = []
for i, (line, col) in enumerate(pkg_lines):
    pl.append(f'<text x="40" y="{50 + i*20}" font-size="11" fill="{col}">{line}</text>')
save(
    "fig-package.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 340" font-family="Menlo, Consolas, monospace">
  <rect width="720" height="340" fill="#0f172a"/>
  <text x="16" y="24" font-size="10" fill="#94a3b8" letter-spacing="1.2" font-family="Helvetica Neue, sans-serif">PACKAGE LAYOUT - src/conductor_qpu</text>
  {"".join(pl)}
</svg>''',
)

print("TOTAL", len(list(OUT.glob("*.svg"))))
