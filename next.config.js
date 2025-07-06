/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',  // Static HTML dışa aktarma - Geliştirme için kapatıyoruz
  // distDir: 'out',
  images: {
    unoptimized: true, // Statik dışa aktarma için gerekli
  },
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
  },
};

module.exports = nextConfig;
