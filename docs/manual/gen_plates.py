#!/usr/bin/env python3
"""Mid-century / Swiss / Atoms-for-Peace SVG plates for the AI→QPU manual.

Palette matches cover-bloch.svg: seafoam, olive, translucent blues, one red accent.
Extended sans, geometric clarity — not dark web-UI charts.
"""
from pathlib import Path

OUT = Path(__file__).parent / "diagrams"
OUT.mkdir(exist_ok=True)

# Cover-matching tokens
SEA = "#c5d5d8"
SEA_DEEP = "#a8bbc0"
CREAM = "#eef2f0"
INK = "#1a1a1a"
INK_SOFT = "#2a2a2a"
OLIVE = "#7a8a4a"
OLIVE_SOFT = "#9aaa6a"
BLUE = "#5a8fb5"
BLUE_DEEP = "#3d6a8c"
BLUE_SOFT = "#8bb0c8"
RED = "#c41e1e"
WHITE = "#f7faf9"
MUTED = "#4a5560"

FONT = 'font-family="Helvetica Neue, Helvetica, Arial, sans-serif"'


def save(name: str, svg: str) -> None:
    (OUT / name).write_text(svg)
    print(f"  plate {name} ({len(svg)} B)")


def title(text: str, x: int = 36, y: int = 36) -> str:
    return (
        f'<text x="{x}" y="{y}" font-size="11" fill="{INK}" '
        f'letter-spacing="0.28em" font-weight="500" {FONT}>{text}</text>'
    )


def subtitle(text: str, x: int = 36, y: int = 56) -> str:
    return (
        f'<text x="{x}" y="{y}" font-size="9" fill="{MUTED}" '
        f'letter-spacing="0.12em" {FONT}>{text}</text>'
    )


def arrow_defs(uid: str = "a") -> str:
    return f'''<defs>
  <marker id="arr-{uid}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,0 L8,4 L0,8 Z" fill="{INK}"/>
  </marker>
  <marker id="arr-{uid}-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0,0 L8,4 L0,8 Z" fill="{RED}"/>
  </marker>
</defs>'''


# ---------------------------------------------------------------------------
# 1. Whole machine
# ---------------------------------------------------------------------------
save(
    "plate-whole-machine.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420" {FONT}>
  <rect width="760" height="420" fill="{SEA}"/>
  {arrow_defs("w")}
  {title("PLATE 01  ·  THE WHOLE MACHINE")}
  {subtitle("HUMAN INTENT  →  AGENT  →  ADAPTER  →  SIMULATOR / QPU  →  FIDELITY  →  INSTRUMENT")}

  <!-- soft background discs -->
  <circle cx="120" cy="230" r="78" fill="{BLUE}" fill-opacity="0.22"/>
  <circle cx="380" cy="210" r="95" fill="{OLIVE}" fill-opacity="0.16"/>
  <circle cx="640" cy="240" r="88" fill="{BLUE_DEEP}" fill-opacity="0.18"/>

  <!-- nodes -->
  <g>
    <rect x="28" y="160" width="112" height="72" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    <text x="84" y="190" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.06em">INTENT</text>
    <text x="84" y="210" text-anchor="middle" font-size="8.5" fill="{MUTED}">NL goal</text>
  </g>
  <g>
    <rect x="168" y="160" width="112" height="72" rx="6" fill="{BLUE}" fill-opacity="0.55" stroke="{INK}" stroke-width="1.2"/>
    <text x="224" y="190" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.06em">AGENT</text>
    <text x="224" y="210" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">5 tools · traces</text>
  </g>
  <g>
    <rect x="308" y="160" width="112" height="72" rx="6" fill="{OLIVE}" fill-opacity="0.45" stroke="{INK}" stroke-width="1.2"/>
    <text x="364" y="186" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.06em">ADAPTER</text>
    <text x="364" y="204" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">6-method waist</text>
    <text x="364" y="218" text-anchor="middle" font-size="7.5" fill="{RED}" font-weight="600">FIREWALL</text>
  </g>
  <g>
    <rect x="448" y="148" width="112" height="96" rx="6" fill="{BLUE_DEEP}" fill-opacity="0.35" stroke="{INK}" stroke-width="1.2"/>
    <text x="504" y="178" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.04em">PHYSICS</text>
    <text x="504" y="198" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">sim (default)</text>
    <text x="504" y="214" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">or QPU stub</text>
    <circle cx="504" cy="230" r="4" fill="{RED}"/>
  </g>
  <g>
    <rect x="588" y="160" width="144" height="72" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    <text x="660" y="186" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.04em">INSTRUMENT</text>
    <text x="660" y="206" text-anchor="middle" font-size="8.5" fill="{MUTED}">stage · dock · HUD</text>
  </g>

  <!-- forward arrows -->
  <line x1="140" y1="196" x2="164" y2="196" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-w)"/>
  <line x1="280" y1="196" x2="304" y2="196" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-w)"/>
  <line x1="420" y1="196" x2="444" y2="196" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-w)"/>
  <line x1="560" y1="196" x2="584" y2="196" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-w)"/>

  <!-- fidelity feedback arc -->
  <path d="M660 232 C660 310, 120 310, 84 232" fill="none" stroke="{RED}" stroke-width="1.5"
        stroke-dasharray="5 4" marker-end="url(#arr-w-red)"/>
  <text x="372" y="338" text-anchor="middle" font-size="9" fill="{RED}" letter-spacing="0.18em" font-weight="600">FIDELITY BACK</text>
  <text x="372" y="356" text-anchor="middle" font-size="8" fill="{MUTED}">detuning · readiness · tool traces · metrics</text>

  <!-- small legend -->
  <circle cx="36" cy="392" r="5" fill="{BLUE}" fill-opacity="0.55"/>
  <text x="48" y="396" font-size="8" fill="{MUTED}">control</text>
  <circle cx="110" cy="392" r="5" fill="{OLIVE}" fill-opacity="0.55"/>
  <text x="122" y="396" font-size="8" fill="{MUTED}">contract</text>
  <circle cx="190" cy="392" r="5" fill="{RED}"/>
  <text x="202" y="396" font-size="8" fill="{MUTED}">accent / stop</text>
</svg>''',
)

# ---------------------------------------------------------------------------
# 2. Calibration loop
# ---------------------------------------------------------------------------
save(
    "plate-cal-loop.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420" {FONT}>
  <rect width="760" height="420" fill="{CREAM}"/>
  {arrow_defs("c")}
  {title("PLATE 02  ·  CALIBRATION LOOP")}
  {subtitle("MEASURE  →  DECIDE (≥ 0.88?)  →  APPLY  →  REMEASURE")}

  <!-- central olive ring -->
  <circle cx="380" cy="230" r="148" fill="none" stroke="{OLIVE}" stroke-width="1.2" opacity="0.55"/>
  <circle cx="380" cy="230" r="118" fill="{BLUE}" fill-opacity="0.12"/>

  <!-- four stations on a square -->
  <g>
    <circle cx="380" cy="100" r="48" fill="{BLUE}" fill-opacity="0.5" stroke="{INK}" stroke-width="1.2"/>
    <text x="380" y="96" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.08em">1 MEASURE</text>
    <text x="380" y="112" text-anchor="middle" font-size="8" fill="{INK_SOFT}">fidelity(q)</text>
  </g>
  <g>
    <circle cx="520" cy="230" r="48" fill="{OLIVE}" fill-opacity="0.5" stroke="{INK}" stroke-width="1.2"/>
    <text x="520" y="222" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.08em">2 DECIDE</text>
    <text x="520" y="238" text-anchor="middle" font-size="8" fill="{INK_SOFT}">≥ 0.88?</text>
    <text x="520" y="252" text-anchor="middle" font-size="7.5" fill="{MUTED}">or sample</text>
  </g>
  <g>
    <circle cx="380" cy="360" r="48" fill="{BLUE_DEEP}" fill-opacity="0.45" stroke="{INK}" stroke-width="1.2"/>
    <text x="380" y="352" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.08em">3 APPLY</text>
    <text x="380" y="368" text-anchor="middle" font-size="8" fill="{INK_SOFT}">update params</text>
  </g>
  <g>
    <circle cx="240" cy="230" r="48" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    <text x="240" y="222" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.06em">4 REMEASURE</text>
    <text x="240" y="238" text-anchor="middle" font-size="8" fill="{MUTED}">loop / stop</text>
  </g>

  <!-- cycle arrows -->
  <path d="M422 125 Q490 130 488 188" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-c)"/>
  <path d="M505 272 Q500 330 422 348" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-c)"/>
  <path d="M338 348 Q270 330 272 272" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-c)"/>
  <path d="M272 188 Q270 130 338 125" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-c)"/>

  <!-- success / fail exit -->
  <rect x="600" y="168" width="130" height="124" rx="6" fill="{SEA}" stroke="{INK}" stroke-width="1"/>
  <text x="665" y="196" text-anchor="middle" font-size="9" fill="{MUTED}" letter-spacing="0.14em">STOP</text>
  <circle cx="640" cy="220" r="6" fill="{OLIVE}"/>
  <text x="654" y="224" font-size="9" fill="{INK}" font-weight="600">success</text>
  <text x="654" y="238" font-size="8" fill="{MUTED}">best ≥ 0.88</text>
  <circle cx="640" cy="262" r="6" fill="{RED}"/>
  <text x="654" y="266" font-size="9" fill="{INK}" font-weight="600">fail</text>
  <text x="654" y="280" font-size="8" fill="{MUTED}">max iters / cap</text>

  <line x1="568" y1="230" x2="598" y2="230" stroke="{RED}" stroke-width="1.3" marker-end="url(#arr-c-red)"/>
</svg>''',
)

# ---------------------------------------------------------------------------
# 3. Language → physics with firewall
# ---------------------------------------------------------------------------
save(
    "plate-language-firewall.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 400" {FONT}>
  <rect width="760" height="400" fill="{SEA}"/>
  {arrow_defs("f")}
  {title("PLATE 03  ·  LANGUAGE → PHYSICS")}
  {subtitle("DECISIONS  →  NUMBERS  →  CONTRACT  →  PHYSICS   ·   FIREWALL AT THE ADAPTER")}

  <!-- cascade of geometric blocks -->
  <g>
    <rect x="40" y="100" width="120" height="200" rx="4" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    <text x="100" y="140" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.1em">LANGUAGE</text>
    <text x="100" y="170" text-anchor="middle" font-size="8.5" fill="{MUTED}">“Calibrate Q0”</text>
    <text x="100" y="196" text-anchor="middle" font-size="8.5" fill="{MUTED}">composer</text>
    <text x="100" y="212" text-anchor="middle" font-size="8.5" fill="{MUTED}">chips · ⌘K</text>
  </g>
  <g>
    <rect x="190" y="100" width="120" height="200" rx="4" fill="{BLUE}" fill-opacity="0.35" stroke="{INK}" stroke-width="1.2"/>
    <text x="250" y="140" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.1em">DECISIONS</text>
    <text x="250" y="170" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">ToolCall list</text>
    <text x="250" y="196" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">planner</text>
    <text x="250" y="212" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">(LLM optional)</text>
  </g>
  <g>
    <rect x="340" y="100" width="120" height="200" rx="4" fill="{OLIVE}" fill-opacity="0.4" stroke="{INK}" stroke-width="1.2"/>
    <text x="400" y="140" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.1em">NUMBERS</text>
    <text x="400" y="170" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">qubit_id</text>
    <text x="400" y="186" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">Δfreq · Δamp</text>
    <text x="400" y="210" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">threshold 0.88</text>
  </g>

  <!-- firewall bar -->
  <g>
    <rect x="490" y="88" width="24" height="224" rx="2" fill="{RED}"/>
    <text x="502" y="70" text-anchor="middle" font-size="8" fill="{RED}" font-weight="700" letter-spacing="0.16em">FIREWALL</text>
    <text transform="rotate(-90 502 200)" x="502" y="200" text-anchor="middle" font-size="9" fill="{WHITE}" letter-spacing="0.2em">ADAPTER</text>
  </g>

  <g>
    <rect x="540" y="100" width="180" height="200" rx="4" fill="{BLUE_DEEP}" fill-opacity="0.32" stroke="{INK}" stroke-width="1.2"/>
    <text x="630" y="140" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.1em">PHYSICS</text>
    <text x="630" y="170" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">typed ops only</text>
    <text x="630" y="194" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">submit · poll · cancel</text>
    <text x="630" y="210" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">get / apply cal</text>
    <text x="630" y="234" text-anchor="middle" font-size="8.5" fill="{INK_SOFT}">device state</text>
    <circle cx="630" cy="268" r="10" fill="{RED}" fill-opacity="0.85"/>
    <text x="630" y="271" text-anchor="middle" font-size="7" fill="{WHITE}" font-weight="700">Q</text>
  </g>

  <line x1="160" y1="200" x2="186" y2="200" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-f)"/>
  <line x1="310" y1="200" x2="336" y2="200" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-f)"/>
  <line x1="460" y1="200" x2="486" y2="200" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-f)"/>
  <line x1="514" y1="200" x2="536" y2="200" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-f)"/>

  <text x="380" y="360" text-anchor="middle" font-size="9" fill="{MUTED}">Prose never reaches the device. Only typed CalibrationParams and Job payloads cross the red bar.</text>
</svg>''',
)

# ---------------------------------------------------------------------------
# 4. Stage vs dock
# ---------------------------------------------------------------------------
save(
    "plate-stage-dock.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420" {FONT}>
  <rect width="760" height="420" fill="{CREAM}"/>
  {title("PLATE 04  ·  STAGE VS DOCK")}
  {subtitle("PHYSICS IN THE VISUAL FIELD  ·  AGENCY IN THE LEDGER")}

  <!-- instrument chrome outline -->
  <rect x="60" y="80" width="640" height="300" rx="8" fill="{SEA}" stroke="{INK}" stroke-width="1.4"/>

  <!-- stage 65% -->
  <rect x="70" y="90" width="620" height="178" rx="4" fill="{BLUE}" fill-opacity="0.28"/>
  <text x="90" y="118" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.2em">STAGE  ·  ~65%</text>
  <text x="90" y="138" font-size="9" fill="{MUTED}">physics · continuous state</text>

  <!-- drift | device tabs -->
  <rect x="90" y="156" width="52" height="22" rx="11" fill="{WHITE}" stroke="{INK}" stroke-width="1"/>
  <text x="116" y="171" text-anchor="middle" font-size="8" font-weight="600" fill="{INK}">drift</text>
  <rect x="150" y="156" width="58" height="22" rx="11" fill="{INK}"/>
  <text x="179" y="171" text-anchor="middle" font-size="8" font-weight="600" fill="{WHITE}">device</text>

  <!-- stylized landscape / cryo hint -->
  <ellipse cx="380" cy="220" rx="160" ry="36" fill="{OLIVE}" fill-opacity="0.25"/>
  <circle cx="340" cy="210" r="18" fill="{BLUE_DEEP}" fill-opacity="0.7"/>
  <circle cx="420" cy="214" r="14" fill="{OLIVE}" fill-opacity="0.7"/>
  <circle cx="348" cy="206" r="3.5" fill="{RED}"/>
  <circle cx="428" cy="210" r="3.5" fill="{WHITE}" stroke="{INK}" stroke-width="0.8"/>
  <text x="560" y="200" font-size="8" fill="{MUTED}">true / applied</text>
  <text x="560" y="216" font-size="8" fill="{MUTED}">mK · readiness</text>

  <!-- dock 35% with progressive blur hint -->
  <defs>
    <linearGradient id="blurGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{WHITE}" stop-opacity="0.15"/>
      <stop offset="35%" stop-color="{WHITE}" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="{WHITE}" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect x="70" y="268" width="620" height="102" rx="4" fill="url(#blurGrad)" stroke="{INK}" stroke-width="1"/>
  <text x="90" y="296" font-size="10" font-weight="700" fill="{INK}" letter-spacing="0.2em">DOCK  ·  ~35%</text>
  <text x="90" y="316" font-size="9" fill="{MUTED}">agency · ledger · composer · chips</text>

  <!-- ledger rows -->
  <rect x="90" y="330" width="200" height="10" rx="2" fill="{INK}" fill-opacity="0.12"/>
  <rect x="90" y="346" width="160" height="10" rx="2" fill="{INK}" fill-opacity="0.08"/>
  <rect x="320" y="330" width="140" height="28" rx="14" fill="{OLIVE}" fill-opacity="0.45" stroke="{INK}" stroke-width="0.8"/>
  <text x="390" y="348" text-anchor="middle" font-size="8" font-weight="600" fill="{INK}">Calibrate Q0</text>
  <rect x="480" y="330" width="180" height="28" rx="4" fill="{WHITE}" stroke="{INK}" stroke-width="1"/>
  <text x="500" y="348" font-size="8" fill="{MUTED}">ask the instrument…</text>

  <text x="380" y="404" text-anchor="middle" font-size="8.5" fill="{MUTED}">Stage keeps detuning and fidelity in view; dock keeps the agent auditable.</text>
</svg>''',
)

# ---------------------------------------------------------------------------
# 5. Metrics scoreboard
# ---------------------------------------------------------------------------
save(
    "plate-metrics.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 360" {FONT}>
  <rect width="760" height="360" fill="{SEA}"/>
  {title("PLATE 05  ·  METRICS SCOREBOARD")}
  {subtitle("TIME-TO-CAL  ·  SUCCESS RATE  ·  INTERFACE LATENCY")}

  <!-- three large cards -->
  <g>
    <rect x="40" y="90" width="210" height="220" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
    <circle cx="145" cy="160" r="42" fill="{BLUE}" fill-opacity="0.35"/>
    <text x="145" y="166" text-anchor="middle" font-size="22" font-weight="700" fill="{INK}">t</text>
    <text x="145" y="230" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.14em">TIME-TO-CAL</text>
    <text x="145" y="252" text-anchor="middle" font-size="8.5" fill="{MUTED}">wall seconds to</text>
    <text x="145" y="266" text-anchor="middle" font-size="8.5" fill="{MUTED}">best_fid ≥ 0.88</text>
    <text x="145" y="288" text-anchor="middle" font-size="8" fill="{BLUE_DEEP}">successes only</text>
  </g>
  <g>
    <rect x="275" y="90" width="210" height="220" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
    <circle cx="380" cy="160" r="42" fill="{OLIVE}" fill-opacity="0.4"/>
    <text x="380" y="166" text-anchor="middle" font-size="20" font-weight="700" fill="{INK}">%</text>
    <text x="380" y="230" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.14em">SUCCESS RATE</text>
    <text x="380" y="252" text-anchor="middle" font-size="8.5" fill="{MUTED}">successes ÷ attempts</text>
    <text x="380" y="266" text-anchor="middle" font-size="8.5" fill="{MUTED}">running aggregate</text>
    <text x="380" y="288" text-anchor="middle" font-size="8" fill="{OLIVE}">CalibrationMetrics</text>
  </g>
  <g>
    <rect x="510" y="90" width="210" height="220" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
    <circle cx="615" cy="160" r="42" fill="{BLUE_DEEP}" fill-opacity="0.35"/>
    <!-- red accent dot for latency -->
    <circle cx="640" cy="140" r="5" fill="{RED}"/>
    <text x="615" y="166" text-anchor="middle" font-size="18" font-weight="700" fill="{INK}">Δt</text>
    <text x="615" y="230" text-anchor="middle" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.1em">LATENCY</text>
    <text x="615" y="252" text-anchor="middle" font-size="8.5" fill="{MUTED}">per apply_update</text>
    <text x="615" y="266" text-anchor="middle" font-size="8.5" fill="{MUTED}">roundtrip sample</text>
    <text x="615" y="288" text-anchor="middle" font-size="8" fill="{BLUE_DEEP}">interface cost</text>
  </g>
</svg>''',
)

# ---------------------------------------------------------------------------
# 6. Real artifact vs stand-in sim
# ---------------------------------------------------------------------------
save(
    "plate-real-vs-sim.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 400" {FONT}>
  <rect width="760" height="400" fill="{CREAM}"/>
  {title("PLATE 06  ·  REAL ARTIFACT VS STAND-IN")}
  {subtitle("WHAT SHIPS AS SOFTWARE  ·  WHAT STANDS IN FOR THE FRIDGE")}

  <!-- left: real -->
  <rect x="40" y="88" width="320" height="270" rx="8" fill="{SEA}" stroke="{INK}" stroke-width="1.4"/>
  <rect x="40" y="88" width="320" height="40" rx="8" fill="{OLIVE}" fill-opacity="0.55"/>
  <rect x="40" y="112" width="320" height="16" fill="{OLIVE}" fill-opacity="0.55"/>
  <text x="200" y="114" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}" letter-spacing="0.18em">REAL ARTIFACT</text>

  <circle cx="90" cy="180" r="8" fill="{OLIVE}"/>
  <text x="110" y="184" font-size="10" fill="{INK}">QPUAdapter contract (6 methods)</text>
  <circle cx="90" cy="210" r="8" fill="{OLIVE}"/>
  <text x="110" y="214" font-size="10" fill="{INK}">CalibrationService + metrics</text>
  <circle cx="90" cy="240" r="8" fill="{OLIVE}"/>
  <text x="110" y="244" font-size="10" fill="{INK}">Orchestrator · tools · traces</text>
  <circle cx="90" cy="270" r="8" fill="{OLIVE}"/>
  <text x="110" y="274" font-size="10" fill="{INK}">FastAPI control plane</text>
  <circle cx="90" cy="300" r="8" fill="{OLIVE}"/>
  <text x="110" y="304" font-size="10" fill="{INK}">Instrument UI (drift | device)</text>
  <text x="200" y="340" text-anchor="middle" font-size="8.5" fill="{MUTED}">durable seam — keep this</text>

  <!-- right: stand-in -->
  <rect x="400" y="88" width="320" height="270" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.4"/>
  <rect x="400" y="88" width="320" height="40" rx="8" fill="{BLUE}" fill-opacity="0.45"/>
  <rect x="400" y="112" width="320" height="16" fill="{BLUE}" fill-opacity="0.45"/>
  <text x="560" y="114" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}" letter-spacing="0.14em">STAND-IN SIM</text>

  <circle cx="450" cy="180" r="8" fill="{BLUE_DEEP}"/>
  <text x="470" y="184" font-size="10" fill="{INK}">NoisySimulatorBackend</text>
  <circle cx="450" cy="210" r="8" fill="{BLUE_DEEP}"/>
  <text x="470" y="214" font-size="10" fill="{INK}">hidden true params + drift</text>
  <circle cx="450" cy="240" r="8" fill="{BLUE_DEEP}"/>
  <text x="470" y="244" font-size="10" fill="{INK}">toy fidelity kernel</text>
  <circle cx="450" cy="270" r="8" fill="{BLUE_DEEP}"/>
  <text x="470" y="274" font-size="10" fill="{INK}">stochastic Bell counts</text>
  <circle cx="450" cy="300" r="8" fill="{RED}"/>
  <text x="470" y="304" font-size="10" fill="{INK}">not a dilution refrigerator</text>
  <text x="560" y="340" text-anchor="middle" font-size="8.5" fill="{MUTED}">replaceable behind the adapter</text>
</svg>''',
)


# ---------------------------------------------------------------------------
# A. Who this is for — engineer, operator, technical lead. One instrument.
# The lead evaluates the product for their stack. Not a timed trial.
# ---------------------------------------------------------------------------
save(
    "plate-who-for.svg",
    f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 480" {FONT}>
  <rect width="760" height="480" fill="{SEA}"/>
  {arrow_defs("who")}
  {title("WHO THIS IS FOR")}
  {subtitle("THREE ROLES  ·  ONE INSTRUMENT")}

  <circle cx="140" cy="188" r="108" fill="{BLUE}" fill-opacity="0.16"/>
  <circle cx="380" cy="188" r="118" fill="{OLIVE}" fill-opacity="0.13"/>
  <circle cx="620" cy="188" r="112" fill="{BLUE_DEEP}" fill-opacity="0.14"/>

  <!-- 01 engineer: hexagon (the seam), left -->
  <g>
    <polygon points="140.0,88.0 237.0,144.0 237.0,256.0 140.0,312.0 43.0,256.0 43.0,144.0"
             fill="{OLIVE}" fill-opacity="0.55" stroke="{INK}" stroke-width="1.4"/>
    <text x="140" y="162" text-anchor="middle" font-size="9" fill="{INK_SOFT}" letter-spacing="0.22em">01</text>
    <text x="140" y="186" text-anchor="middle" font-size="13" font-weight="700" fill="{INK}" letter-spacing="0.08em">ENGINEER</text>
    <text x="140" y="206" text-anchor="middle" font-size="9" fill="{INK_SOFT}">control software</text>
    <text x="140" y="228" text-anchor="middle" font-size="10" fill="{INK}">language to adapter</text>
    <text x="140" y="246" text-anchor="middle" font-size="10" fill="{INK}">QPUAdapter seam</text>
    <text x="140" y="264" text-anchor="middle" font-size="10" fill="{INK}">traces · cal loop</text>
  </g>

  <!-- 02 operator: circle -->
  <g>
    <circle cx="380" cy="194" r="100" fill="{BLUE}" fill-opacity="0.50" stroke="{INK}" stroke-width="1.4"/>
    <text x="380" y="158" text-anchor="middle" font-size="9" fill="{INK_SOFT}" letter-spacing="0.22em">02</text>
    <text x="380" y="182" text-anchor="middle" font-size="13" font-weight="700" fill="{INK}" letter-spacing="0.1em">OPERATOR</text>
    <text x="380" y="200" text-anchor="middle" font-size="9" fill="{INK_SOFT}">day to day</text>
    <text x="380" y="222" text-anchor="middle" font-size="10" font-weight="600" fill="{INK}">LIVE / READY</text>
    <text x="380" y="240" text-anchor="middle" font-size="10" fill="{INK}">calibrate · circuits</text>
    <text x="380" y="258" text-anchor="middle" font-size="10" fill="{INK}">cancel · Δf</text>
  </g>

  <!-- 03 technical lead: rectangle (integration with their stack), right -->
  <g>
    <rect x="528" y="100" width="184" height="188" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.4"/>
    <text x="620" y="128" text-anchor="middle" font-size="9" fill="{MUTED}" letter-spacing="0.22em">03</text>
    <text x="620" y="152" text-anchor="middle" font-size="13" font-weight="700" fill="{INK}" letter-spacing="0.08em">TECH LEAD</text>
    <text x="620" y="170" text-anchor="middle" font-size="9" fill="{MUTED}">your stack</text>
    <line x1="558" y1="186" x2="682" y2="186" stroke="{OLIVE}" stroke-width="1.2"/>
    <text x="620" y="210" text-anchor="middle" font-size="10" fill="{INK}">adapter seam</text>
    <text x="620" y="228" text-anchor="middle" font-size="10" fill="{INK}">three metrics</text>
    <text x="620" y="246" text-anchor="middle" font-size="10" fill="{INK}">calibrate to READY</text>
    <text x="620" y="264" text-anchor="middle" font-size="10" fill="{INK}">then a Bell pair</text>
  </g>

  <line x1="140" y1="312" x2="200" y2="356" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-who)"/>
  <line x1="380" y1="294" x2="380" y2="356" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-who)"/>
  <line x1="620" y1="288" x2="560" y2="356" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-who)"/>

  <rect x="80" y="364" width="600" height="78" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.4"/>
  <text x="380" y="396" text-anchor="middle" font-size="13" font-weight="700" fill="{INK}" letter-spacing="0.2em">INSTRUMENT</text>
  <text x="380" y="418" text-anchor="middle" font-size="10" fill="{MUTED}">one stage  ·  one dock  ·  one toolbar</text>
</svg>""",
)


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _task_card(x, y, w, h, rail, title_fill, kicker, title, steps):
    """steps: (label, line, sub). Three stations inside one card: goal → tool → outcome."""
    parts = [
        "<g>",
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>',
        f'<rect x="{x}" y="{y}" width="{w}" height="42" rx="8" fill="{rail}"/>',
        f'<rect x="{x}" y="{y + 26}" width="{w}" height="16" fill="{rail}"/>',
        f'<text x="{x + 18}" y="{y + 27}" font-size="13" font-weight="700" fill="{title_fill}" letter-spacing="0.14em">{_esc(title)}</text>',
        f'<text x="{x + w - 16}" y="{y + 27}" text-anchor="end" font-size="10" fill="{title_fill}" letter-spacing="0.16em">{_esc(kicker)}</text>',
    ]
    top = y + 78
    gap = 52
    line_x = x + 36
    parts.append(
        f'<line x1="{line_x}" y1="{top}" x2="{line_x}" y2="{top + gap * (len(steps) - 1)}" stroke="{INK}" stroke-width="1.2"/>'
    )
    for i, (label, line, sub) in enumerate(steps):
        cy = top + gap * i
        parts.append(f'<circle cx="{line_x}" cy="{cy}" r="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>')
        parts.append(
            f'<text x="{line_x}" y="{cy + 3.5}" text-anchor="middle" font-size="8" font-weight="700" fill="{INK}">{i + 1}</text>'
        )
        parts.append(
            f'<text x="{x + 56}" y="{cy - 6}" font-size="8" fill="{MUTED}" letter-spacing="0.16em">{_esc(label)}</text>'
        )
        parts.append(
            f'<text x="{x + 56}" y="{cy + 10}" font-size="12" font-weight="600" fill="{INK}">{_esc(line)}</text>'
        )
        if sub:
            parts.append(
                f'<text x="{x + 56}" y="{cy + 26}" font-size="9.5" fill="{MUTED}">{_esc(sub)}</text>'
            )
    parts.append("</g>")
    return "\n".join(parts)


_cards = "\n".join(
    [
        _task_card(
            36, 78, 334, 214, BLUE, INK, "01", "CALIBRATE",
            [
                ("GOAL", "Bring qubit 0 to ready", "Calibrate Q0 chip"),
                ("TOOL", "calibrate_qubit", ""),
                ("OUTCOME", "Toolbar READY", "device.is_ready · agent affirms"),
            ],
        ),
        _task_card(
            390, 78, 334, 214, OLIVE, INK, "02", "BELL",
            [
                ("GOAL", "Bell pair chip", "bell · circuit · pair"),
                ("TOOL", "run_bell_pair", ""),
                ("OUTCOME", "Ledger 00 and 11", "01 and 10 are the errors"),
            ],
        ),
        _task_card(
            36, 310, 334, 214, BLUE_DEEP, WHITE, "03", "STATUS",
            [
                ("GOAL", "device state", "health · status · temperature"),
                ("TOOL", "get_device_state", ""),
                ("OUTCOME", "Read LIVE / READY", "fidelity · Δf · state chip"),
            ],
        ),
        _task_card(
            390, 310, 334, 214, RED, WHITE, "04", "CANCEL",
            [
                ("GOAL", "cancel <job-id>", "one job, not the session"),
                ("TOOL", "cancel_job", ""),
                ("OUTCOME", "That job stops", "it does not stay running"),
            ],
        ),
    ]
)

save(
    "plate-four-tasks.svg",
    f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 580" {FONT}>
  <rect width="760" height="580" fill="{CREAM}"/>
  {title("FOUR TASKS")}
  {subtitle("NATURAL-LANGUAGE GOAL  →  ONE TOOL  →  A RESULT YOU CAN SEE")}
  {_cards}
  <text x="380" y="552" text-anchor="middle" font-size="10" fill="{MUTED}">No keyword match: get_device_state, then a soft calibrate (qubit 0, target 0.85). Not a fifth task.</text>
</svg>""",
)

print("mid-century plates written to", OUT)

# Part 1 architecture plates: see gen_qpu_plates.py (called from build.sh)
