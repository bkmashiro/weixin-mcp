import { getUpdates, loadCursor, saveCursor } from './dist/api.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts')
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.sync.json') && !f.endsWith('.cursor.json'))
const accountId = files[0].replace('.json', '')
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'))

console.log('Account:', accountId)
const cursor = loadCursor(accountId)
console.log('Cursor:', cursor ? cursor.slice(0, 20) + '...' : '(empty — first poll)')

const resp = await getUpdates(data.token, data.baseUrl, cursor)
console.log('ret:', resp.ret, '| msgs count:', resp.msgs?.length ?? 0)

if (resp.get_updates_buf) {
  saveCursor(accountId, resp.get_updates_buf)
  console.log('✅ Cursor saved')
}

if (resp.msgs?.length > 0) {
  const m = resp.msgs[0]
  console.log('\nFirst message:')
  console.log('  from:', m.from_user_id)
  console.log('  type:', m.message_type, '| state:', m.message_state)
  const text = m.item_list?.find(i => i.type === 1)?.text_item?.text
  if (text) console.log('  text:', text.slice(0, 100))
  console.log('  context_token:', m.context_token ? m.context_token.slice(0, 30) + '...' : '(none)')
}
