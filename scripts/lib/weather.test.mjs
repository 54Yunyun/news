import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../weather.config.json' with { type: 'json' }
import { assembleCities, buildReminder, conditionCode, datasetFor, datasets, packWeather, previousCities, toSun, toWeatherFile } from './weather.mjs'

const sample = {
  success: 'true',
  records: {
    locations: [
      {
        location: [
          {
            locationName: '中正區',
            weatherElement: [
              {
                elementName: 'T',
                time: [
                  { dataTime: '2026-11-23T08:00:00+08:00', elementValue: [{ value: '21' }] },
                  { dataTime: '2026-11-23T14:00:00+08:00', elementValue: [{ value: '25' }] },
                  { dataTime: '2026-11-23T20:00:00+08:00', elementValue: [{ value: '19' }] },
                  { dataTime: '2026-11-24T08:00:00+08:00', elementValue: [{ value: '18' }] },
                  { dataTime: '2026-11-24T14:00:00+08:00', elementValue: [{ value: '23' }] },
                  { dataTime: '2026-11-25T11:00:00+08:00', elementValue: [{ value: '22' }] },
                  { dataTime: '2026-11-25T15:00:00+08:00', elementValue: [{ value: '24' }] },
                ],
              },
              {
                elementName: 'Wx',
                time: [
                  { startTime: '2026-11-23 06:00:00', elementValue: [{ value: '多雲時晴' }] },
                  { startTime: '2026-11-24 06:00:00', elementValue: [{ value: '陰短暫雨' }] },
                  { startTime: '2026-11-25 06:00:00', elementValue: [{ value: '多雲' }] },
                ],
              },
              {
                elementName: 'PoP6h',
                time: [
                  { startTime: '2026-11-23T06:00:00+08:00', elementValue: [{ value: '20' }] },
                  { startTime: '2026-11-23T12:00:00+08:00', elementValue: [{ value: '40' }] },
                  { startTime: '2026-11-24T06:00:00+08:00', elementValue: [{ value: '60' }] },
                  { startTime: '2026-11-25T06:00:00+08:00', elementValue: [{ value: '10' }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

test('天氣描述對到圖示代碼', () => {
  assert.equal(conditionCode('多雲時晴'), 'partly-cloudy')
  assert.equal(conditionCode('陰短暫雨'), 'rain')
  assert.equal(conditionCode('午後雷陣雨'), 'thunderstorm')
  assert.equal(conditionCode('有霧'), 'fog')
  assert.equal(conditionCode('晴'), 'sunny')
})

test('出門提醒只看規則', () => {
  assert.match(buildReminder({ rainProb: 60, low: 20, high: 24 }), /帶傘/)
  assert.match(buildReminder({ rainProb: 10, low: 14, high: 18 }), /保暖/)
  assert.match(buildReminder({ rainProb: 0, low: 22, high: 26 }), /依氣溫/)
  assert.match(buildReminder({ rainProb: 0, low: 22, high: 26 }, {}, { rainProb: 61 }), /明天有雨/)
  assert.match(buildReminder({ rainProb: 70, low: 20, high: 24 }, {}, { rainProb: 80 }), /今天降雨機率超過五成，明天也有雨/)
  assert.doesNotMatch(buildReminder({ rainProb: 70, low: 20, high: 24 }, {}, { rainProb: 80 }), /；/)
  assert.doesNotMatch(buildReminder({ rainProb: 0, low: 22, high: 26 }, {}, { rainProb: 60 }), /明天有雨/)
})

test('22 個縣市的資料集代碼與官方對照一致', () => {
  assert.equal(config.cities.length, 22)
  assert.equal(new Set(config.cities.map((city) => city.datasetId)).size, 22)
  assert.equal(new Set(config.cities.map((city) => city.id)).size, 22)
  for (const city of config.cities) assert.equal(datasets[city.location], city.datasetId)
})

test('失敗的縣市留著上一份，舊的單縣市檔可對到臺北市', () => {
  const kept = previousCities(
    { location: '臺北市', current: { temp: 18 }, forecast: [{ date: '2026-11-24' }] },
    config.cities,
  )
  const next = assembleCities(kept, [
    { id: 'taipei', file: null },
    { id: 'keelung', file: { location: '基隆市', current: { temp: 17 }, forecast: [{ date: '2026-11-24' }] } },
  ])
  assert.equal(next.taipei.current.temp, 18)
  assert.equal(next.keelung.location, '基隆市')
  const packed = packWeather({ updatedAt: '2026-11-24T12:00:00+08:00', order: ['taipei'], names: { taipei: '臺北市' }, cities: next })
  assert.equal(packed.mode, 'single')
})

test('台北市對到三天預報資料集', () => {
  assert.equal(datasetFor({ location: '台北市' }), 'F-D0047-061')
})

test('整理成 weather.json 的欄位', () => {
  const file = toWeatherFile(sample, { location: '臺北市', district: '中正區' }, new Date('2026-11-23T09:00:00+08:00'))
  assert.equal(file.location, '臺北市')
  assert.equal(file.current.temp, 21)
  assert.equal(file.current.condition, '多雲時晴')
  assert.equal(file.current.conditionCode, 'partly-cloudy')
  assert.equal(file.current.high, 25)
  assert.equal(file.current.low, 19)
  assert.equal(file.current.rainProb, 40)
  assert.equal(file.forecast.length, 3)
  assert.equal(file.forecast[0].label, '今天')
  assert.equal(file.forecast[1].label, '週二')
  assert.equal(file.forecast[1].rainProb, 60)
  assert.equal(file.forecast[1].conditionCode, 'rain')
  assert.match(file.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/)
  const hour14 = file.hourly.find((item) => item.label === '14時')
  assert.equal(hour14.temp, 25)
  assert.equal(hour14.rainProb, 40)
  assert.ok(file.hourly.length <= 12)
})

test('日出日落取今天的 SunRiseTime 與 SunSetTime', () => {
  const sun = toSun({
    records: {
      locations: {
        location: [{
          CountyName: '臺北市',
          time: [
            { Date: '2026-11-22', SunRiseTime: '06:00', SunSetTime: '17:00' },
            { Date: '2026-11-23', SunRiseTime: '6:12', SunSetTime: '17:05' },
          ],
        }],
      },
    },
  }, '台北市', new Date('2026-11-23T09:00:00+08:00'))
  assert.deepEqual(sun, { date: '2026-11-23', sunrise: '06:12', sunset: '17:05' })
})

test('氣象署中文欄位也能讀', () => {
  const file = toWeatherFile({
    records: {
      Locations: [{
        Location: [{
          LocationName: '中正區',
          WeatherElement: [
            {
              ElementName: '溫度',
              Time: [
                { DataTime: '2026-11-23T09:00:00+08:00', ElementValue: [{ Temperature: '21' }] },
                { DataTime: '2026-11-23T15:00:00+08:00', ElementValue: [{ Temperature: '26' }] },
              ],
            },
            {
              ElementName: '天氣現象',
              Time: [{ StartTime: '2026-11-23T06:00:00+08:00', ElementValue: [{ Weather: '晴', WeatherCode: '01' }] }],
            },
            {
              ElementName: '3小時降雨機率',
              Time: [{ StartTime: '2026-11-23T12:00:00+08:00', ElementValue: [{ ProbabilityOfPrecipitation: '20' }] }],
            },
          ],
        }],
      }],
    },
  }, { location: '臺北市', district: '中正區' }, new Date('2026-11-23T09:30:00+08:00'))
  assert.equal(file.current.temp, 21)
  assert.equal(file.current.high, 26)
  assert.equal(file.current.condition, '晴')
  assert.equal(file.current.rainProb, 20)
})

test('大小寫不同的欄位也能讀', () => {
  const upper = {
    records: {
      Locations: [
        {
          Location: [
            {
              LocationName: '中正區',
              WeatherElement: [
                {
                  ElementName: 'T',
                  Time: [{ DataTime: '2026-11-23T09:00:00+08:00', ElementValue: [{ value: '22' }] }],
                },
                {
                  ElementName: 'Wx',
                  Time: [{ StartTime: '2026-11-23T06:00:00+08:00', ElementValue: [{ Weather: '晴' }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  }
  const file = toWeatherFile(upper, { location: '臺北市', district: '中正區' }, new Date('2026-11-23T09:00:00+08:00'))
  assert.equal(file.current.temp, 22)
  assert.equal(file.current.conditionCode, 'sunny')
})
