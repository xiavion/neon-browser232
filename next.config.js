/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Static HTML dışa aktarma
  distDir: 'out',
  images: {
    unoptimized: true, // Statik dışa aktarma için gerekli
  },
};

module.exports = nextConfig;
