import { defineConfig } from '@lynx-js/rspeedy'

import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

export default defineConfig({
  server: {
    host: '0.0.0.0',  // 监听所有网络接口
    port: 3000,
  },
  dev: {
    assetPrefix: 'http://10.107.230.250:3000/',  // 使用你的 WiFi IP
  },
  plugins: [
    pluginQRCode({
      schema(url) {
        // 强制使用正确的 IP 地址
        const correctUrl = url.replace(/26\.31\.187\.77|localhost|127\.0\.0\.1/, '10.107.230.250')
        return `${correctUrl}?fullscreen=true`
      },
    }),
    pluginReactLynx(),
    pluginTypeCheck(),
  ],
})
