import { expect, test } from 'bun:test'
import { sourceRegion } from './source-scope'

test.each([
  'https://www.chntheatre.edu.cn/cn/xiao/detail/25324.html',
  'https://tv.cctv.com/2017/05/01/video.shtml',
  'https://mtaihu.chncpa.org/cg_8085/index.html',
  'https://zwgk.mct.gov.cn/publication.pdf',
])('verified mainland source domain remains eligible: %s', (url) => {
  expect(sourceRegion(url)).toBe('mainland')
})

test.each([
  ['https://www.hkrep.com/sc/About-Us/About-Us.html', 'hong-kong'],
  ['https://www.hkapa.edu/tch/drama/study-with-us/admission', 'hong-kong'],
  ['https://www.ccm.gov.mo/gb/aboutus', 'macao'],
])('verified Hong Kong and Macau sources are eligible: %s', (url, region) => {
  expect(sourceRegion(url)).toBe(region)
})

test.each([
  'https://www.folger.edu/explore/shakespeares-works/',
  'https://www.rsc.org.uk/about-us/',
  'https://www.gutenberg.org/ebooks/2542',
  'https://web.arte.gov.tw/childrendrama/02.html',
  'https://github.com/Canoeliu917/DiaStage',
  'https://theatre.example.cn/',
  'https://www.chntheatre.edu.cn.attacker.invalid/',
  'https://evilchntheatre.edu.cn/',
  'https://chntheatre.edu.cn@attacker.invalid/',
  'https://user:password@www.chntheatre.edu.cn/',
  'https://www.chntheatre.edu.cn:8443/',
  'http://127.0.0.1/',
  'file:///www.chntheatre.edu.cn/',
  'javascript:alert(1)',
  'not a URL',
])('unknown, out-of-scope and misleading domains are rejected: %s', (url) => {
  expect(sourceRegion(url)).toBeNull()
})
