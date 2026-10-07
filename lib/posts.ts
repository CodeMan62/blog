import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export type Post = {
  slug: string;
  title: string;
  dateISO: string;
  dateDisplay: string;
  excerpt: string;
  /** Post body rendered to HTML. */
  content: string;
};

const postsDir = path.join(process.cwd(), "content", "posts");

/** Render figures with a caption: ![alt](/path "Figure 1: something") */
const renderer = {
  image({ href, title, text }: { href: string; title: string | null; text: string }) {
    const caption = title || text;
    return [
      `<figure>`,
      `<img src="${href}" alt="${text}">`,
      caption ? `<figcaption>${caption}</figcaption>` : "",
      `</figure>`,
    ]
      .filter(Boolean)
      .join("");
  },
};

marked.use({ renderer });

/**
 * Convert GitHub-style admonition blockquotes into styled callout divs:
 *
 *   > [!INFO]
 *   > Hopper and Ampere white papers are great reading.
 *
 * Supported types: INFO, NOTE, WARN.
 */
function processCallouts(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(/^>\s*\[!(INFO|NOTE|WARN)\]/i);
    if (match) {
      const type = match[1].toLowerCase();
      const inner: string[] = [];
      i += 1;
      while (i < lines.length) {
        const quote = lines[i].match(/^>\s?(.*)$/);
        if (quote) {
          inner.push(quote[1]);
          i += 1;
        } else {
          break;
        }
      }
      const body = marked.parse(inner.join("\n")) as string;
      out.push(`<div class="callout ${type}">${body}</div>`);
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }

  return out.join("\n");
}

function readPost(slug: string): Post | null {
  const fullPath = path.join(postsDir, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const raw = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(raw);

  const date = data.date ? new Date(data.date) : new Date();
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title
      : slug;

  return {
    slug,
    title,
    dateISO: date.toISOString(),
    dateDisplay: date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    excerpt:
      typeof data.excerpt === "string" ? data.excerpt : "",
    // Unwrap figures from the <p> marked puts around standalone images.
    content: (marked.parse(processCallouts(content)) as string).replace(
      /<p>(<figure>.*?<\/figure>)<\/p>/g,
      "$1",
    ),
  };
}

/** All posts, newest first. */
export function getAllPosts(): Post[] {
  if (!fs.existsSync(postsDir)) return [];
  const files = fs
    .readdirSync(postsDir)
    .filter((file) => file.endsWith(".md"));

  return files
    .map((file) => readPost(file.replace(/\.md$/, "")))
    .filter((post): post is Post => post !== null)
    .sort((a, b) => +new Date(b.dateISO) - +new Date(a.dateISO));
}

/** A single post, or null when it does not exist. */
export function getPost(slug: string): Post | null {
  return readPost(slug);
}
