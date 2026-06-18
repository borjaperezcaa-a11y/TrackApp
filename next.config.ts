import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tree-shaking más fino de paquetes grandes con muchos sub-módulos.
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  // Security headers — TLS is enforced by Vercel; here we harden the responses.
  // La CSP NO va aquí: la pone el middleware por petición con nonce (ver
  // lib/supabase/middleware.ts), para no usar 'unsafe-inline' en script-src.
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
