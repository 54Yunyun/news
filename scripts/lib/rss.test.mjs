import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalUrl, dedupe, hintFromRssCategory, parseFeed, selectByCategory, stripHtml, titleScore, withinAge } from './rss.mjs'

const source = { id: 'demo', name: '示例報', category: 'international' }

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Same Story]]></title>
    <link>https://Example.com/a?utm_source=rss</link>
    <pubDate>Mon, 23 Nov 2026 01:00:00 GMT</pubDate>
    <description><![CDATA[<p>Hello &amp; world</p>]]></description>
  </item>
  <item>
    <title>Same Story</title>
    <link>https://example.com/a/</link>
    <pubDate>Mon, 23 Nov 2026 02:00:00 GMT</pubDate>
    <description>dup</description>
  </item>
  <item>
    <title>Markets open higher</title>
    <link>https://example.com/b</link>
    <pubDate>Mon, 23 Nov 2026 03:00:00 GMT</pubDate>
    <description>short</description>
  </item>
</channel></rss>`

test('去掉 HTML 與實體', () => {
  assert.equal(stripHtml('<p>Hello &amp; world</p>'), 'Hello & world')
})

test('連結去掉追蹤參數', () => {
  assert.equal(canonicalUrl('https://Example.com/a/?utm_source=rss'), 'https://example.com/a')
})

test('解析 RSS 並依連結去重，保留較新的一則', () => {
  const parsed = parseFeed(rss, source)
  assert.equal(parsed[0].snippet, 'Hello & world')
  const items = dedupe(parsed)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'Markets open higher')
  assert.equal(items[1].url, 'https://example.com/a')
  assert.equal(items[1].snippet, 'dup')
  assert.match(items[1].publishedAt, /\+08:00$/)
})

test('同一家的相似標題只留一則，不同媒體先留著', () => {
  const score = titleScore('台股早盤電子權值走揚', '台股早盤電子權值走揚')
  assert.equal(score, 1)
  const items = dedupe([
    { url: 'https://example.com/1', title: '台股早盤電子權值走揚', publishedAt: '2026-11-23T10:00:00+08:00', category: 'finance', source: '甲', snippet: '', id: 'a' },
    { url: 'https://example.com/2', title: '台股早盤電子權值走揚！', publishedAt: '2026-11-23T09:00:00+08:00', category: 'finance', source: '甲', snippet: '', id: 'b' },
    { url: 'https://example.com/3', title: '台股早盤電子權值走揚！', publishedAt: '2026-11-23T09:30:00+08:00', category: 'finance', source: '乙', snippet: '', id: 'c' },
  ])
  assert.deepEqual(items.map((item) => item.id).sort(), ['a', 'c'])
})

test('每個分類最多留 N 則，並去掉過舊的', () => {
  const items = [
    { category: 'tech', publishedAt: '2026-11-23T10:00:00+08:00', url: 'https://example.com/1' },
    { category: 'tech', publishedAt: '2026-11-23T09:00:00+08:00', url: 'https://example.com/2' },
    { category: 'life', publishedAt: '2026-11-23T08:00:00+08:00', url: 'https://example.com/3' },
    { category: 'life', publishedAt: '2026-11-20T08:00:00+08:00', url: 'https://example.com/4' },
  ]
  const fresh = withinAge(items, 36, new Date('2026-11-23T12:00:00+08:00'))
  assert.equal(fresh.length, 3)
  assert.equal(selectByCategory(fresh, 1).length, 2)
})

test('RSS 分類提示含政治', () => {
  assert.equal(hintFromRssCategory('政治'), 'politics')
  assert.equal(hintFromRssCategory('生活'), 'life')
})

test('解析 Atom', () => {
  const atom = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Atom title</title>
      <link href="https://example.com/atom"/>
      <updated>2026-11-23T01:00:00Z</updated>
      <summary>atom summary</summary>
    </entry>
  </feed>`
  const items = parseFeed(atom, source)
  assert.equal(items.length, 1)
  assert.equal(items[0].url, 'https://example.com/atom')
  assert.equal(items[0].snippet, 'atom summary')
})
