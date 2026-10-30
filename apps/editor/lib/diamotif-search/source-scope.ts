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
  'hkrep.com': 'hong-kong',
  'hkapa.edu': 'hong-kong',
  'lcsd.gov.hk': 'hong-kong',
  'ccm.gov.mo': 'macao',
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
