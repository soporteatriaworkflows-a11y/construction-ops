/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Importación de Excel (4C.1): el archivo `.xlsx` viaja por una Server Action.
      // Tope de 4 MB para el body (archivo ≤3 MB validado en código + overhead de
      // FormData), por debajo del límite de ~4.5 MB del runtime de funciones de Vercel.
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
