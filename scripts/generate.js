import fs from 'node:fs/promises'
import path from 'node:path'

import {load} from 'cheerio'
import {udhr} from 'udhr'
import YAML from 'yaml'

const root = new URL('..', import.meta.url)
const outputDirectory = new URL('declarations/', root)
const udhrPackageUrl = import.meta.resolve('udhr')

await fs.rm(outputDirectory, {force: true, recursive: true})
await fs.mkdir(outputDirectory, {recursive: true})

let written = 0

for (const info of udhr) {
  const sourcePath = `declaration/${info.code}.html`
  const sourceUrl = new URL(sourcePath, udhrPackageUrl)
  const html = await fs.readFile(sourceUrl, 'utf8')
  const $ = load(html, {decodeEntities: false})
  const articleNumbers = $('article')
    .map((_, element) => Number($(element).attr('data-number')))
    .get()
    .filter((number) => Number.isInteger(number))
  const missingArticles = []

  for (let number = 1; number <= 30; number++) {
    if (!articleNumbers.includes(number)) missingArticles.push(number)
  }

  const frontmatter = {
    code: info.code,
    name: info.name,
    title: text($, $('body > h1').first()) || null,
    bcp47: info.bcp47,
    iso6393: info.iso6393,
    direction: info.direction,
    stage: info.stage,
    latitude: info.latitude,
    longitude: info.longitude,
    article_count: articleNumbers.length,
    complete: articleNumbers.length === 30 && missingArticles.length === 0,
    source: {
      package: 'udhr',
      version: '6.0.0',
      path: sourcePath
    }
  }

  if (info.ohchr) frontmatter.ohchr = info.ohchr
  if (missingArticles.length > 0) frontmatter.missing_articles = missingArticles

  const markdown = [
    '---',
    YAML.stringify(frontmatter).trimEnd(),
    '---',
    '',
    renderChildren($, $('body').first()).trimEnd(),
    ''
  ].join('\n')

  const filename = `${info.code}${frontmatter.complete ? '' : '-partial'}.md`

  await fs.writeFile(new URL(filename, outputDirectory), markdown)
  written++
}

console.log(`Wrote ${written} Markdown files to ${path.relative(process.cwd(), outputDirectory.pathname)}`)

/**
 * @param {ReturnType<typeof load>} $
 * @param {import('cheerio').Cheerio<unknown>} parent
 * @returns {string}
 */
function renderChildren($, parent) {
  return parent
    .children()
    .map((_, child) => renderElement($, $(child)))
    .get()
    .filter(Boolean)
    .join('\n\n')
}

/**
 * @param {ReturnType<typeof load>} $
 * @param {import('cheerio').Cheerio<unknown>} element
 * @returns {string}
 */
function renderElement($, element) {
  const tagName = element.prop('tagName')?.toLowerCase()

  if (tagName === 'h1') return `# ${text($, element)}`
  if (tagName === 'h2') return `## ${text($, element)}`
  if (tagName === 'p') return text($, element)
  if (tagName === 'header' || tagName === 'article') return renderChildren($, element)
  if (tagName === 'ol') return renderOrderedList($, element)

  return ''
}

/**
 * @param {ReturnType<typeof load>} $
 * @param {import('cheerio').Cheerio<unknown>} element
 * @returns {string}
 */
function renderOrderedList($, element) {
  return element
    .children('li')
    .map((index, child) => {
      const rendered = renderChildren($, $(child)).trim()
      const lines = rendered.split('\n')
      const [first = '', ...rest] = lines
      const continuation = rest.map((line) => (line ? `   ${line}` : '')).join('\n')

      return [`${index + 1}. ${first}`, continuation].filter(Boolean).join('\n')
    })
    .get()
    .join('\n')
}

/**
 * @param {ReturnType<typeof load>} $
 * @param {import('cheerio').Cheerio<unknown>} element
 * @returns {string}
 */
function text($, element) {
  return element.text().replace(/\s+/g, ' ').trim()
}
