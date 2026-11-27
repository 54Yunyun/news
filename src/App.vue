<script setup>
import { computed } from 'vue'
import CategoryTabs from './components/CategoryTabs.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import NewsCard from './components/NewsCard.vue'
import WeatherCard from './components/WeatherCard.vue'
import { useBriefing } from './composables/useBriefing.js'
import { categoryLabel } from './constants/categories.js'
import { formatClock, formatEdition, formatMastheadDate } from './utils/format.js'
import { briefCards } from './utils/layout.js'

const {
  news,
  weather,
  cityId,
  cityOptions,
  selectCity,
  generatedAt,
  todayBrief,
  presented,
  visibleNews,
  hiddenCount,
  revealMore,
  isFresh,
  newsError,
  weatherError,
  category,
  sortMode,
  filteredNews,
  loading,
  selectCategory,
  setSortMode,
  load,
} = useBriefing()

// 刊頭日期，尚無資料時改顯示今天
// 回傳: 如「2026年11月23日 星期一」
const dateLabel = computed(() => formatMastheadDate(generatedAt.value))

// 版次。05–11 點晨間、11–17 點午間、17–05 點晚間
// 回傳: 晨間版、午間版或晚間版
const editionLabel = computed(() => formatEdition(generatedAt.value))

// 這份簡報的產生時分
// 回傳: 如「06:30」
const generatedLabel = computed(() => formatClock(generatedAt.value))

// 天氣資料的更新時分
// 回傳: 如「06:00」
const weatherUpdatedLabel = computed(() => formatClock(weather.value?.updatedAt))

// 今日重點配上分類標籤
// 回傳: { text, category } 陣列
const cards = computed(() => briefCards(todayBrief.value, news.value))

// 同一個話題裡，這一頁以外的子事件
// item: 頭條或次要那一則
// 回傳: 其餘子事件
const topicSiblings = (item) => {
  if (!item?.topicId) return []
  return visibleNews.value.filter((other) => other.topicId === item.topicId && other.id !== item.id)
}

// 新聞列表是空的時候要顯示的句子
// 回傳: 提示文字
const emptyNewsLabel = computed(() => {
  if (category.value === 'all' && news.value.length === 0) return '今天還沒有新聞。'
  return '這個分類目前沒有新聞。'
})
</script>

<template>
  <div class="page-shell min-h-screen px-4 py-6 font-sans text-ink antialiased sm:px-6 sm:py-10">
    <a class="skip-link" href="#news">跳至新聞列表</a>
    <Header
      :edition="editionLabel"
      :date-label="dateLabel"
      :generated-label="generatedLabel"
      :weather-updated-label="weatherUpdatedLabel"
    />

    <p v-if="loading" class="mt-10 text-center text-muted" role="status">正在讀取簡報…</p>

    <main v-else class="mt-8">
      <WeatherCard
        v-if="weather"
        :weather="weather"
        :cities="cityOptions"
        :city-id="cityId"
        @update:city-id="selectCity"
      />
      <section
        v-else
        class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center"
        role="alert"
      >
        <p>{{ weatherError }}</p>
        <button
          type="button"
          class="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink"
          @click="load"
        >
          重新載入
        </button>
      </section>

      <section
        v-if="cards.length === 3"
        class="mt-8"
        aria-labelledby="brief-heading"
      >
        <h2 id="brief-heading" class="text-sm font-medium tracking-[0.2em] text-brand">今日重點</h2>
        <ul class="brief-scroll mt-3 flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
          <li
            v-for="(card, index) in cards"
            :key="index"
            class="w-64 shrink-0 rounded-2xl border border-line bg-card px-4 py-3 md:w-auto"
          >
            <p v-if="card.category" class="text-xs font-medium text-brand">{{ categoryLabel(card.category) }}</p>
            <p class="font-serif text-base leading-7 text-ink" :class="card.category ? 'mt-1' : ''">{{ card.text }}</p>
          </li>
        </ul>
      </section>

      <section id="news" class="mt-8 scroll-mt-6" aria-labelledby="news-heading">
        <h2 id="news-heading" class="sr-only">新聞列表</h2>
        <div v-if="newsError" class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center" role="alert">
          <p>{{ newsError }}</p>
          <button
            type="button"
            class="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink"
            @click="load"
          >
            重新載入
          </button>
        </div>
        <template v-else>
          <CategoryTabs
            :model-value="category"
            :count="filteredNews.length"
            @update:model-value="selectCategory"
          />
          <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="排序">
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm"
              :class="sortMode === 'coverage' ? 'border-brand font-medium text-brand' : 'border-line text-muted'"
              :aria-pressed="sortMode === 'coverage'"
              @click="setSortMode('coverage')"
            >
              多家優先
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm"
              :class="sortMode === 'time' ? 'border-brand font-medium text-brand' : 'border-line text-muted'"
              :aria-pressed="sortMode === 'time'"
              @click="setSortMode('time')"
            >
              依時間
            </button>
          </div>
          <div
            id="news-list"
            class="mt-4 flex flex-col gap-4"
            role="tabpanel"
            :aria-labelledby="`tab-${category}`"
          >
            <template v-if="presented.lead">
              <NewsCard
                :item="presented.lead"
                :topic-items="topicSiblings(presented.lead)"
                variant="lead"
                :fresh="isFresh(presented.lead)"
              />
              <div v-if="presented.sides.length" class="flex flex-col gap-3">
                <NewsCard
                  v-for="item in presented.sides"
                  :key="item.id"
                  :item="item"
                  :topic-items="topicSiblings(item)"
                  variant="side"
                  :fresh="isFresh(item)"
                />
              </div>
            </template>
            <ul
              v-if="presented.blocks.length"
              class="overflow-hidden rounded-2xl border border-line bg-card"
            >
              <li
                v-for="block in presented.blocks"
                :key="block.item.id"
                class="border-b border-line last:border-b-0"
              >
                <NewsCard :item="block.item" variant="row" :fresh="isFresh(block.item)" />
              </li>
            </ul>
            <p
              v-if="filteredNews.length === 0"
              class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center text-muted"
            >
              {{ emptyNewsLabel }}
            </p>
            <button
              v-else-if="hiddenCount > 0"
              type="button"
              class="mx-auto inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink"
              @click="revealMore"
            >
              看更多
            </button>
          </div>
        </template>
      </section>
    </main>

    <Footer />
  </div>
</template>
