import { readFile } from 'node:fs/promises'

// 讀取專案根目錄的 .env。已經存在的環境變數不覆蓋，CI 的 Secrets 優先
// 回傳: 無
export const loadEnv = async () => {
  let text = ''
  try {
    text = await readFile(new URL('../../.env', import.meta.url), 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return
    throw err
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

// 讀取環境變數，空白視為沒有設定
// name: 變數名稱
// 回傳: 去空白後的值，沒有時回傳空字串
export const readEnv = (name) => (process.env[name] || '').trim()

// 拿掉錯誤訊息裡可能出現的金鑰
// message: 原始訊息
// secrets: 要遮住的字串
// 回傳: 遮過的訊息
export const redact = (message, secrets = []) => {
  let text = String(message ?? '')
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join('[redacted]')
  }
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/CWA-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
}
