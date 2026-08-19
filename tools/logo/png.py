import cairosvg, json
A = json.load(open("assets.json"))
JOBS = [("favicon","favicon-32.png",32),("favicon","favicon-64.png",64),
        ("icon-512","favicon-180-apple-touch.png",180),("icon-512","icon-512.png",512),
        ("mark-512-transparent","mark-512-transparent.png",512),
        ("logo-tomoshibi","logo-tomoshibi.png",1184)]
for src, out, w in JOBS:
    cairosvg.svg2png(bytestring=A[src].encode(), write_to=out, output_width=w,
                     output_height=None if src=="logo-tomoshibi" else w)
    import os; print(f"  {out:32s} {os.path.getsize(out):7d}b")
