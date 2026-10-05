"""HTML helpers for the AI-to-QPU technical manual."""

def fig(src, label, caption, cls=""):
    return f'''<div class="figure {cls}">
  <img src="{src}" alt="{label}"/>
  <p class="fig-cap"><span class="label">{label}</span>{caption}</p>
</div>'''

def src_note(*paths):
    joined = "; ".join(paths)
    return f'<p class="sources"><strong>Sources.</strong> {joined}</p>'

def table(headers, rows, caption=""):
    th = "".join(f"<th>{h}</th>" for h in headers)
    body = ""
    for r in rows:
        body += "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>"
    cap = f'<p class="table-cap">{caption}</p>' if caption else ""
    return f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>{cap}"

def endpoint(method, path, body=""):
    mclass = "post" if method.upper() == "POST" else "get"
    return f'<div class="keep"><span class="endpoint"><span class="method {mclass}">{method.upper()}</span>{path}</span>{body}</div>'

def h1_part(num, title):
    return f'<h1 class="part"><span class="part-num">Part {num}</span>{title}</h1>'
