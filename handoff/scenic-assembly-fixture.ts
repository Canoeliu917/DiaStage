import { writeFileSync } from 'node:fs'
import { ItemNode } from '@pascal-app/core'
import { AVAILABLE_STAGE_SCENERY } from '../apps/editor/lib/stage/prop-assets'
const base='http://127.0.0.1:4329'
const graph=(await (await fetch(`${base}/api/scenes/fcc2fff436ea`)).json()).graph
const removed=new Set(Object.values(graph.nodes).filter((n:any)=>n.type==='item').map((n:any)=>n.id))
for(const id of removed)delete graph.nodes[id as string]
for(const node of Object.values(graph.nodes) as any[]) if(node.children)node.children=node.children.filter((id:string)=>!removed.has(id))
const level=Object.values(graph.nodes).find((n:any)=>n.type==='level') as any
const specs=[['wall-a','SCN-FLAT-090',[-1.5,0,0],0],['wall-b','SCN-FLAT-090',[0,0,0],0],['wall-c','SCN-FLAT-090',[1.7,0,0],Math.PI/2],['wall-d','SCN-FLAT-090',[-2.8,0,0],Math.PI/2],['door','SCN-DOOR-130',[1.8,0,1.5],0],['bi','SCN-FOLD-02',[-1,0,-1.5],0],['tri','SCN-FOLD-03',[1.5,0,-1.5],0]] as const
const ids:Record<string,string>={}
for(const [name,assetId,position,yaw]of specs){const source=AVAILABLE_STAGE_SCENERY.find(e=>e.asset.id===assetId)!;const node=ItemNode.parse({name,parentId:level.id,position,rotation:[0,yaw,0],asset:source.asset,metadata:{stageKind:source.kind}});graph.nodes[node.id]=node;level.children.push(node.id);ids[name]=node.id}
writeFileSync('.local/scenic-fixture.json',JSON.stringify({graph,ids}))
