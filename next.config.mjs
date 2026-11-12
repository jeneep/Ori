/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force a clean rebuild after broken production aliases.
  generateBuildId: async () => `ori-${Date.now()}`,
};

export default nextConfig;
