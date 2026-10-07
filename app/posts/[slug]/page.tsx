import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllPosts, getPost } from "@/lib/posts";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt || `${post.title} — ${site.name}`,
    openGraph: {
      title: post.title,
      description: post.excerpt || undefined,
      type: "article",
      publishedTime: post.dateISO,
      url: `${site.url}/posts/${post.slug}`,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <article>
      <p>
        <Link href="/" className="post-back">
          ← Back to blog
        </Link>
      </p>

      <header className="post-header">
        <h1 className="post-title">{post.title}</h1>
        {post.excerpt ? (
          <h2 className="post-subtitle">{post.excerpt}</h2>
        ) : null}
        <time className="post-date" dateTime={post.dateISO}>
          {post.dateDisplay}
        </time>
      </header>

      <hr className="post-title-divider" />

      <div className="prose" dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
