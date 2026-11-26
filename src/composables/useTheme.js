import { computed, onMounted, onUnmounted, ref } from 'vue'

const storageKey = 'news-theme'
const modes = ['system', 'light', 'dark']

// 讀主題設定。讀不到或值不認得時用跟隨系統
// 回傳: system、light 或 dark
const readMode = () => {
  try {
    const value = localStorage.getItem(storageKey)
    return modes.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

// 這個模式現在要不要套深色
// mode: system、light 或 dark
// 回傳: 是否深色
const prefersDark = (mode) => {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// 在繪製前之外的切換，把 class 與瀏覽器色票一起改掉
// mode: system、light 或 dark
// 回傳: 無
const applyMode = (mode) => {
  const dark = prefersDark(mode)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  const theme = document.querySelector('meta[name="theme-color"]')
  if (theme) theme.setAttribute('content', dark ? '#1A1714' : '#F6F2EA')
}

// 記住並套用主題。寫入失敗仍會切換這次的畫面
// 回傳: 目前模式、解析後是否深色、循環切換
export const useTheme = () => {
  const mode = ref(readMode())
  let media

  // 系統外觀變了，而且目前是跟隨系統時才重套
  // 回傳: 無
  const onSystemChange = () => {
    if (mode.value === 'system') applyMode('system')
  }

  onMounted(() => {
    mode.value = readMode()
    applyMode(mode.value)
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onSystemChange)
  })

  onUnmounted(() => {
    media?.removeEventListener('change', onSystemChange)
  })

  // 跟隨系統、淺色、深色循環
  // 回傳: 無
  const cycle = () => {
    const next = mode.value === 'system' ? 'light' : mode.value === 'light' ? 'dark' : 'system'
    mode.value = next
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // 瀏覽器擋住儲存時，這次畫面仍切換
    }
    applyMode(next)
  }

  const dark = computed(() => prefersDark(mode.value))

  // 按鈕上要唸出來的目前模式，以及下一檔
  // 回傳: aria-label
  const label = computed(() => {
    if (mode.value === 'light') return '主題：淺色。改為深色'
    if (mode.value === 'dark') return '主題：深色。改為跟隨系統'
    return '主題：跟隨系統。改為淺色'
  })

  return { mode, dark, label, cycle }
}
