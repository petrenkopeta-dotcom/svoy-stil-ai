import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import test from 'node:test'

const projectRoot = resolve(import.meta.dirname, '..')
const roots = ['index.html', 'src', 'public', 'dist']
const textExtensions = new Set(['.css', '.html', '.js', '.jsx', '.mjs', '.json', '.svg'])
const forbiddenFontRequest = /fonts\.(?:googleapis|gstatic)\.com|https?:\/\/[^\s"')]+\.(?:woff2?|ttf|otf)(?:[?#][^\s"')]*)?/i

function textFiles(path) {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return textExtensions.has(extname(path)) ? [path] : []
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name)
    return entry.isDirectory() ? textFiles(child) : textExtensions.has(extname(child)) ? [child] : []
  })
}

test('source and built UI contain no external font requests', () => {
  const violations = roots
    .flatMap((root) => textFiles(join(projectRoot, root)))
    .filter((file) => forbiddenFontRequest.test(readFileSync(file, 'utf8')))
    .map((file) => relative(projectRoot, file))

  assert.deepEqual(violations, [], `External font request found in: ${violations.join(', ')}`)
})
