import { rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// 把 URL 或字串路徑轉成檔案系統路徑
// file: 目標路徑
// 回傳: 絕對路徑
const toPath = (file) => (file instanceof URL ? fileURLToPath(file) : file)

// 先寫暫存檔再改名，避免寫到一半覆蓋掉前一份可用的資料
// file: 目標路徑
// data: 要寫入的物件
// 回傳: 無
export const writeJson = async (file, data) => {
  const path = toPath(file)
  const tmp = `${path}.tmp`
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}
