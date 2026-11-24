/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: 'export',
  images: { unoptimized: true },
  
  // Production obfuscation
  ...(isProd && {
    webpack: (config, { isServer }) => {
      if (!isServer) {
        const JavaScriptObfuscator = require('webpack-obfuscator');
        config.plugins.push(
          new JavaScriptObfuscator({
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.4,
            debugProtection: true,
            debugProtectionInterval: 4000,
            disableConsoleOutput: true,
            identifierNamesGenerator: 'hexadecimal',
            log: false,
            renameGlobals: false,
            rotateStringArray: true,
            selfDefending: true,
            shuffleStringArray: true,
            splitStrings: true,
            splitStringsChunkLength: 10,
            stringArray: true,
            stringArrayEncoding: ['rc4'],
            stringArrayThreshold: 0.75,
            transformObjectKeys: true,
            unicodeEscapeSequence: false,
          }, ['*.map']) // Exclude source maps
        );
      }
      return config;
    },
  }),

  // For static export, headers must be configured at hosting level (firebase.json)
  // This is handled by firebase.json hosting.headers
};

module.exports = nextConfig;