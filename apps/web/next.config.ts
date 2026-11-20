import type { NextConfig } from "next";

/**
 * GitHub Pages serves this repo as a project site at /tier-zero.
 * `pnpm dev` and the default CI build leave NEXT_PUBLIC_BASE_PATH unset, so
 * the app stays at /. The Pages workflow sets the variable for the export.
 *
 * basePath prefixes routes and Next's own /_next assets. assetPrefix is set
 * to the same path so chunk and font URLs stay on that prefix. Next does not
 * prepend basePath a second time when assetPrefix is already absolute-from-root.
 */
function pagesBasePath(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
  if (!raw || raw === "/") return undefined;
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, "");
}

const basePath = pagesBasePath();

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  transpilePackages: ["@tier-zero/core", "@tier-zero/providers", "@tier-zero/dataset"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
