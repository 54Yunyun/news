// 畫面上的分類標籤。id 須與 news.json 的 category 一致，all 只存在於畫面
export const categories = [
  { id: 'all', label: '全部' },
  { id: 'international', label: '國際' },
  { id: 'politics', label: '政治' },
  { id: 'finance', label: '財經' },
  { id: 'tech', label: '科技' },
  { id: 'life', label: '生活' },
]

// 把分類代碼轉成中文標籤
// id: 分類代碼
// 回傳: 中文標籤，找不到時回傳原代碼
export const categoryLabel = (id) => {
  return categories.find((item) => item.id === id)?.label ?? id
}
