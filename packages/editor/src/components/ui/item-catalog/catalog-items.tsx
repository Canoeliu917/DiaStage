import type { AssetInput } from '@pascal-app/core'

export type CatalogItem = AssetInput & { tool?: string }

/** Built-in DiaStage props. Every asset is served locally with the application. */
export const CATALOG_ITEMS: CatalogItem[] = [
  {
    "id": "livingroom-chair",
    "category": "furniture",
    "name": "靠背椅",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/livingroom-chair/thumbnail.webp",
    "src": "/items/livingroom-chair/model.glb",
    "dimensions": [
      1.1,
      0.75,
      1.07
    ],
    "offset": [
      0,
      0.0001,
      0.0053
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
    "id": "column",
    "category": "scenery",
    "name": "柱体",
    "tags": [
      "scenery"
    ],
    "thumbnail": "/items/column/thumbnail.webp",
    "src": "/items/column/model.glb",
    "dimensions": [
      0.5,
      2.5,
      0.5
    ],
    "offset": [
      0,
      1.25,
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
    "id": "toy",
    "category": "props",
    "name": "玩具",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/toy/thumbnail.webp",
    "src": "/items/toy/model.glb",
    "dimensions": [
      0.29,
      0.49,
      0.34
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
    "id": "books",
    "category": "props",
    "name": "书籍",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/books/thumbnail.webp",
    "src": "/items/books/model.glb",
    "dimensions": [
      0.22,
      0.22,
      0.18
    ],
    "offset": [
      -0.0851,
      0.003,
      0.0209
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
    "id": "stool",
    "category": "furniture",
    "name": "凳子",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/stool/thumbnail.webp",
    "src": "/items/stool/model.glb",
    "dimensions": [
      0.52,
      1.16,
      0.55
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
    "id": "bookshelf",
    "category": "scenery",
    "name": "书架",
    "tags": [
      "scenery"
    ],
    "thumbnail": "/items/bookshelf/thumbnail.webp",
    "src": "/items/bookshelf/model.glb",
    "dimensions": [
      0.93,
      1.99,
      0.33
    ],
    "offset": [
      0,
      0,
      0.0032
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
    "id": "car-toy",
    "category": "props",
    "name": "玩具车",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/car-toy/thumbnail.webp",
    "src": "/items/car-toy/model.glb",
    "dimensions": [
      0.31,
      0.38,
      0.6
    ],
    "offset": [
      0.0005,
      0.0005,
      -0.0075
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
    "id": "office-table",
    "category": "furniture",
    "name": "书桌",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/office-table/thumbnail.webp",
    "src": "/items/office-table/model.glb",
    "dimensions": [
      1.51,
      0.76,
      0.62
    ],
    "offset": [
      -0.0001,
      0,
      -0.0052
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
    ],
    "surface": {
      "height": 0.75
    }
  },
  {
    "id": "dining-table",
    "category": "furniture",
    "name": "长桌",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/dining-table/thumbnail.webp",
    "src": "/items/dining-table/model.glb",
    "dimensions": [
      2.16,
      0.7,
      0.95
    ],
    "offset": [
      0,
      0,
      -0.0077
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
    ],
    "surface": {
      "height": 0.7
    }
  },
  {
    "id": "guitar",
    "category": "props",
    "name": "吉他",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/guitar/thumbnail.webp",
    "src": "/items/guitar/model.glb",
    "dimensions": [
      0.4,
      1.18,
      0.09
    ],
    "offset": [
      -0.0009,
      0.3197,
      -0.0129
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
    "id": "shelf",
    "category": "scenery",
    "name": "置物架",
    "tags": [
      "scenery"
    ],
    "thumbnail": "/items/shelf/thumbnail.webp",
    "src": "/items/shelf/model.glb",
    "dimensions": [
      0.74,
      0.04,
      0.32
    ],
    "offset": [
      0,
      0.02,
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
    ],
    "attachTo": "wall-side",
    "surface": {
      "height": 0.04
    }
  },
  {
    "id": "dining-chair",
    "category": "furniture",
    "name": "餐椅",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/dining-chair/thumbnail.webp",
    "src": "/items/dining-chair/model.glb",
    "dimensions": [
      0.47,
      0.87,
      0.5
    ],
    "offset": [
      0,
      0,
      0.0016
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
    "id": "easel",
    "category": "scenery",
    "name": "画架",
    "tags": [
      "scenery"
    ],
    "thumbnail": "/items/easel/thumbnail.webp",
    "src": "/items/easel/model.glb",
    "dimensions": [
      0.99,
      2.32,
      0.55
    ],
    "offset": [
      0,
      0.0402,
      0.0116
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
    "id": "piano",
    "category": "furniture",
    "name": "钢琴",
    "tags": [
      "furniture"
    ],
    "thumbnail": "/items/piano/thumbnail.webp",
    "src": "/items/piano/model.glb",
    "dimensions": [
      1.54,
      1.44,
      0.69
    ],
    "offset": [
      0,
      0,
      0.0162
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
    "id": "picture",
    "category": "props",
    "name": "装饰画",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/picture/thumbnail.webp",
    "src": "/items/picture/model.glb",
    "dimensions": [
      1.47,
      0.82,
      0.06
    ],
    "offset": [
      0,
      0.41,
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
    ],
    "attachTo": "wall-side"
  },
  {
    "id": "round-mirror",
    "category": "props",
    "name": "圆镜",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/round-mirror/thumbnail.webp",
    "src": "/items/round-mirror/model.glb",
    "dimensions": [
      0.57,
      0.57,
      0.05
    ],
    "offset": [
      0,
      0.2848,
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
    ],
    "attachTo": "wall-side"
  },
  {
    "id": "exit-sign",
    "category": "props",
    "name": "出口标志",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/exit-sign/thumbnail.webp",
    "src": "/items/exit-sign/model.glb",
    "dimensions": [
      0.54,
      0.27,
      0.1
    ],
    "offset": [
      0,
      0.0036,
      0.0452
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      0.6,
      0.5,
      0.7
    ],
    "attachTo": "wall-side"
  },
  {
    "id": "sewing-machine",
    "category": "props",
    "name": "缝纫机",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/sewing-machine/thumbnail.webp",
    "src": "/items/sewing-machine/model.glb",
    "dimensions": [
      0.83,
      0.68,
      0.32
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
    "id": "kettle",
    "category": "props",
    "name": "水壶",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/kettle/thumbnail.webp",
    "src": "/items/kettle/model.glb",
    "dimensions": [
      0.24,
      0.25,
      0.18
    ],
    "offset": [
      -0.026,
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
    "id": "cutting-board",
    "category": "props",
    "name": "砧板",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/cutting-board/thumbnail.webp",
    "src": "/items/cutting-board/model.glb",
    "dimensions": [
      0.27,
      0.07,
      0.41
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
    "id": "frying-pan",
    "category": "props",
    "name": "平底锅",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/frying-pan/thumbnail.webp",
    "src": "/items/frying-pan/model.glb",
    "dimensions": [
      0.36,
      0.09,
      0.64
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
    "id": "fruits",
    "category": "props",
    "name": "水果",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/fruits/thumbnail.webp",
    "src": "/items/fruits/model.glb",
    "dimensions": [
      0.39,
      0.27,
      0.39
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
    "id": "wine-bottle",
    "category": "props",
    "name": "酒瓶",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/wine-bottle/thumbnail.webp",
    "src": "/items/wine-bottle/model.glb",
    "dimensions": [
      0.38,
      0.35,
      0.17
    ],
    "offset": [
      -0.0461,
      0,
      0.0135
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
    "id": "ball",
    "category": "props",
    "name": "球",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/ball/thumbnail.webp",
    "src": "/items/ball/model.glb",
    "dimensions": [
      0.24,
      0.24,
      0.24
    ],
    "offset": [
      -0.0001,
      0.1194,
      -0.0001
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
    "id": "skate",
    "category": "props",
    "name": "滑板",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/skate/thumbnail.webp",
    "src": "/items/skate/model.glb",
    "dimensions": [
      0.86,
      0.11,
      0.2
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
    "id": "pillar",
    "category": "scenery",
    "name": "立柱",
    "tags": [
      "scenery"
    ],
    "thumbnail": "/items/pillar/thumbnail.webp",
    "src": "/items/pillar/model.glb",
    "dimensions": [
      0.34,
      1.26,
      0.3
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
    "id": "scooter",
    "category": "props",
    "name": "滑板车",
    "tags": [
      "props"
    ],
    "thumbnail": "/items/scooter/thumbnail.webp",
    "src": "/items/scooter/model.glb",
    "dimensions": [
      0.85,
      0.85,
      0.45
    ],
    "offset": [
      0.1127,
      0.0017,
      0.1744
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
