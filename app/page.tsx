import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { site } from "@/lib/site";

export default function Home() {
  const posts = getAllPosts();

  return (
    <>
      <p className="home-tagline">{site.description}</p>
      <h1 className="page-title">Posts</h1>
      <ul className="post-list">
        {posts.map((post) => (
          <li key={post.slug} className="post-item">
            <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            <time dateTime={post.dateISO}>{post.dateDisplay}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
