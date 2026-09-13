import type { AssetInput } from '@pascal-app/core'

export type CatalogItem = AssetInput & { tool?: string }

/** The 22 supplied stage models; normalization matches the source manifest. */
export const CATALOG_ITEMS: CatalogItem[] = [
  {
    "id": "SCN-FLAT-090",
    "name": "单帘景片",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-FLAT-090.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-FLAT-090.png",
    "tags": [
      "scenic-flat",
      "分隔",
      "遮挡",
      "出入口组织"
    ],
    "dimensions": [
      0.9,
      2.4,
      0.04
    ],
    "boundsCenter": [
      0,
      1.2,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-FOLD-02",
    "name": "二帘组合",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-FOLD-02.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-FOLD-02.png",
    "tags": [
      "scenic-flat",
      "围合",
      "遮挡",
      "改变通道"
    ],
    "dimensions": [
      0.92,
      2.4,
      0.92
    ],
    "boundsCenter": [
      0.46,
      1.2,
      -0.44
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-FOLD-03",
    "name": "三帘组合",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-FOLD-03.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-FOLD-03.png",
    "tags": [
      "scenic-flat",
      "围合",
      "遮挡",
      "改变通道"
    ],
    "dimensions": [
      0.92,
      2.4,
      0.9400000000000002
    ],
    "boundsCenter": [
      0.46,
      1.2,
      -0.45000000000000007
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-WIN-130",
    "name": "窗景片",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-WIN-130.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-WIN-130.png",
    "tags": [
      "window-flat",
      "视线联系",
      "窥视",
      "空间边界"
    ],
    "dimensions": [
      1.3,
      2.4,
      0.08200000000000002
    ],
    "boundsCenter": [
      0,
      1.2,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-WIN-160",
    "name": "落地窗景片",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-WIN-160.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-WIN-160.png",
    "tags": [
      "window-flat",
      "视线联系",
      "空间边界"
    ],
    "dimensions": [
      1.6,
      2.4000000000000004,
      0.08200000000000002
    ],
    "boundsCenter": [
      0,
      1.2000000000000002,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-DOOR-130",
    "name": "单门景片",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-DOOR-130.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-DOOR-130.png",
    "tags": [
      "door-flat",
      "进出",
      "阻挡",
      "开闭",
      "偷听"
    ],
    "dimensions": [
      1.3,
      2.4,
      0.48669697251359767
    ],
    "boundsCenter": [
      0,
      1.2,
      0.2023484862567988
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-DOOR-160",
    "name": "双门景片",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-DOOR-160.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-DOOR-160.png",
    "tags": [
      "door-flat",
      "进出",
      "阻挡",
      "开闭"
    ],
    "dimensions": [
      1.6,
      2.4,
      0.3675313281472389
    ],
    "boundsCenter": [
      0,
      1.2,
      0.14276566407361946
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-RISER-01",
    "name": "一号台块",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-RISER-01.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-RISER-01.png",
    "tags": [
      "platform",
      "高差",
      "组合平台",
      "占位"
    ],
    "dimensions": [
      1.8,
      0.15,
      0.9
    ],
    "boundsCenter": [
      0,
      0.075,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-RISER-02",
    "name": "二号台块",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-RISER-02.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-RISER-02.png",
    "tags": [
      "platform",
      "高差",
      "组合平台",
      "占位"
    ],
    "dimensions": [
      1.2,
      0.15,
      0.6
    ],
    "boundsCenter": [
      0,
      0.075,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-RISER-03",
    "name": "三号台块",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-RISER-03.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-RISER-03.png",
    "tags": [
      "platform",
      "高差",
      "组合平台",
      "占位"
    ],
    "dimensions": [
      0.9,
      0.15,
      0.6
    ],
    "boundsCenter": [
      0,
      0.075,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-TIMBER-060",
    "name": "枕木",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-TIMBER-060.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-TIMBER-060.png",
    "tags": [
      "neutral-block",
      "垫高",
      "组合支撑",
      "占位"
    ],
    "dimensions": [
      0.6,
      0.15,
      0.3
    ],
    "boundsCenter": [
      0,
      0.075,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-CUBE-045",
    "name": "方墩",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-CUBE-045.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-CUBE-045.png",
    "tags": [
      "neutral-block",
      "坐",
      "放置",
      "高差",
      "占位"
    ],
    "dimensions": [
      0.45,
      0.45,
      0.45
    ],
    "boundsCenter": [
      0,
      0.225,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-SOFA-175",
    "name": "长沙发",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-SOFA-175.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-SOFA-175.png",
    "tags": [
      "sofa",
      "坐",
      "并坐",
      "倚靠",
      "阻隔"
    ],
    "dimensions": [
      1.75,
      0.85,
      0.8
    ],
    "boundsCenter": [
      0,
      0.425,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-SOFA-090",
    "name": "短沙发",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-SOFA-090.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-SOFA-090.png",
    "tags": [
      "sofa",
      "坐",
      "倚靠",
      "阻隔"
    ],
    "dimensions": [
      0.9,
      0.85,
      0.8
    ],
    "boundsCenter": [
      0,
      0.425,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-DESK-120",
    "name": "三屉桌",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-DESK-120.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-DESK-120.png",
    "tags": [
      "table",
      "书写",
      "放置",
      "翻找",
      "隔桌对话"
    ],
    "dimensions": [
      1.2,
      0.75,
      0.55
    ],
    "boundsCenter": [
      0,
      0.375,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-DESK-095",
    "name": "二屉桌",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-DESK-095.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-DESK-095.png",
    "tags": [
      "table",
      "书写",
      "放置",
      "翻找",
      "隔桌对话"
    ],
    "dimensions": [
      0.95,
      0.75,
      0.55
    ],
    "boundsCenter": [
      0,
      0.375,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-TABLE-090",
    "name": "圆桌",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-TABLE-090.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-TABLE-090.png",
    "tags": [
      "round-table",
      "围坐",
      "放置",
      "隔桌对话"
    ],
    "dimensions": [
      0.9,
      0.75,
      0.9
    ],
    "boundsCenter": [
      0,
      0.375,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-TABLE-120",
    "name": "特殊桌",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-TABLE-120.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-TABLE-120.png",
    "tags": [
      "table",
      "放置",
      "操作台",
      "隔桌对话"
    ],
    "dimensions": [
      1.2,
      0.75,
      0.8
    ],
    "boundsCenter": [
      0,
      0.375,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-CHAIR-045",
    "name": "硬椅",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-CHAIR-045.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-CHAIR-045.png",
    "tags": [
      "chair",
      "坐",
      "转向",
      "搬动",
      "阻挡"
    ],
    "dimensions": [
      0.45,
      0.85,
      0.4
    ],
    "boundsCenter": [
      0,
      0.425,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-CHAIR-050",
    "name": "软椅",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-CHAIR-050.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-CHAIR-050.png",
    "tags": [
      "chair",
      "坐",
      "转向",
      "搬动"
    ],
    "dimensions": [
      0.5,
      0.85,
      0.5
    ],
    "boundsCenter": [
      0,
      0.425,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-BENCH-100",
    "name": "长凳",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-BENCH-100.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-BENCH-100.png",
    "tags": [
      "chair",
      "坐",
      "并坐",
      "搬动",
      "排列"
    ],
    "dimensions": [
      1,
      0.45,
      0.2
    ],
    "boundsCenter": [
      0,
      0.225,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  },
  {
    "id": "SCN-STOOL-035",
    "name": "板凳",
    "category": "scenery",
    "source": "library",
    "src": "/stage-library/models/SCN-STOOL-035.glb",
    "thumbnail": "/stage-library/thumbnails/256/SCN-STOOL-035.png",
    "tags": [
      "chair",
      "坐",
      "搬动",
      "放置"
    ],
    "dimensions": [
      0.35,
      0.42,
      0.25
    ],
    "boundsCenter": [
      0,
      0.21,
      0
    ],
    "offset": [
      0,
      0,
      0
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      1,
      1,
      1
    ]
  }
]
