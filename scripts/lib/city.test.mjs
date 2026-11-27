import assert from 'node:assert/strict'
import test from 'node:test'
import { CITY_STORAGE_KEY, DEFAULT_CITY_ID, readSavedCity, resolveCityId, saveCity } from '../../src/utils/city.js'

// 建立記憶體儲存供測試使用
// initial: 初始鍵值
// 回傳: 模擬 localStorage
const makeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
  }
}

test('沒有紀錄時預設臺北市，記住城市後能讀回同一個城市', () => {
  const storage = makeStorage()
  assert.equal(readSavedCity(storage), DEFAULT_CITY_ID)
  assert.equal(saveCity('kaohsiung', storage), true)
  assert.equal(storage.getItem(CITY_STORAGE_KEY), 'kaohsiung')
  assert.equal(readSavedCity(storage), 'kaohsiung')
})

test('儲存失敗或無效代碼時，安全退回臺北市', () => {
  const broken = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.equal(readSavedCity(broken), 'taipei')
  assert.equal(saveCity('tainan', broken), false)
  const options = [{ id: 'keelung' }, { id: 'taipei' }, { id: 'kaohsiung' }]
  assert.equal(resolveCityId('kaohsiung', options), 'kaohsiung')
  assert.equal(resolveCityId('unknown', options), 'taipei')
})
