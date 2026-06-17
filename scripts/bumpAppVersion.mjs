import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function pad(value) {
  return String(value).padStart(2, '0')
}

function buildVersion() {
  const now = new Date()
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
}

function replaceInFile(filePath, replacements) {
  let content = readFileSync(filePath, 'utf8')

  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement)
  }

  writeFileSync(filePath, content, 'utf8')
}

const version = buildVersion()
const root = process.cwd()

replaceInFile(resolve(root, 'public', 'Component.js'), [
  [/var sAppVersion = "[^"]+";/, `var sAppVersion = "${version}";`]
])

replaceInFile(resolve(root, 'src', 'main.tsx'), [
  [/version: '[^']+',/, `version: '${version}',`]
])

console.log(`App version bumped to ${version}`)
