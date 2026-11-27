import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareItems } from './attribute.mjs'

const cna = {
  id: 'cna-1',
  feedId: 'cna',
  source: '中央社',
  title: '高雄監獄員工衝突雙方互告',
  snippet: '法務部矯正署發生衝突。',
  url: 'https://www.cna.com.tw/news/asoc/202611230107.aspx',
  publishedAt: '2026-11-23T13:00:00+08:00',
  category: 'life',
}

test('Yahoo 電頭標成中央社後，不再另計一家', () => {
  const items = prepareItems([
    cna,
    {
      id: 'yahoo-1',
      feedId: 'yahoo',
      source: 'Yahoo奇摩新聞',
      title: '高雄監獄員工衝突雙方互告',
      snippet: '（中央社記者洪學廣高雄23日電）雙方互告',
      url: 'https://tw.news.yahoo.com/prison-fight',
      publishedAt: '2026-11-23T14:00:00+08:00',
      category: 'life',
    },
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].source, '中央社')
  assert.equal(items[0].url, cna.url)
  assert.equal(items[0].publishedAt, '2026-11-23T14:00:00+08:00')
})

test('標題看不出原媒體時，Yahoo 仍算一家', () => {
  const items = prepareItems([
    {
      id: 'yahoo-2',
      feedId: 'yahoo',
      source: 'Yahoo奇摩新聞',
      title: '里長座談談都市更新',
      snippet: '現場討論長照與交通。',
      url: 'https://tw.news.yahoo.com/local-talk',
      publishedAt: '2026-11-23T12:00:00+08:00',
      category: 'life',
    },
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'Yahoo奇摩新聞')
})

test('Yahoo 轉載壹蘋新聞網時改記壹蘋並優先保留原站連結', () => {
  const direct = {
    id: 'nextapple-1',
    feedId: 'nextapple:local',
    source: '壹蘋新聞網',
    title: '新北護理之家疑超收病患遭搜查',
    snippet: '',
    url: 'https://news.nextapple.com/local/20261127/ABC123',
    publishedAt: '2026-11-27T08:00:00+08:00',
    category: 'life',
  }
  const items = prepareItems([
    direct,
    {
      id: 'yahoo-3',
      feedId: 'yahoo',
      source: 'Yahoo奇摩新聞',
      rssSource: '壹蘋新聞網',
      title: '新北護理之家疑超收病患遭搜查',
      snippet: '檢警搜查並聲押多名被告。',
      url: 'https://tw.news.yahoo.com/nextapple-copy',
      publishedAt: '2026-11-27T08:30:00+08:00',
      category: 'life',
    },
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].source, '壹蘋新聞網')
  assert.equal(items[0].url, direct.url)
  assert.equal(items[0].publishedAt, '2026-11-27T08:30:00+08:00')
})

test('遊戲角落與巴哈姆特 GNN、4Gamers 會正確歸屬，不會把遊戲角落誤判為聯合報', () => {
  const items = prepareItems([
    {
      id: 'game-1',
      feedId: 'udn-game',
      source: '遊戲角落',
      title: '《GTA6》最新預告解析',
      snippet: '玩家熱議新畫面。',
      url: 'https://game.udn.com/game/story/122089/123456',
      publishedAt: '2026-11-27T09:00:00+08:00',
      category: 'gaming',
    },
    {
      id: 'gnn-1',
      feedId: 'gnn',
      source: '巴哈姆特GNN',
      title: '新作上市情報公開',
      snippet: '官方今日公布發售日。',
      url: 'https://gnn.gamer.com.tw/detail.php?sn=280000',
      publishedAt: '2026-11-27T09:10:00+08:00',
      category: 'gaming',
    },
    {
      id: '4g-1',
      feedId: '4gamers',
      source: '4Gamers',
      title: '電競總決賽結果出爐',
      snippet: '冠軍隊伍抱走獎盃。',
      url: 'https://www.4gamers.com.tw/news/detail/99999/test',
      publishedAt: '2026-11-27T09:20:00+08:00',
      category: 'gaming',
    },
  ])
  const byId = new Map(items.map((item) => [item.id, item]))
  assert.equal(byId.get('game-1').source, '遊戲角落')
  assert.equal(byId.get('gnn-1').source, '巴哈姆特GNN')
  assert.equal(byId.get('4g-1').source, '4Gamers')
})
