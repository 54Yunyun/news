import { spawn } from 'node:child_process'

// 執行一支腳本並等它結束
// file: 相對這個檔案的路徑
// 回傳: 結束代碼
const run = (file) => {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(file, import.meta.url).pathname], { stdio: 'inherit' })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

const newsCode = await run('./fetch-news.mjs')
const weatherCode = await run('./fetch-weather.mjs')
if (newsCode !== 0 || weatherCode !== 0) process.exitCode = 1
