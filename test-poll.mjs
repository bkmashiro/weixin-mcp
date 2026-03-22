import { pollMessages } from './dist/api.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const dir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts')
const files = fs.readdirSync(dir).filter(f => !f.endsWith('.sync.json'))
const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'))

console.log('Testing pollMessages...')
try {
  const result = await pollMessages(data.token, data.baseUrl, 3000)
  console.log('✅ Response:', JSON.stringify(result, null, 2).slice(0, 500))
} catch (e) {
  console.error('❌ Error:', e.message)
}
