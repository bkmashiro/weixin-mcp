import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { downloadMedia } from '../dist/cdn.js';

const key = '0123456789abcdef'.repeat(2);
const param = 'synthetic+/=&? query-'.repeat(8);
const plaintext = Buffer.from('媒体\0\xff\nsynthetic payload');

function fixture(t, messages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weixin-media-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'fake.json'), JSON.stringify({ token: 'fake' }));
  const preload = path.join(dir, 'mock.mjs');
  fs.writeFileSync(preload, `
    import crypto from 'node:crypto';
    import assert from 'node:assert/strict';
    let polls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/getupdates')) {
        if (++polls > 1) process.exit(0);
        return new Response(JSON.stringify({ msgs: ${JSON.stringify(messages)}, get_updates_buf: 'next' }));
      }
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, 'https://novac2c.cdn.weixin.qq.com/c2c/download');
      assert.equal(parsed.searchParams.get('encrypted_query_param'), ${JSON.stringify(param)});
      assert.equal(options.method, 'GET');
      if (process.env.CDN_FAILURE) return new Response('failure', {status:503, headers:{'x-error-message':${JSON.stringify(key+param)}}});
      const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('${key}', 'hex'), null);
      let data = Buffer.concat([cipher.update(Buffer.from('${plaintext.toString('base64')}', 'base64')), cipher.final()]);
      if (process.env.CDN_CORRUPT) data = data.subarray(0, data.length - 1);
      return new Response(data);
    };
  `);
  return { dir, run(args, env = {}) {
    return spawnSync(process.execPath, ['--import', preload, 'dist/cli.js', ...args], {
      env: { ...process.env, WEIXIN_MCP_DIR: dir, WEIXIN_ACCOUNT_ID: 'fake', ...env }, encoding: 'utf8', timeout: 10000,
    });
  } };
}

for (const watch of [false, true]) {
  test(`poll${watch ? ' --watch' : ''} -> download preserves all media credentials without logging them`, t => {
    const items = [];
    for (const [type, field] of [[2,'image_item'], [4,'file_item'], [5,'video_item']]) {
      for (const encoding of ['hex', 'base64-hex', 'base64-raw']) {
        const media = { encrypt_query_param: param };
        const item = { media, file_name: 'test.bin' };
        if (encoding === 'hex') item.aeskey = key;
        else media.aes_key = Buffer.from(key, encoding === 'base64-raw' ? 'hex' : 'utf8').toString('base64');
        items.push({ type, [field]: item });
      }
    }
    const { dir, run } = fixture(t, [{ message_type: 1, from_user_id: 'synthetic', item_list: items }]);
    const polled = run(['poll', ...(watch ? ['--watch'] : [])]);
    assert.equal(polled.status, 0, polled.stderr);
    for (const secret of [key, param, param.slice(0,30), Buffer.from(key).toString('base64')]) {
      assert.ok(!(polled.stdout + polled.stderr).includes(secret));
    }
    const ids = [...polled.stdout.matchAll(/download --media-id ([a-f0-9]{32})/g)].map(m => m[1]);
    assert.equal(ids.length, 9);
    assert.equal(new Set(ids).size, 9);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'media-downloads')).mode & 0o777, 0o700);
    for (const id of ids) {
      const descriptor = path.join(dir, 'media-downloads', `${id}.json`);
      assert.deepEqual(JSON.parse(fs.readFileSync(descriptor)), { encryptQueryParam: param, aesKey: key });
      if (process.platform !== 'win32') assert.equal(fs.statSync(descriptor).mode & 0o777, 0o600);
      const output = path.join(dir, `${id}.bin`);
      const result = run(['download', '--media-id', id, '-o', output]);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(fs.readFileSync(output), plaintext);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'fake.cursor.json'))).cursor, 'next');
    const output = path.join(dir, 'legacy.bin');
    assert.equal(run(['download','-e',param,'-k',key,'-o',output]).status, 0);
    assert.deepEqual(fs.readFileSync(output), plaintext);
    for (const env of [{ CDN_FAILURE:'1' }, { CDN_CORRUPT:'1' }]) {
      fs.writeFileSync(output, 'unchanged');
      const result = run(['download','--media-id',ids[0],'-o',output], env);
      assert.notEqual(result.status, 0);
      assert.equal(fs.readFileSync(output,'utf8'), 'unchanged');
      assert.ok(!(result.stdout+result.stderr).includes(key));
      assert.ok(!(result.stdout+result.stderr).includes(param));
    }
    for (const args of [['--media-id','../fake'], ['--media-id','f'.repeat(32)], ['--media-id',ids[0],'-k',key]]) {
      assert.notEqual(run(['download',...args]).status, 0);
    }
  });
}

test('missing credentials and URL-only images do not leak URLs or create unusable IDs', t => {
  const { dir, run } = fixture(t, [{item_list:[
    {type:2,image_item:{url:'https://example.com/?secret=private'}},
    {type:4,file_item:{media:{encrypt_query_param:param}}},
    {type:5,video_item:{media:{encrypt_query_param:param},aeskey:'invalid'}}
  ]}]);
  const result = run(['poll']);
  assert.equal(result.status,0,result.stderr);
  assert.equal([...result.stdout.matchAll(/download unavailable/g)].length,3);
  assert.ok(!result.stdout.includes('private'));
  assert.ok(!fs.existsSync(path.join(dir,'media-downloads')));
});

test('reference persistence failure does not advance poll cursor', t => {
  const {dir,run} = fixture(t,[{item_list:[{type:2,image_item:{media:{encrypt_query_param:param},aeskey:key}}]}]);
  fs.writeFileSync(path.join(dir,'media-downloads'),'block directory creation');
  assert.notEqual(run(['poll']).status,0);
  assert.ok(!fs.existsSync(path.join(dir,'fake.cursor.json')));
});

test('invalid AES key is rejected before fetching', async t => {
  t.mock.method(globalThis,'fetch',async()=>assert.fail('must not fetch'));
  await assert.rejects(downloadMedia({encryptQueryParam:param,aesKey:'zz'.repeat(16)}), /Invalid media download parameters/);
});
