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
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

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

    // La CSP solo se aplica en PRODUCCIÓN: en desarrollo interfiere con el HMR,
    // el eval y la inyección de estilos de Next. 'unsafe-inline' por el script
    // de tema y los scripts de arranque de Next (migrar a nonce más adelante).
    if (!isDev) {
      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https://*.supabase.co",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co",
        "worker-src 'self'",
        "manifest-src 'self'",
      ].join("; ");
      headers.unshift({ key: "Content-Security-Policy", value: csp });
    }

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
