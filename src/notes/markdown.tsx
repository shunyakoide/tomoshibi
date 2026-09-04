import React from "react";

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string; id?: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

const HEADING = /^(#{1,3})\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?$/i;
const IMAGE = /^!\[(.*?)\]\((.*?)\)$/;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-0">
      {blocks(source).map((b, i) => {
        if (b.kind === "h1") return <h1 key={i} id={b.id} className="mt-0 mx-0 mb-10 text-3xl font-bold text-head">{b.text}</h1>;
        if (b.kind === "h2") return <h2 key={i} id={b.id} className="scroll-mt-24 mt-34 mx-0 mb-10 text-lg font-bold tracking-[0.04em] text-head border-b border-b-edge pb-7">{b.text}</h2>;
        if (b.kind === "h3") return <h3 key={i} id={b.id} className="scroll-mt-24 mt-24 mx-0 mb-8 text-md font-bold text-head">{b.text}</h3>;
        if (b.kind === "ul") {
          return (
            <ul key={i} className="mt-2 mx-0 mb-12 pl-18 text-md leading-[1.8] text-text">
              {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </ul>
          );
        }
        const img = b.text.match(IMAGE);
        if (img) {
          return (
            <figure key={i} className="my-18">
              <img src={img[2]} alt={img[1]}
                className="block w-full max-h-[520px] object-contain rounded-lg border border-card-edge bg-card" />
              {img[1] && <figcaption className="mt-6 text-sm leading-[1.6] text-sub">{img[1]}</figcaption>}
            </figure>
          );
        }
        return <p key={i} className="mt-0 mx-0 mb-13 text-md leading-[1.85] text-text max-w-[68ch]">{inline(b.text)}</p>;
      })}
    </div>
  );
}

function blocks(source: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push({ kind: "ul", items: list });
    list = [];
  };

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = line.match(HEADING);
    if (h) {
      flushPara(); flushList();
      const n = h[1].length;
      out.push({ kind: n === 1 ? "h1" : n === 2 ? "h2" : "h3", text: h[2], id: h[3] });
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      list.push(line.slice(2));
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out;
}

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<a key={`${m.index}-${m[2]}`} href={m[2]} className="text-accent underline underline-offset-3">{m[1]}</a>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
