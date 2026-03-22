import { getContacts } from './dist/api.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts')
const files = fs.readdirSync(dir).filter(f => !f.endsWith('.sync.json'))
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'))

console.log('Testing with account:', files[0])
console.log('Token prefix:', data.token?.slice(0, 15) + '...')

try {
  const result = await getContacts(data.token, data.baseUrl)
  console.log('✅ getContacts response:')
  console.log(JSON.stringify(result, null, 2).slice(0, 1000))
} catch (e) {
  console.error('❌ Error:', e.message)
}
