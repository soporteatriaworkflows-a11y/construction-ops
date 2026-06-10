/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Importación BOQ (4C.1, ≤3 MB) y de catálogo (CATALOG_BULK_ONBOARDING_V1,
      // ≤10 MB) viajan por Server Actions. Tope de 12 MB = archivo máx. + overhead
      // de FormData. NOTA producción: el runtime serverless de Vercel limita el
      // body a ~4.5 MB; archivos mayores requieren upload directo a storage
      // (deuda LARGE_FILE_DIRECT_UPLOAD). Cada importador valida su propio
      // límite de archivo en código server-side.
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
