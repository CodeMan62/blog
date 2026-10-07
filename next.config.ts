import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export so the site can be hosted on GitHub Pages
  // (or any static file host). Build output goes to ./out.
  output: "export",
  basePath: "/blog",
  // Emit /posts/slug/index.html so static hosts serve clean URLs.
  trailingSlash: true,
};

export default nextConfig;
