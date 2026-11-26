import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 把 GitHub Pages 的子路徑補成前後都有斜線
// value: 環境變數 BASE_PATH
// 回傳: Vite 的 base
const pageBase = (value) => {
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/|\/$/g, '')}/`
}

export default defineConfig({
  base: pageBase(process.env.BASE_PATH),
  plugins: [vue(), tailwindcss()],
})
