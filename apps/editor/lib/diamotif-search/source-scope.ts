const sourceRegions = {
  'chncpa.org': 'mainland',
  'cntv.cn': 'mainland',
  'cctv.com': 'mainland',
  'zhongxi.cn': 'mainland',
  'sta.edu.cn': 'mainland',
  'nacta.edu.cn': 'mainland',
  'chntheatre.edu.cn': 'mainland',
  'smg.cn': 'mainland',
  'mct.gov.cn': 'mainland',
  'hznu.edu.cn': 'mainland',
  'tianhanfoundation.org': 'mainland',
  'bjeea.cn': 'mainland',
  'shmeea.edu.cn': 'mainland',
  'szeb.sz.gov.cn': 'mainland',
  'nrta.gov.cn': 'mainland',
  'beijing.gov.cn': 'mainland',
  'chinatheatre.org.cn': 'mainland',
  'wl.nanjing.gov.cn': 'mainland',
  'cntc.org.cn': 'mainland',
  'chinawriter.com.cn': 'mainland',
  'shlab.org.cn': 'mainland',
  'help.aliyun.com': 'mainland',
  'cucp.com.cn': 'mainland',
  'yixi.tv': 'mainland',
  'lmtw.com': 'mainland',
  'bjd.com.cn': 'mainland',
  'ctnews.com.cn': 'mainland',
  'tsinghua.edu.cn': 'mainland',
  'sdzk.cn': 'mainland',
  'sceea.cn': 'mainland',
  'zjzs.net': 'mainland',
  'hbea.edu.cn': 'mainland',
  'jseea.cn': 'mainland',
  'rsj.changzhi.gov.cn': 'mainland',
  'damai.cn': 'mainland',
  'bilibili.com': 'mainland',
  'douyin.com': 'mainland',
  'weibo.com': 'mainland',
  'mp.weixin.qq.com': 'mainland',
  'hkrep.com': 'hong-kong',
  'hkapa.edu': 'hong-kong',
  'lcsd.gov.hk': 'hong-kong',
  'ir.kuaishou.com': 'hong-kong',
  'ccm.gov.mo': 'macao',
  'must.edu.mo': 'macao',
  'dsedj.gov.mo': 'macao',
  // Platform hosts admit candidates; account identity and content region still need review.
  'xiaohongshu.com': 'mainland',
  'kuaishou.com': 'mainland',
  'channels.weixin.qq.com': 'mainland',
  'zhihu.com': 'mainland',
  'douban.com': 'mainland',
  'maoyan.com': 'mainland',
  'v.qq.com': 'mainland',
  'youku.com': 'mainland',
  'iqiyi.com': 'mainland',
  'mgtv.com': 'mainland',
  'yangshipin.cn': 'mainland',
  'xiaoyuzhoufm.com': 'mainland',
  'ximalaya.com': 'mainland',
} as const

export function sourceRegion(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
    return null
  const host = url.hostname.toLowerCase()
  for (const [domain, region] of Object.entries(sourceRegions))
    if (host === domain || host.endsWith(`.${domain}`)) return region
  return null
}
