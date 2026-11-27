<script setup>
import { computed, ref } from 'vue'
import CityPicker from './CityPicker.vue'
import WeatherIcon from './WeatherIcon.vue'

const props = defineProps({
  weather: {
    type: Object,
    required: true,
  },
  cities: {
    type: Array,
    default: () => [],
  },
  cityId: {
    type: String,
    default: '',
  },
})

defineEmits(['update:cityId'])

const open = ref(false)
const moreHours = ref(false)

// 逐時、未來三天或日出日落有資料時才提供詳細面板
// 回傳: 是否可展開
const hasDetail = computed(() => {
  return Boolean(props.weather.hourly?.length || props.weather.forecast?.length || props.weather.sun)
})

// 預設 6 小時，展開後連同後面 6 小時一起顯示
// 回傳: 逐時陣列
const shownHours = computed(() => {
  const hours = props.weather.hourly ?? []
  return hours.slice(0, moreHours.value ? 12 : 6)
})

// 展開或收合詳細預報
// 回傳: 無
const toggle = () => {
  open.value = !open.value
}

// 展開或收合另外 6 小時
// 回傳: 無
const toggleHours = () => {
  moreHours.value = !moreHours.value
}

// 降雨長條的高度，跟著機率從 0 到整格
// prob: 降雨機率
// 回傳: style 物件
const barStyle = (prob) => {
  const value = Math.max(0, Math.min(100, Number(prob) || 0))
  return { height: `${value}%` }
}

// 逐時一欄要唸出來的句子
// hour: 單一小時
// 回傳: 句子
const hourText = (hour) => `${hour.label}，${hour.temp}°，降雨機率 ${hour.rainProb}%`

// 三天預報給讀屏與游標的完整句子，畫面上不放天氣描述
// day: 單日預報
// 回傳: 句子
const dayText = (day) => `${day.label}，${day.condition}，降雨機率 ${day.rainProb}%，高 ${day.high}°，低 ${day.low}°`
</script>

<template>
  <section class="weather-card rounded-2xl px-4 py-3 sm:px-5" aria-labelledby="weather-heading">
    <h2 id="weather-heading" class="sr-only">今日天氣</h2>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
      <CityPicker
        class="order-1 shrink-0"
        :cities="cities"
        :city-id="cityId"
        @update:city-id="$emit('update:cityId', $event)"
      />
      <p class="order-2 flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span class="font-serif text-3xl font-bold leading-none tracking-tight whitespace-nowrap">
          {{ weather.current.temp }}<span class="align-top text-lg font-semibold">°</span>
        </span>
        <span class="truncate text-base">{{ weather.current.condition }}</span>
        <WeatherIcon class="size-7 shrink-0 sm:size-8" :code="weather.current.conditionCode" />
      </p>
      <button
        v-if="hasDetail"
        type="button"
        class="order-3 ml-auto inline-flex min-h-11 shrink-0 cursor-pointer items-center text-sm underline decoration-1 underline-offset-4 sm:order-4"
        :aria-expanded="open"
        aria-controls="weather-detail"
        @click="toggle"
      >
        {{ open ? '收合' : '詳細' }}
      </button>
      <p v-if="weather.reminder" class="order-4 w-full text-sm leading-5 sm:order-3 sm:w-auto sm:min-w-64 sm:flex-1">{{ weather.reminder }}</p>
    </div>

    <div v-if="open" id="weather-detail" class="mt-4">
      <p class="weather-muted text-xs">
        高 {{ weather.current.high }}°
        <span aria-hidden="true"> · </span>
        低 {{ weather.current.low }}°
        <span aria-hidden="true"> · </span>
        降雨機率 {{ weather.current.rainProb }}%
      </p>

      <template v-if="weather.hourly?.length">
        <div class="mt-4 flex items-center justify-between gap-3">
          <h3 class="weather-muted text-xs font-medium">逐時預報</h3>
          <button
            v-if="weather.hourly.length > 6"
            type="button"
            class="weather-muted relative cursor-pointer text-xs before:absolute before:-inset-x-2 before:-inset-y-3"
            :aria-expanded="moreHours"
            @click="toggleHours"
          >
            {{ moreHours ? '收合' : '更多' }}
          </button>
        </div>
        <ul class="mt-2 grid grid-cols-6 gap-x-1 gap-y-3" aria-label="逐時預報">
          <li
            v-for="hour in shownHours"
            :key="hour.time"
            class="min-w-0 text-center"
            :aria-label="hourText(hour)"
          >
            <p class="weather-muted text-xs">{{ hour.label }}</p>
            <div class="mx-auto mt-1 flex h-7 items-end justify-center" aria-hidden="true">
              <span class="w-1.5 rounded-full bg-[#8CC3DA]" :style="barStyle(hour.rainProb)"></span>
            </div>
            <p class="mt-1 text-xs font-medium tabular-nums">{{ hour.temp }}°</p>
          </li>
        </ul>
        <p class="weather-muted mt-2 text-xs">長條代表降雨機率</p>
      </template>

      <h3 v-if="weather.forecast?.length" class="weather-muted mt-4 text-xs font-medium">未來三天</h3>
      <ul v-if="weather.forecast?.length" class="mt-1">
        <li
          v-for="day in weather.forecast"
          :key="day.date"
          class="flex items-center gap-2 py-1.5 text-xs"
          :aria-label="dayText(day)"
          :title="dayText(day)"
        >
          <span class="w-8 shrink-0">{{ day.label }}</span>
          <WeatherIcon class="size-5 shrink-0" :code="day.conditionCode" />
          <span class="weather-muted tabular-nums">{{ day.rainProb }}%</span>
          <span class="ml-auto shrink-0 tabular-nums">
            <span class="font-medium">{{ day.high }}°</span>
            <span class="weather-muted" aria-hidden="true"> / </span>
            <span class="weather-muted">{{ day.low }}°</span>
          </span>
        </li>
      </ul>

      <p v-if="weather.sun" class="weather-rule weather-muted mt-3 flex items-center gap-4 pt-3 text-xs">
        <span class="inline-flex items-center gap-1">
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
            <circle cx="12" cy="11" r="3" />
            <path d="M12 4v1.5M6.2 6.2l1.1 1.1M4 11H5.5M6.2 15.8l1.1-1.1M17.8 6.2l-1.1 1.1M18.5 11H20M12 16v4M9 20h6" />
          </svg>
          日出 {{ weather.sun.sunrise }}
        </span>
        <span class="inline-flex items-center gap-1">
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
            <circle cx="12" cy="13" r="3" />
            <path d="M6.2 8.2l1.1 1.1M4 13H5.5M18.5 13H20M17.8 8.2l-1.1 1.1M4 18h16" />
          </svg>
          日落 {{ weather.sun.sunset }}
        </span>
      </p>
    </div>
  </section>
</template>
