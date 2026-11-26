<script setup>
import { computed, nextTick, ref } from 'vue'
import WeatherIcon from './WeatherIcon.vue'

const props = defineProps({
  cities: {
    type: Array,
    default: () => [],
  },
  cityId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:cityId'])

const regions = [
  { name: '北部', ids: ['keelung', 'taipei', 'new-taipei', 'taoyuan', 'hsinchu-county', 'hsinchu-city', 'yilan'] },
  { name: '中部', ids: ['miaoli', 'taichung', 'changhua', 'nantou', 'yunlin'] },
  { name: '南部', ids: ['chiayi-county', 'chiayi-city', 'tainan', 'kaohsiung', 'pingtung'] },
  { name: '東部', ids: ['hualien', 'taitung'] },
  { name: '離島', ids: ['penghu', 'kinmen', 'lienchiang'] },
]

const open = ref(false)
const trigger = ref(null)
const panel = ref(null)

// 依地區把有資料的縣市排好
// 回傳: { name, cities } 陣列
const groups = computed(() => {
  const byId = new Map(props.cities.map((city) => [city.id, city]))
  return regions.map((region) => ({
    name: region.name,
    cities: region.ids.map((id) => byId.get(id)).filter(Boolean),
  })).filter((region) => region.cities.length)
})

// 方向鍵用的一維清單
// 回傳: 縣市陣列
const flat = computed(() => groups.value.flatMap((region) => region.cities))

// 觸發按鈕上的城市名稱
// 回傳: 縣市名稱
const currentName = computed(() => props.cities.find((city) => city.id === props.cityId)?.name || '選擇縣市')

// 把焦點移到指定縣市
// id: 縣市代碼
// 回傳: 無
const focusCity = (id) => {
  panel.value?.querySelector(`[data-city="${id}"]`)?.focus()
}

// 桌機把面板放在按鈕下方，手機改由樣式貼底
// 回傳: 無
const place = () => {
  const dialog = panel.value
  const button = trigger.value
  if (!dialog || !button) return
  const sheet = window.innerWidth < 640
  dialog.classList.toggle('is-sheet', sheet)
  if (sheet) {
    dialog.style.top = ''
    dialog.style.left = ''
    dialog.style.maxHeight = ''
    return
  }
  const rect = button.getBoundingClientRect()
  const width = 340
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const space = window.innerHeight - rect.bottom - 16
  dialog.style.top = `${rect.bottom + 8}px`
  dialog.style.left = `${left}px`
  dialog.style.maxHeight = `${Math.max(220, Math.min(space, window.innerHeight * 0.7))}px`
}

// 打開面板並把焦點放到目前縣市
// 回傳: 無
const show = async () => {
  open.value = true
  await nextTick()
  place()
  focusCity(props.cityId)
}

// 關掉面板，焦點回到觸發按鈕
// 回傳: 無
const hide = () => {
  open.value = false
  trigger.value?.focus()
}

// 再點一次按鈕就收合
// 回傳: 無
const toggle = () => {
  if (open.value) hide()
  else show()
}

// 選完立刻切換並收合
// id: 縣市代碼
// 回傳: 無
const choose = (id) => {
  emit('update:cityId', id)
  hide()
}

// 方向鍵在 3 欄格子裡移動
// event: 鍵盤事件
// 回傳: 無
const onKey = (event) => {
  const list = flat.value
  const index = list.findIndex((city) => city.id === document.activeElement?.dataset?.city)
  if (index < 0) return
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3, Home: -index, End: list.length - 1 - index }[event.key]
  if (step == null) {
    if (event.key === 'Escape') hide()
    return
  }
  event.preventDefault()
  const next = list[Math.max(0, Math.min(list.length - 1, index + step))]
  focusCity(next.id)
}

// 點面板外的遮罩時收合
// event: 點擊事件
// 回傳: 無
const onBackdrop = (event) => {
  if (event.target === event.currentTarget) hide()
}
</script>

<template>
  <div class="relative min-w-0">
    <button
      ref="trigger"
      type="button"
      class="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 text-base font-medium text-cream"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-controls="city-panel"
      @click="toggle"
    >
      <svg
        class="size-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.25" />
      </svg>
      <span class="truncate">{{ currentName }}</span>
      <svg
        class="size-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div
      v-if="open"
      class="city-backdrop"
      @click="onBackdrop"
    ></div>
    <div
      v-if="open"
      id="city-panel"
      ref="panel"
      class="city-panel"
      role="listbox"
      aria-label="選擇縣市"
      tabindex="-1"
      @keydown="onKey"
    >
      <section v-for="region in groups" :key="region.name" class="mt-3 first:mt-0">
        <h3 class="px-1 text-xs font-medium tracking-widest text-muted">{{ region.name }}</h3>
        <div class="mt-1 grid grid-cols-3 gap-2">
          <button
            v-for="city in region.cities"
            :key="city.id"
            type="button"
            role="option"
            class="flex min-h-11 cursor-pointer flex-col items-start rounded-xl border px-2 py-1.5 text-left"
            :class="city.id === cityId ? 'border-brand bg-brand/10' : 'border-line bg-card'"
            :aria-selected="city.id === cityId"
            :data-city="city.id"
            @click="choose(city.id)"
          >
            <span class="text-sm font-medium text-ink">{{ city.name }}</span>
            <span class="mt-1 flex items-center gap-1 text-xs text-muted">
              <WeatherIcon v-if="city.conditionCode" class="size-4" :code="city.conditionCode" />
              <span v-if="city.temp != null">{{ city.temp }}°</span>
            </span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
