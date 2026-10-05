#!/usr/bin/env python3
"""Sophisticated QPU architecture plates for Part 1 (mid-century print style).

Callout-number letter figures with STE legends. Fewer on-diagram words.
Wider canvases and generous vertical spacing to avoid overlaps.
"""
from pathlib import Path

OUT = Path(__file__).parent / "diagrams"
OUT.mkdir(exist_ok=True)

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
GOLD = "#b08d3c"

FONT = 'font-family="Helvetica Neue, Helvetica, Arial, sans-serif"'


def save(name: str, svg: str) -> None:
    (OUT / name).write_text(svg)
    print(f"  qpu plate {name} ({len(svg)} B)")


def title(text: str, x: int = 28, y: int = 30) -> str:
    return (
        f'<text x="{x}" y="{y}" font-size="11" fill="{INK}" '
        f'letter-spacing="0.22em" font-weight="500" {FONT}>{text}</text>'
    )


def subtitle(text: str, x: int = 28, y: int = 50) -> str:
    return (
        f'<text x="{x}" y="{y}" font-size="8.5" fill="{MUTED}" '
        f'letter-spacing="0.08em" {FONT}>{text}</text>'
    )


def callout(n: int, cx: int, cy: int, r: int = 12) -> str:
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{INK}"/>'
        f'<text x="{cx}" y="{cy + 4}" text-anchor="middle" font-size="11" '
        f'font-weight="700" fill="{WHITE}" {FONT}>{n}</text>'
    )


def legend_row(y: int, items: list[tuple[int, str]], x0: int = 40) -> str:
    """STE legend: numbered callouts with short phrases."""
    parts = [
        f'<rect x="28" y="{y - 18}" width="804" height="{16 + 18 * ((len(items) + 1) // 2)}" '
        f'rx="4" fill="{WHITE}" stroke="{INK}" stroke-width="1"/>',
        f'<text x="40" y="{y}" font-size="8" font-weight="700" fill="{INK}" '
        f'letter-spacing="0.14em" {FONT}>LEGEND</text>',
    ]
    # two columns
    col_w = 390
    for i, (n, text) in enumerate(items):
        col = i % 2
        row = i // 2
        x = x0 + col * col_w
        yy = y + 18 + row * 16
        parts.append(
            f'<circle cx="{x}" cy="{yy - 3}" r="8" fill="{INK}"/>'
            f'<text x="{x}" y="{yy + 1}" text-anchor="middle" font-size="8" '
            f'font-weight="700" fill="{WHITE}" {FONT}>{n}</text>'
            f'<text x="{x + 14}" y="{yy}" font-size="8.5" fill="{INK_SOFT}" {FONT}>{text}</text>'
        )
    return "\n  ".join(parts)


def arrow_defs(uid: str = "a") -> str:
    return f'''<defs>
  <marker id="arr-{uid}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <path d="M0,0 L7,3.5 L0,7 Z" fill="{INK}"/>
  </marker>
  <marker id="arr-{uid}-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <path d="M0,0 L7,3.5 L0,7 Z" fill="{RED}"/>
  </marker>
  <marker id="arr-{uid}-blue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
    <path d="M0,0 L7,3.5 L0,7 Z" fill="{BLUE_DEEP}"/>
  </marker>
</defs>'''


# ---------------------------------------------------------------------------
# 1. Qubit modality — superconducting transmon + readout resonator
# ---------------------------------------------------------------------------
save(
    "plate-qubit-bloch.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 640" {FONT}>
  <rect width="860" height="640" fill="{SEA}"/>
  {arrow_defs("qm")}
  {title("FIG. 1.1  ·  QUBIT MODALITY — SUPERCONDUCTING TRANSMON")}
  {subtitle("CALL OUTS BELOW  ·  TRANSMON = JJ + SHUNT CAPACITOR + READOUT")}

  <!-- chip -->
  <rect x="48" y="72" width="480" height="420" rx="8" fill="{CREAM}" stroke="{INK}" stroke-width="1.4"/>
  <text x="64" y="98" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.16em">CHIP (SIMPLIFIED)</text>

  <!-- readout resonator -->
  <path d="M90 150 L220 150 L220 168 L360 168 L360 150 L470 150"
        fill="none" stroke="{BLUE_DEEP}" stroke-width="3.5"/>
  <path d="M90 158 L220 158 L220 176 L360 176 L360 158 L470 158"
        fill="none" stroke="{BLUE}" stroke-width="1.2" opacity="0.45"/>
  {callout(1, 280, 130)}

  <!-- coupling -->
  <line x1="280" y1="176" x2="280" y2="220" stroke="{INK}" stroke-width="1.2" stroke-dasharray="3 2"/>
  {callout(2, 300, 200)}

  <!-- Transmon island -->
  <rect x="150" y="230" width="260" height="140" rx="6" fill="{BLUE}" fill-opacity="0.22" stroke="{INK}" stroke-width="1.5"/>
  {callout(3, 170, 250)}

  <!-- shunt capacitor -->
  <rect x="190" y="275" width="80" height="16" rx="1" fill="{OLIVE}" fill-opacity="0.75" stroke="{INK}" stroke-width="1"/>
  <rect x="190" y="305" width="80" height="16" rx="1" fill="{OLIVE}" fill-opacity="0.75" stroke="{INK}" stroke-width="1"/>
  {callout(4, 230, 355)}

  <!-- Josephson junction -->
  <g transform="translate(340,298)">
    <line x1="-24" y1="0" x2="24" y2="0" stroke="{INK}" stroke-width="1.6"/>
    <line x1="-11" y1="-11" x2="11" y2="11" stroke="{RED}" stroke-width="2.2"/>
    <line x1="-11" y1="11" x2="11" y2="-11" stroke="{RED}" stroke-width="2.2"/>
    <circle cx="0" cy="0" r="15" fill="none" stroke="{RED}" stroke-width="1.4"/>
  </g>
  {callout(5, 340, 355)}

  <!-- energy levels -->
  <rect x="170" y="390" width="220" height="80" rx="4" fill="{WHITE}" stroke="{INK}" stroke-width="1"/>
  {callout(6, 190, 410)}
  <line x1="230" y1="420" x2="300" y2="420" stroke="{BLUE_DEEP}" stroke-width="2.5"/>
  <text x="312" y="424" font-size="10" fill="{INK}">|1&gt;</text>
  <line x1="230" y1="450" x2="300" y2="450" stroke="{OLIVE}" stroke-width="2.5"/>
  <text x="312" y="454" font-size="10" fill="{INK}">|0&gt;</text>
  <line x1="265" y1="420" x2="265" y2="450" stroke="{RED}" stroke-width="1.2" stroke-dasharray="2 2"/>

  <!-- RIGHT: ports as numbered blocks (minimal words) -->
  <rect x="560" y="72" width="260" height="420" rx="8" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
  <text x="690" y="100" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.14em">PORTS</text>

  <rect x="580" y="130" width="220" height="70" rx="5" fill="{BLUE}" fill-opacity="0.28" stroke="{INK}" stroke-width="1"/>
  {callout(7, 600, 155)}
  <text x="700" y="160" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}">XY</text>
  <path d="M560 265 L560 165" fill="none" stroke="{BLUE_DEEP}" stroke-width="1.4" marker-end="url(#arr-qm-blue)"/>

  <rect x="580" y="230" width="220" height="70" rx="5" fill="{OLIVE}" fill-opacity="0.32" stroke="{INK}" stroke-width="1"/>
  {callout(8, 600, 255)}
  <text x="700" y="260" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}">FLUX / Z</text>
  <path d="M560 300 L560 265" fill="none" stroke="{OLIVE}" stroke-width="1.4" marker-end="url(#arr-qm)"/>

  <rect x="580" y="330" width="220" height="70" rx="5" fill="{SEA}" stroke="{INK}" stroke-width="1"/>
  {callout(9, 600, 355)}
  <text x="700" y="360" text-anchor="middle" font-size="12" font-weight="700" fill="{INK}">READOUT</text>
  <path d="M470 150 C520 150, 540 360, 580 365" fill="none" stroke="{RED}" stroke-width="1.3"
        stroke-dasharray="5 3" marker-end="url(#arr-qm-red)"/>

  <text x="690" y="440" text-anchor="middle" font-size="8" fill="{MUTED}">Other modalities differ in physics.</text>
  <text x="690" y="456" text-anchor="middle" font-size="8" fill="{MUTED}">Control still uses pulses + readout.</text>

  {legend_row(520, [
    (1, "Readout resonator (omega_r)"),
    (2, "Coupling capacitor C_c"),
    (3, "Transmon island"),
    (4, "Shunt capacitor C_s"),
    (5, "Josephson junction (E_J)"),
    (6, "Computational levels |0&gt;, |1&gt;"),
    (7, "XY microwave drive @ omega_q"),
    (8, "Flux / Z bias (sets omega_q)"),
    (9, "Dispersive readout → classical bit"),
  ])}

  <text x="430" y="625" text-anchor="middle" font-size="8" fill="{MUTED}">Real QPU physics. This product uses a noisy simulator — see FIG. 1.5.</text>
</svg>''',
)


# ---------------------------------------------------------------------------
# 2. Cryogenic / RF stack
# ---------------------------------------------------------------------------
save(
    "plate-qpu-stack.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 660" {FONT}>
  <rect width="860" height="660" fill="{CREAM}"/>
  {arrow_defs("cy")}
  {title("FIG. 1.2  ·  CRYOGENIC / RF STACK")}
  {subtitle("300 K → 4 K → STILL → MXC (~10–20 mK)  ·  ATTENUATION DOWN  ·  AMPLIFICATION UP")}

  <!-- 300K -->
  <rect x="48" y="70" width="764" height="78" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
  {callout(1, 72, 100)}
  <text x="96" y="96" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.1em">300 K</text>
  <text x="96" y="116" font-size="9" fill="{MUTED}">Classical rack</text>
  <rect x="420" y="86" width="120" height="46" rx="4" fill="{BLUE}" fill-opacity="0.3" stroke="{INK}" stroke-width="1"/>
  {callout(2, 440, 109)}
  <text x="500" y="114" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">AWG</text>
  <rect x="560" y="86" width="120" height="46" rx="4" fill="{OLIVE}" fill-opacity="0.35" stroke="{INK}" stroke-width="1"/>
  {callout(3, 580, 109)}
  <text x="640" y="114" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">ADC</text>
  <rect x="700" y="86" width="90" height="46" rx="4" fill="{SEA}" stroke="{INK}" stroke-width="1"/>
  <text x="745" y="114" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">PC</text>

  <!-- 4K -->
  <rect x="48" y="164" width="764" height="72" rx="5" fill="{SEA}" stroke="{INK}" stroke-width="1.2"/>
  {callout(4, 72, 200)}
  <text x="96" y="190" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.1em">4 K</text>
  <text x="96" y="210" font-size="9" fill="{MUTED}">First cold stage</text>
  <rect x="420" y="178" width="120" height="44" rx="3" fill="{BLUE_DEEP}" fill-opacity="0.35" stroke="{INK}" stroke-width="1"/>
  {callout(5, 440, 200)}
  <text x="500" y="205" text-anchor="middle" font-size="10" font-weight="600" fill="{INK}">ATTEN</text>
  <rect x="560" y="178" width="160" height="44" rx="3" fill="{GOLD}" fill-opacity="0.4" stroke="{INK}" stroke-width="1"/>
  {callout(6, 580, 200)}
  <text x="660" y="205" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">HEMT</text>

  <!-- still -->
  <rect x="48" y="252" width="764" height="60" rx="5" fill="{BLUE}" fill-opacity="0.18" stroke="{INK}" stroke-width="1.2"/>
  {callout(7, 72, 282)}
  <text x="96" y="278" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.1em">STILL / COLD PLATE</text>
  <text x="96" y="296" font-size="9" fill="{MUTED}">~0.7–1 K · more attenuation · thermalisation</text>

  <!-- MXC -->
  <rect x="48" y="328" width="764" height="120" rx="5" fill="{BLUE_DEEP}" fill-opacity="0.28" stroke="{INK}" stroke-width="1.4"/>
  {callout(8, 72, 360)}
  <text x="96" y="356" font-size="11" font-weight="700" fill="{INK}" letter-spacing="0.1em">MXC  ·  ~10–20 mK</text>
  <text x="96" y="376" font-size="9" fill="{MUTED}">Mixing chamber</text>

  <rect x="200" y="390" width="200" height="42" rx="4" fill="{WHITE}" stroke="{RED}" stroke-width="1.6"/>
  {callout(9, 220, 411)}
  <text x="310" y="416" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">SAMPLE / CHIP</text>

  <rect x="430" y="390" width="150" height="42" rx="4" fill="{GOLD}" fill-opacity="0.45" stroke="{INK}" stroke-width="1"/>
  {callout(10, 450, 411)}
  <text x="530" y="416" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">TWPA</text>

  <rect x="610" y="390" width="150" height="42" rx="4" fill="{OLIVE}" fill-opacity="0.4" stroke="{INK}" stroke-width="1"/>
  {callout(11, 630, 411)}
  <text x="710" y="416" text-anchor="middle" font-size="10" font-weight="700" fill="{INK}">ATTEN −dB</text>

  <!-- signal flow -->
  <line x1="180" y1="470" x2="180" y2="500" stroke="{BLUE_DEEP}" stroke-width="2.2" marker-end="url(#arr-cy-blue)"/>
  <text x="196" y="492" font-size="9" fill="{BLUE_DEEP}" font-weight="600">drive ↓</text>
  <line x1="520" y1="500" x2="520" y2="470" stroke="{RED}" stroke-width="2.2" marker-end="url(#arr-cy-red)"/>
  <text x="536" y="492" font-size="9" fill="{RED}" font-weight="600">readout ↑</text>

  {legend_row(530, [
    (1, "Room-temperature classical rack"),
    (2, "AWG / DAC — pulses out"),
    (3, "Digitizer / ADC — bits in"),
    (4, "4 K first cold stage"),
    (5, "Drive-line attenuators"),
    (6, "HEMT low-noise amp (readout ↑)"),
    (7, "Still / cold plate (~1 K)"),
    (8, "Mixing chamber (MXC)"),
    (9, "QPU sample package"),
    (10, "TWPA near-quantum-limited amp"),
    (11, "Final attenuators into qubit"),
  ])}

  <text x="430" y="645" text-anchor="middle" font-size="8" fill="{MUTED}">Product stand-in: NoisySimulatorBackend (FIG. 1.5).</text>
</svg>''',
)


# ---------------------------------------------------------------------------
# 3. Control & readout loop
# ---------------------------------------------------------------------------
save(
    "plate-control-readout.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 600" {FONT}>
  <rect width="860" height="600" fill="{SEA}"/>
  {arrow_defs("cr")}
  {title("FIG. 1.3  ·  CONTROL AND READOUT LOOP")}
  {subtitle("PULSE SEQUENCE → AWG → FRIDGE → QUBIT → READOUT → ADC → PC")}

  <!-- numbered stage boxes — tall enough, short labels -->
  <g>
    <rect x="36" y="80" width="100" height="90" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    {callout(1, 86, 110)}
    <text x="86" y="145" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">PULSE</text>
    <text x="86" y="160" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">SEQ</text>
  </g>
  <line x1="136" y1="125" x2="156" y2="125" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cr)"/>

  <g>
    <rect x="160" y="80" width="100" height="90" rx="5" fill="{BLUE}" fill-opacity="0.35" stroke="{INK}" stroke-width="1.2"/>
    {callout(2, 210, 110)}
    <path d="M175 145 C185 145, 188 132, 196 132 S208 152, 216 152 S228 132, 236 132"
          fill="none" stroke="{BLUE_DEEP}" stroke-width="1.6"/>
    <text x="210" y="160" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">AWG</text>
  </g>
  <line x1="260" y1="125" x2="280" y2="125" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cr)"/>

  <g>
    <rect x="284" y="80" width="100" height="90" rx="5" fill="{BLUE_DEEP}" fill-opacity="0.3" stroke="{INK}" stroke-width="1.2"/>
    {callout(3, 334, 110)}
    <text x="334" y="145" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">FRIDGE</text>
    <text x="334" y="160" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">WIRING</text>
  </g>
  <line x1="384" y1="125" x2="404" y2="125" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cr)"/>

  <g>
    <rect x="408" y="80" width="100" height="90" rx="5" fill="{OLIVE}" fill-opacity="0.4" stroke="{INK}" stroke-width="1.2"/>
    {callout(4, 458, 110)}
    <circle cx="458" cy="145" r="16" fill="{RED}" fill-opacity="0.8"/>
    <text x="458" y="149" text-anchor="middle" font-size="10" fill="{WHITE}" font-weight="700">Q</text>
  </g>
  <line x1="508" y1="125" x2="528" y2="125" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cr)"/>

  <g>
    <rect x="532" y="80" width="100" height="90" rx="5" fill="{GOLD}" fill-opacity="0.4" stroke="{INK}" stroke-width="1.2"/>
    {callout(5, 582, 110)}
    <text x="582" y="145" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">READOUT</text>
    <text x="582" y="160" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">CHAIN</text>
  </g>
  <line x1="632" y1="125" x2="652" y2="125" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cr)"/>

  <g>
    <rect x="656" y="80" width="100" height="90" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
    {callout(6, 706, 110)}
    <text x="706" y="152" text-anchor="middle" font-size="18" font-weight="700" fill="{INK}">0/1</text>
  </g>

  <!-- return path -->
  <path d="M706 170 L706 210 L86 210 L86 170" fill="none" stroke="{RED}" stroke-width="1.6"
        stroke-dasharray="5 3" marker-end="url(#arr-cr-red)"/>
  {callout(7, 396, 210)}

  <!-- two STE panels — shorter, more spacing -->
  <rect x="36" y="250" width="380" height="180" rx="6" fill="{CREAM}" stroke="{INK}" stroke-width="1.2"/>
  <text x="52" y="278" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.12em">CONTROL PATH (DOWN)</text>
  <text x="52" y="306" font-size="9" fill="{MUTED}">1 → 2 → 3 → 4</text>
  <text x="52" y="330" font-size="9" fill="{INK_SOFT}">Gates become timed envelopes.</text>
  <text x="52" y="352" font-size="9" fill="{INK_SOFT}">AWG + LO emit microwave voltages.</text>
  <text x="52" y="374" font-size="9" fill="{INK_SOFT}">Fridge lines carry signals to MXC.</text>
  <text x="52" y="396" font-size="9" fill="{INK_SOFT}">Fields at the qubit rotate the state.</text>
  <text x="52" y="420" font-size="9" fill="{INK}">Wrong amp / freq / timing → fidelity falls.</text>

  <rect x="444" y="250" width="380" height="180" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
  <text x="460" y="278" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.12em">READOUT PATH (UP)</text>
  <text x="460" y="306" font-size="9" fill="{MUTED}">5 → 6 → 7</text>
  <text x="460" y="330" font-size="9" fill="{INK_SOFT}">Probe tone interrogates the resonator.</text>
  <text x="460" y="352" font-size="9" fill="{INK_SOFT}">TWPA + HEMT amplify the response.</text>
  <text x="460" y="374" font-size="9" fill="{INK_SOFT}">Digitizer yields a classical bitstring.</text>
  <text x="460" y="396" font-size="9" fill="{INK_SOFT}">PC classifies bits and decides next pulse.</text>
  <text x="460" y="420" font-size="9" fill="{INK}">Agents speak goals. Hardware speaks pulses.</text>

  {legend_row(460, [
    (1, "Pulse sequence / timing table"),
    (2, "AWG / DAC + IQ / LO"),
    (3, "Fridge wiring (300 K → MXC)"),
    (4, "Qubit state evolves"),
    (5, "Readout chain (TWPA · HEMT)"),
    (6, "ADC → classical bits"),
    (7, "Classical PC — classify · log · next"),
  ])}
</svg>''',
)


# ---------------------------------------------------------------------------
# 4. Calibration as closed loop on the stack
# ---------------------------------------------------------------------------
save(
    "plate-why-calibrate.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 640" {FONT}>
  <rect width="860" height="640" fill="{CREAM}"/>
  {arrow_defs("cal")}
  {title("FIG. 1.4  ·  CALIBRATION AS A CLOSED LOOP ON THE STACK")}
  {subtitle("MEASURE → DECIDE → APPLY → REMEASURE  ·  KNOBS + OBSERVABLES IN LEGEND")}

  <!-- left stack — more vertical spacing -->
  <text x="40" y="78" font-size="8" font-weight="700" fill="{MUTED}" letter-spacing="0.14em">STACK (REF)</text>
  <rect x="40" y="92" width="200" height="42" rx="3" fill="{WHITE}" stroke="{INK}" stroke-width="1"/>
  <text x="140" y="118" text-anchor="middle" font-size="9" fill="{INK}">PC / AWG</text>
  <rect x="40" y="146" width="200" height="42" rx="3" fill="{SEA}" stroke="{INK}" stroke-width="1"/>
  <text x="140" y="172" text-anchor="middle" font-size="9" fill="{INK}">fridge RF</text>
  <rect x="40" y="200" width="200" height="42" rx="3" fill="{BLUE_DEEP}" fill-opacity="0.3" stroke="{INK}" stroke-width="1"/>
  <text x="140" y="226" text-anchor="middle" font-size="9" fill="{INK}">qubit + res.</text>
  <rect x="40" y="254" width="200" height="42" rx="3" fill="{OLIVE}" fill-opacity="0.35" stroke="{INK}" stroke-width="1"/>
  <text x="140" y="280" text-anchor="middle" font-size="9" fill="{INK}">digitizer → PC</text>

  <!-- center loop — pushed down clear of subtitle -->
  <circle cx="430" cy="235" r="125" fill="none" stroke="{OLIVE}" stroke-width="1.3" opacity="0.5"/>
  <circle cx="430" cy="235" r="95" fill="{BLUE}" fill-opacity="0.08"/>

  <circle cx="430" cy="118" r="40" fill="{BLUE}" fill-opacity="0.5" stroke="{INK}" stroke-width="1.2"/>
  {callout(1, 430, 118)}
  <text x="430" y="172" text-anchor="middle" font-size="8" fill="{MUTED}">measure</text>

  <circle cx="545" cy="235" r="40" fill="{OLIVE}" fill-opacity="0.5" stroke="{INK}" stroke-width="1.2"/>
  {callout(2, 545, 235)}
  <text x="545" y="290" text-anchor="middle" font-size="8" fill="{MUTED}">decide</text>

  <circle cx="430" cy="352" r="40" fill="{BLUE_DEEP}" fill-opacity="0.45" stroke="{INK}" stroke-width="1.2"/>
  {callout(3, 430, 352)}
  <text x="430" y="408" text-anchor="middle" font-size="8" fill="{MUTED}">apply</text>

  <circle cx="315" cy="235" r="40" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
  {callout(4, 315, 235)}
  <text x="315" y="290" text-anchor="middle" font-size="8" fill="{MUTED}">remeasure</text>

  <path d="M462 148 Q520 155 520 200" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cal)"/>
  <path d="M530 270 Q520 315 462 338" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cal)"/>
  <path d="M398 338 Q340 315 340 270" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cal)"/>
  <path d="M340 200 Q340 155 398 148" fill="none" stroke="{INK}" stroke-width="1.4" marker-end="url(#arr-cal)"/>

  <!-- knobs / observables — spaced -->
  <rect x="640" y="70" width="180" height="150" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
  <text x="730" y="96" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.1em">KNOBS</text>
  {callout(5, 662, 124)}
  <text x="680" y="128" font-size="10" fill="{INK}">amplitude</text>
  {callout(6, 662, 156)}
  <text x="680" y="160" font-size="10" fill="{INK}">frequency</text>
  {callout(7, 662, 188)}
  <text x="680" y="192" font-size="10" fill="{INK}">timing</text>

  <rect x="640" y="240" width="180" height="150" rx="5" fill="{SEA}" stroke="{INK}" stroke-width="1.2"/>
  <text x="730" y="266" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.08em">OBSERVABLES</text>
  {callout(8, 662, 294)}
  <text x="680" y="298" font-size="10" fill="{INK}">gate fidelity</text>
  {callout(9, 662, 326)}
  <text x="680" y="330" font-size="10" fill="{INK}">readout fid.</text>
  {callout(10, 662, 358)}
  <text x="680" y="362" font-size="10" fill="{INK}">T1 / T2 (hw)</text>

  <!-- why box -->
  <rect x="40" y="430" width="780" height="70" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.2"/>
  <text x="56" y="456" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.1em">WHY THE LOOP EXISTS</text>
  <text x="56" y="478" font-size="9" fill="{MUTED}">Drift moves true parameters. Detuning = |applied − true|. Fidelity falls as detuning grows.</text>
  <text x="56" y="496" font-size="9" fill="{INK}">Stop when best fidelity ≥ 0.88 (default) or iterations end. Remeasurement is required.</text>

  {legend_row(530, [
    (1, "Measure fidelity(q)"),
    (2, "Decide: ≥ threshold?"),
    (3, "Apply knob update to cal / AWG"),
    (4, "Remeasure — loop or stop"),
    (5, "Amplitude knob"),
    (6, "Frequency knob"),
    (7, "Timing / phase knob"),
    (8, "Gate fidelity observable"),
    (9, "Readout fidelity observable"),
    (10, "T1 / T2 on hardware (sim uses fidelity kernel)"),
  ])}
</svg>''',
)


# ---------------------------------------------------------------------------
# 5. Our interface overlay
# ---------------------------------------------------------------------------
save(
    "plate-our-seam.svg",
    f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 660" {FONT}>
  <rect width="860" height="660" fill="{SEA}"/>
  {arrow_defs("os")}
  {title("FIG. 1.5  ·  OUR INTERFACE OVERLAY")}
  {subtitle("NL / AGENT → QPUADAPTER → CLASSICAL CONTROL  ·  SIM STANDS IN FOR CRYO + RF")}

  <text x="48" y="78" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.12em">REAL STACK + WHERE SOFTWARE SITS</text>

  <!-- NL -->
  <rect x="48" y="96" width="440" height="64" rx="5" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
  {callout(1, 72, 128)}
  <text x="96" y="122" font-size="11" font-weight="700" fill="{INK}">NL GOALS + ORCHESTRATOR</text>
  <text x="96" y="142" font-size="8.5" fill="{MUTED}">5 tools · ToolTraces · offline-first planner</text>
  <rect x="400" y="110" width="64" height="36" rx="3" fill="{BLUE}" fill-opacity="0.5" stroke="{INK}" stroke-width="1"/>
  <text x="432" y="132" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}">US</text>

  <!-- classical control / seam -->
  <rect x="48" y="180" width="440" height="110" rx="5" fill="{OLIVE}" fill-opacity="0.32" stroke="{RED}" stroke-width="2.2"/>
  {callout(2, 72, 212)}
  <text x="96" y="208" font-size="11" font-weight="700" fill="{INK}">CLASSICAL CONTROL</text>
  <text x="96" y="228" font-size="8.5" fill="{MUTED}">pulse compiler · cal tables · job queue</text>
  {callout(3, 72, 258)}
  <text x="96" y="262" font-size="10" font-weight="700" fill="{RED}">QPUADAPTER — 6 METHODS</text>
  <text x="400" y="200" text-anchor="middle" font-size="9" fill="{RED}" font-weight="700">SEAM</text>

  <!-- cryo -->
  <rect x="48" y="310" width="440" height="70" rx="5" fill="{BLUE}" fill-opacity="0.2" stroke="{INK}" stroke-width="1" stroke-dasharray="6 3"/>
  {callout(4, 72, 345)}
  <text x="96" y="340" font-size="10" font-weight="700" fill="{MUTED}">CRYO + RF ELECTRONICS</text>
  <text x="96" y="360" font-size="8.5" fill="{MUTED}">AWG · LO · atten · TWPA/HEMT · digitizer</text>
  <rect x="340" y="322" width="128" height="46" rx="4" fill="{BLUE_DEEP}" fill-opacity="0.55" stroke="{INK}" stroke-width="1.3"/>
  {callout(5, 360, 345)}
  <text x="420" y="350" text-anchor="middle" font-size="8" font-weight="700" fill="{WHITE}">SIM</text>

  <!-- physics -->
  <rect x="48" y="400" width="440" height="56" rx="5" fill="{BLUE_DEEP}" fill-opacity="0.25" stroke="{INK}" stroke-width="1" stroke-dasharray="6 3"/>
  {callout(6, 72, 428)}
  <text x="96" y="424" font-size="10" font-weight="700" fill="{MUTED}">PHYSICS (QUBITS IN MXC)</text>
  <text x="96" y="442" font-size="8.5" fill="{MUTED}">toy 1–2 qubit model + drift kernel</text>
  <circle cx="450" cy="428" r="12" fill="{RED}" fill-opacity="0.8"/>
  <text x="450" y="432" text-anchor="middle" font-size="9" fill="{WHITE}" font-weight="700">Q</text>

  <!-- right panels — no overlapping CAL LOOP label -->
  <rect x="520" y="96" width="300" height="170" rx="6" fill="{WHITE}" stroke="{INK}" stroke-width="1.3"/>
  <text x="670" y="124" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.1em">PRODUCT HONESTY</text>
  <text x="540" y="152" font-size="9" fill="{INK}">Real diagrams show QPU physics.</text>
  <text x="540" y="174" font-size="9" fill="{INK}">This product does not drive a fridge.</text>
  <text x="540" y="196" font-size="9" fill="{MUTED}">NoisySimulatorBackend stands in for</text>
  <text x="540" y="214" font-size="9" fill="{MUTED}">cryo + electronics + qubits.</text>
  <text x="540" y="242" font-size="9" fill="{RED}" font-weight="600">Keep the seam. Replace the stand-in.</text>

  <rect x="520" y="286" width="300" height="120" rx="6" fill="{CREAM}" stroke="{INK}" stroke-width="1.2"/>
  <text x="670" y="314" text-anchor="middle" font-size="9" font-weight="700" fill="{INK}" letter-spacing="0.1em">INSTRUMENT UI</text>
  {callout(7, 540, 342)}
  <text x="560" y="346" font-size="9" fill="{MUTED}">Stage: drift | device</text>
  {callout(8, 540, 372)}
  <text x="560" y="376" font-size="9" fill="{MUTED}">Dock: agent ledger + composer</text>

  <!-- cal loop arc — label outside right panels -->
  <path d="M488 128 C510 128, 510 428, 488 428" fill="none" stroke="{RED}" stroke-width="1.6"
        stroke-dasharray="5 4" marker-end="url(#arr-os-red)"/>
  {callout(9, 510, 278)}

  <text x="430" y="490" text-anchor="middle" font-size="9" fill="{INK}">Agents and the UI never reach past the adapter.</text>
  <text x="430" y="510" text-anchor="middle" font-size="9" fill="{MUTED}">Closed-loop calibration crosses the red seam on every get/apply.</text>

  {legend_row(540, [
    (1, "NL goals + orchestrator (product)"),
    (2, "Classical control box"),
    (3, "QPUAdapter seam — 6 typed methods"),
    (4, "Cryo + RF electronics (real stack)"),
    (5, "NoisySimulatorBackend stand-in"),
    (6, "Physics / qubits (sim model)"),
    (7, "Instrument stage (UI)"),
    (8, "Instrument dock (UI)"),
    (9, "Calibration loop across the seam"),
  ])}
</svg>''',
)

print("Sophisticated QPU plates written to", OUT)
