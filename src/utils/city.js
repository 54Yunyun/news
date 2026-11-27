export const CITY_STORAGE_KEY = 'news-city'
export const DEFAULT_CITY_ID = 'taipei'

// 讀取上次選擇的縣市，讀不到時預設臺北市
// storage: 儲存介面，預設使用 localStorage
// 回傳: 縣市代碼
export const readSavedCity = (storage = globalThis.localStorage) => {
  try {
    const saved = storage?.getItem?.(CITY_STORAGE_KEY)
    return typeof saved === 'string' && saved.trim() ? saved.trim() : DEFAULT_CITY_ID
  } catch {
    return DEFAULT_CITY_ID
  }
}

// 記住使用者選擇的縣市，寫入失敗不中斷畫面切換
// id: 縣市代碼
// storage: 儲存介面，預設使用 localStorage
// 回傳: 是否寫入成功
export const saveCity = (id, storage = globalThis.localStorage) => {
  const value = typeof id === 'string' ? id.trim() : ''
  if (!value) return false
  try {
    storage?.setItem?.(CITY_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

// 確認縣市代碼在可選清單中，找不到時退回臺北市或第一筆
// id: 候選縣市代碼
// options: 可選縣市陣列
// 回傳: 有效的縣市代碼
export const resolveCityId = (id, options) => {
  const list = Array.isArray(options) ? options : []
  if (list.some((item) => item.id === id)) return id
  return list.find((item) => item.id === DEFAULT_CITY_ID)?.id || list[0]?.id || ''
}
