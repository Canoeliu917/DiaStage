import assert from 'node:assert/strict'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=resolve(import.meta.dir,'..')
const backup=resolve(root,'.local/backups/2026-09-14T07-52-46-112Z')
const protectedIds=['8537cf7594fb','fcc2fff436ea','71de52238204']
const temporaryIds=['stage-interaction-qa-1789373241220','stage-interaction-qa-1789373609742','stage-interaction-qa-1789373996665']
const before=JSON.parse(readFileSync(resolve(backup,'scenes.json'),'utf8'))
const db=new Database(resolve(root,'.local/handoff-20260913/pascal.db'),{readonly:true})
const rows=()=>db.query('SELECT * FROM scenes ORDER BY id').all() as {id:string}[]
const revisions=()=>db.query('SELECT * FROM scene_revisions ORDER BY scene_id, version').all() as {scene_id:string}[]
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const archive={scenes:rows().filter(s=>temporaryIds.includes(s.id)),revisions:revisions().filter(r=>temporaryIds.includes(r.scene_id))}
writeFileSync(resolve(root,'.local/stage-interaction-retired-fixtures.json'),JSON.stringify(archive))
for(const id of temporaryIds){
  assert.ok(!protectedIds.includes(id))
  const response=await fetch(`http://127.0.0.1:4329/api/scenes/${id}`,{method:'DELETE',headers:{Origin:'http://127.0.0.1:4329'}})
  assert.ok(response.status===204 || response.status===404,`${id}: ${response.status}`)
}
const after=rows()
const comparison=protectedIds.map(id=>({id,before:hash(before.find((s:{id:string})=>s.id===id)),after:hash(after.find(s=>s.id===id))}))
assert.ok(comparison.every(s=>s.before===s.after),'Protected scene rows changed')
const priorRevisions=readFileSync(resolve(backup,'revisions.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line))
const currentRevisions=revisions().filter(r=>protectedIds.includes(r.scene_id))
assert.equal(hash(priorRevisions),hash(currentRevisions),'Protected history changed')
const integrity=db.query('PRAGMA integrity_check').all()
assert.deepEqual(integrity,[{integrity_check:'ok'}])
const result={scenes:after.length,revisions:revisions().length,comparison,historyHash:hash(currentRevisions),integrity,temporaryIdsRetired:temporaryIds,fixtureArchiveHash:hash(archive)}
writeFileSync(resolve(root,'.local/stage-interaction-data-check.json'),JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
db.close()
