import type { Lang } from "../i18n.ts";
import jaMotivation from "./articles/ja/motivation.md?raw";
import enMotivation from "./articles/en/motivation.md?raw";

export type NoteSlug = "note-motivation";

export type NoteMeta = {
  slug: NoteSlug;
  title: string;
  summary: string;
  category: string;
};

export type NoteDoc = NoteMeta & {
  body: string;
};

type NoteSource = {
  slug: NoteSlug;
  raw: Record<Lang, string>;
};

const SOURCES: NoteSource[] = [
  {
    slug: "note-motivation",
    raw: { ja: jaMotivation, en: enMotivation },
  },
];

export const NOTE_ROUTES = SOURCES.map((n) => n.slug);

export function listNotes(lang: Lang): NoteMeta[] {
  return SOURCES.map((n) => noteDoc(n, lang));
}

export function getNote(slug: string, lang: Lang): NoteDoc | null {
  const src = SOURCES.find((n) => n.slug === slug);
  return src ? noteDoc(src, lang) : null;
}

function noteDoc(src: NoteSource, lang: Lang): NoteDoc {
  const parsed = parseFrontmatter(src.raw[lang]);
  return { slug: src.slug, ...parsed };
}

function parseFrontmatter(raw: string): Omit<NoteDoc, "slug"> {
  if (!raw.startsWith("---\n")) return { title: "", summary: "", category: "", body: raw.trim() };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { title: "", summary: "", category: "", body: raw.trim() };
  const head = raw.slice(4, end).trim().split("\n");
  const meta: Record<string, string> = {};
  for (const line of head) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return {
    title: meta.title ?? "",
    summary: meta.summary ?? "",
    category: meta.category ?? "",
    body: raw.slice(end + 5).trim(),
  };
}
