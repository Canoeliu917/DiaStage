import type { CatalogItem } from './catalog-items'

/**
 * The 21 standard performance props already shown with drama labels.
 * 布景 is scenic structure (景片-adjacent columns, shelf, fireplace).
 * 家具 is 桌, 椅, 沙发, and the stage-labeled bookshelf.
 * 舞台物件 is the hand-prop allowlist.
 * Definitions live here so excluded catalog entries are not shipped with the panel.
 */
const PERFORMANCE_PROP_CATEGORY = new Map<string, 'scenery' | 'furniture' | 'props'>([
  ['column', 'scenery'],
  ['pillar', 'scenery'],
  ['shelf', 'scenery'],
  ['fireplace-movn1fnn', 'scenery'],
  ['dining-table', 'furniture'],
  ['dining-table-mo9ms5yh', 'furniture'],
  ['coffee-table', 'furniture'],
  ['livingroom-chair', 'furniture'],
  ['dining-chair', 'furniture'],
  ['lounge-chair', 'furniture'],
  ['stool', 'furniture'],
  ['sofa', 'furniture'],
  ['my-leather-couch-modp80ha', 'furniture'],
  ['bookshelf', 'furniture'],
  ['books', 'props'],
  ['guitar', 'props'],
  ['piano', 'props'],
  ['easel', 'props'],
  ['picture', 'props'],
  ['round-mirror', 'props'],
  ['wine-bottle', 'props'],
])

const PERFORMANCE_PROP_SOURCE = [
  {
    "id": "column",
    "category": "furniture",
    "name": "柱体",
    "tags": [
      "column",
      "pillar",
      "pedestal",
      "plinth",
      "stand",
      "marble",
      "stone",
      "classical",
      "roman",
      "greek",
      "decorative",
      "architectural",
      "antique",
      "support",
      "base"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/column/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/column/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/column/floor-plan.png",
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
    "id": "pillar",
    "category": "outdoor",
    "name": "立柱",
    "tags": [
      "pillar",
      "column",
      "pedestal",
      "plinth",
      "stone",
      "concrete",
      "classical",
      "architectural",
      "garden",
      "ornament",
      "decoration",
      "support"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/pillar/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/pillar/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/pillar/floor-plan.png",
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
    "id": "shelf",
    "category": "furniture",
    "name": "置物架",
    "tags": [
      "shelf",
      "shelving",
      "rack",
      "ledge",
      "storage",
      "organization",
      "display",
      "bookshelf",
      "modern",
      "minimalist",
      "furniture",
      "decor",
      "contemporary"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/shelf/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/shelf/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/shelf/floor-plan.png",
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
    "id": "fireplace-movn1fnn",
    "category": "furniture",
    "name": "壁炉",
    "tags": [
      "fireplace",
      "hearth",
      "mantel",
      "wall"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/users/user_7hUFMrlrAX1vtIwT/fireplace-movn1fnn/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/users/user_7hUFMrlrAX1vtIwT/fireplace-movn1fnn/models/item_model_vNBpPC3gCrIIqFUS.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/users/user_7hUFMrlrAX1vtIwT/fireplace-movn1fnn/floor-plan.png",
    "dimensions": [
      1,
      0.83,
      0.18
    ],
    "offset": [
      -0.0001,
      0.4116,
      -0.0015
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
    "id": "dining-table",
    "category": "furniture",
    "name": "餐桌",
    "tags": [
      "table",
      "dining",
      "furniture",
      "wood",
      "modern",
      "minimalist",
      "kitchen",
      "eating",
      "surface",
      "contemporary",
      "gathering",
      "walnut"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table/floor-plan.png",
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
    "id": "dining-table-mo9ms5yh",
    "category": "furniture",
    "name": "餐桌",
    "tags": [
      "dining",
      "table",
      "dinette",
      "wood",
      "oak",
      "modern",
      "minimalist",
      "scandinavian",
      "rectangular",
      "kitchen",
      "mealtime",
      "entertaining"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table-mo9ms5yh/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table-mo9ms5yh/models/item_model_Sffq4hIGw8R3keLh.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-table-mo9ms5yh/floor-plan.png",
    "dimensions": [
      2,
      0.77,
      0.91
    ],
    "offset": [
      0.0002,
      0.3793,
      -0.0026
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      2,
      2,
      2
    ],
    "surface": {
      "height": 0.77
    }
  },
  {
    "id": "coffee-table",
    "category": "furniture",
    "name": "茶几",
    "tags": [
      "table",
      "cocktail",
      "wood",
      "modern",
      "minimalist",
      "furniture",
      "living",
      "lounge",
      "walnut",
      "metal",
      "glass",
      "surface",
      "decor"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/coffee-table/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/coffee-table/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/coffee-table/floor-plan.png",
    "dimensions": [
      1.72,
      0.3,
      1.04
    ],
    "offset": [
      0,
      0,
      0.0089
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
      "height": 0.3
    }
  },
  {
    "id": "livingroom-chair",
    "category": "furniture",
    "name": "客厅椅",
    "tags": [
      "chair",
      "armchair",
      "seating",
      "lounge",
      "upholstered",
      "modern",
      "fabric",
      "furniture",
      "minimalist",
      "comfort",
      "accent",
      "lounger"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/livingroom-chair/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/livingroom-chair/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/livingroom-chair/floor-plan.png",
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
    "id": "dining-chair",
    "category": "furniture",
    "name": "餐椅",
    "tags": [
      "chair",
      "seating",
      "dining",
      "furniture",
      "modern",
      "wood",
      "upholstered",
      "kitchen",
      "seat",
      "minimalist",
      "timber",
      "bistro"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-chair/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-chair/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/dining-chair/floor-plan.png",
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
    "id": "lounge-chair",
    "category": "furniture",
    "name": "休闲椅",
    "tags": [
      "chair",
      "armchair",
      "seating",
      "lounge",
      "seat",
      "modern",
      "contemporary",
      "minimalist",
      "comfort",
      "relaxation",
      "upholstered",
      "interior",
      "furniture"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/lounge-chair/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/lounge-chair/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/lounge-chair/floor-plan.png",
    "dimensions": [
      0.68,
      1.03,
      1.26
    ],
    "offset": [
      0,
      0.0034,
      0.0894
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
      "floor",
      "seating"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/stool/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/stool/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/stool/floor-plan.png",
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
    "id": "sofa",
    "category": "furniture",
    "name": "沙发",
    "tags": [
      "floor",
      "seating"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/sofa/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/sofa/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/sofa/floor-plan.png",
    "dimensions": [
      2.06,
      0.74,
      1.01
    ],
    "offset": [
      -0.0023,
      0.009,
      0.0459
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
    "id": "my-leather-couch-modp80ha",
    "category": "furniture",
    "name": "皮沙发",
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/my-leather-couch-modp80ha/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/my-leather-couch-modp80ha/models/item_model_kgORhH5vwFK8xub0.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/my-leather-couch-modp80ha/floor-plan.png",
    "dimensions": [
      2,
      0.67,
      0.61
    ],
    "offset": [
      -0.0005,
      0.3228,
      -0.004
    ],
    "rotation": [
      0,
      0,
      0
    ],
    "scale": [
      2,
      2,
      2
    ]
  },
  {
    "id": "bookshelf",
    "category": "furniture",
    "name": "书架",
    "tags": [
      "bookshelf",
      "bookcase",
      "shelving",
      "storage",
      "organizer",
      "modern",
      "minimalist",
      "wood",
      "metal",
      "industrial",
      "library",
      "office",
      "furniture",
      "display",
      "timber"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/bookshelf/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/bookshelf/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/bookshelf/floor-plan.png",
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
    "id": "books",
    "category": "furniture",
    "name": "书籍",
    "tags": [
      "books",
      "novels",
      "literature",
      "reading",
      "vintage",
      "classic",
      "decorative",
      "paper",
      "leather",
      "library",
      "study",
      "office",
      "decor",
      "shelf",
      "antique"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/books/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/books/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/books/floor-plan.png",
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
    "id": "guitar",
    "category": "furniture",
    "name": "吉他",
    "tags": [
      "guitar",
      "instrument",
      "musical",
      "wood",
      "acoustic",
      "vintage",
      "classic",
      "decor",
      "mahogany",
      "string",
      "art",
      "hobby"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/guitar/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/guitar/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/guitar/floor-plan.png",
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
    "id": "piano",
    "category": "furniture",
    "name": "钢琴",
    "tags": [
      "piano",
      "instrument",
      "musical",
      "grand",
      "upright",
      "keyboard",
      "wood",
      "polished",
      "lacquer",
      "ebony",
      "classic",
      "traditional",
      "music",
      "entertainment",
      "luxury"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/piano/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/piano/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/piano/floor-plan.png",
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
    "id": "easel",
    "category": "furniture",
    "name": "画架",
    "tags": [
      "easel",
      "stand",
      "tripod",
      "art",
      "studio",
      "wood",
      "display",
      "canvas",
      "atelier",
      "presentation",
      "wooden",
      "sketching",
      "painting",
      "decor"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/easel/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/easel/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/easel/floor-plan.png",
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
    "id": "picture",
    "category": "furniture",
    "name": "装饰画",
    "tags": [
      "picture",
      "frame",
      "art",
      "artwork",
      "print",
      "canvas",
      "decor",
      "modern",
      "abstract",
      "minimalist",
      "decorative",
      "glass",
      "wood",
      "illustration",
      "portrait"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/picture/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/picture/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/picture/floor-plan.png",
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
    "category": "furniture",
    "name": "圆镜",
    "tags": [
      "mirror",
      "glass",
      "reflective",
      "circular",
      "oval",
      "modern",
      "minimalist",
      "contemporary",
      "scandinavian",
      "vanity",
      "decor",
      "curved",
      "reflection",
      "grooming"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/round-mirror/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/round-mirror/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/round-mirror/floor-plan.png",
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
    "id": "wine-bottle",
    "category": "kitchen",
    "name": "酒瓶",
    "tags": [
      "countertop",
      "decor"
    ],
    "thumbnail": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/wine-bottle/thumbnail.png",
    "src": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/wine-bottle/model.glb",
    "floorPlanUrl": "https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/items/system/wine-bottle/floor-plan.png",
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
  }
] as CatalogItem[]

export const THEATRE_PERFORMANCE_PROP_IDS = [...PERFORMANCE_PROP_CATEGORY.keys()]

export function theatreCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return items.flatMap((item) => {
    const category = PERFORMANCE_PROP_CATEGORY.get(item.id)
    if (!category || (item.tool && item.tool !== 'item')) return []
    return [{
      ...item,
      category,
      tags: [category],
      name: item.id === 'livingroom-chair' ? '靠背椅' : item.name,
    }]
  })
}

export const THEATRE_CATALOG_ITEMS = theatreCatalogItems(PERFORMANCE_PROP_SOURCE)
