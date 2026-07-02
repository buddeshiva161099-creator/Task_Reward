import type { NextConfig } from "next";
import path from "path";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/admin/employees",
          has: [{ type: "header", key: "x-api-request", value: "true" }],
          destination: `${BACKEND_URL}/admin/employees`,
        },
        {
          source: "/admin/employees/:path*",
          has: [{ type: "header", key: "x-api-request", value: "true" }],
          destination: `${BACKEND_URL}/admin/employees/:path*`,
        },
      ],
      afterFiles: [
        { source: "/health", destination: `${BACKEND_URL}/` },
        { source: "/platform/:path*", destination: `${BACKEND_URL}/platform/:path*` },
        { source: "/auth/:path*", destination: `${BACKEND_URL}/auth/:path*` },
        { source: "/admin/employees", destination: `${BACKEND_URL}/admin/employees` },
        { source: "/admin/employees/:path*", destination: `${BACKEND_URL}/admin/employees/:path*` },
        { source: "/tasks", destination: `${BACKEND_URL}/tasks` },
        { source: "/tasks/:path*", destination: `${BACKEND_URL}/tasks/:path*` },
        { source: "/attendance", destination: `${BACKEND_URL}/attendance` },
        { source: "/attendance/:path*", destination: `${BACKEND_URL}/attendance/:path*` },
        { source: "/leaves", destination: `${BACKEND_URL}/leaves` },
        { source: "/leaves/:path*", destination: `${BACKEND_URL}/leaves/:path*` },
        { source: "/payroll/:path*", destination: `${BACKEND_URL}/payroll/:path*` },
        { source: "/companies", destination: `${BACKEND_URL}/companies` },
        { source: "/companies/:path*", destination: `${BACKEND_URL}/companies/:path*` },
        { source: "/categories", destination: `${BACKEND_URL}/categories` },
        { source: "/categories/:path*", destination: `${BACKEND_URL}/categories/:path*` },
        { source: "/dashboard/:path*", destination: `${BACKEND_URL}/dashboard/:path*` },
        { source: "/reports/:path*", destination: `${BACKEND_URL}/reports/:path*` },
        { source: "/leaderboard", destination: `${BACKEND_URL}/leaderboard` },
        { source: "/leaderboard/:path*", destination: `${BACKEND_URL}/leaderboard/:path*` },
        { source: "/chat/:path*", destination: `${BACKEND_URL}/chat/:path*` },
        { source: "/ai/:path*", destination: `${BACKEND_URL}/ai/:path*` },
        { source: "/notifications", destination: `${BACKEND_URL}/notifications` },
        { source: "/notifications/:path*", destination: `${BACKEND_URL}/notifications/:path*` },
        { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
        { source: "/static/:path*", destination: `${BACKEND_URL}/static/:path*` },
      ]
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer'
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' blob: data: http://localhost:8000 https://*; connect-src 'self' http://localhost:8000 ws://localhost:8000 wss://* https://*; frame-ancestors 'none'; object-src 'none';"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
