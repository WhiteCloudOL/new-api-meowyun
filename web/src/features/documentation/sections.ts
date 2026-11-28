/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'

export type DocSection = {
  id: string
  title: string
  parentId?: string
}

const defaults = [
  ['quick-start', 'footer.columns.docs.links.quickStart', ''],
  ['openai', 'OpenAI Chat Completions', ''],
  ['openai-responses', 'Responses', 'openai'],
  ['openai-images', 'Image Generation', 'openai'],
  ['openai-image-edits', 'Image editing', 'openai-images'],
  ['openai-speech', 'Speech synthesis', 'openai'],
  ['openai-models', 'Models and embeddings', 'openai'],
  ['openai-audio-input', 'Audio transcription and translation', 'openai'],
  ['openai-videos', 'Video generation', 'openai'],
  ['anthropic', 'Anthropic Messages', ''],
  ['gemini', 'Gemini native API', ''],
  ['dashscope', 'DashScope native API', ''],
  ['dashscope-async', 'Asynchronous image jobs', 'dashscope'],
  ['dashscope-speech', 'Native speech synthesis', 'dashscope'],
  ['breeze', 'BreezeTTS native form', ''],
  ['deepseek', 'DeepSeek web tools', ''],
  ['troubleshooting', 'Troubleshooting', ''],
] as const

export const defaultDocSections: DocSection[] = defaults.map(
  ([id, , parentId]) => ({ id, title: '', parentId })
)

const defaultTitles: ReadonlyMap<string, string> = new Map(
  defaults.map(([id, title]) => [id, title])
)

export function getDocTitle(section: DocSection, t: TFunction) {
  return section.title.trim() || t(defaultTitles.get(section.id) ?? section.id)
}

const groupTitles: ReadonlyMap<string, string> = new Map([
  ['openai', 'OpenAI'],
  ['openai-images', 'Image'],
  ['dashscope', 'DashScope native API'],
])

export function isDocPage(section: DocSection, sections: DocSection[]) {
  return (
    defaultTitles.has(section.id) ||
    !sections.some(({ parentId }) => parentId === section.id)
  )
}

export type DocNavigationSection = {
  id: string
  title: string
  children?: DocNavigationSection[]
}

export function getDocNavigation(sections: DocSection[], t: TFunction) {
  const childrenByParent = new Map<string, DocSection[]>()
  for (const section of sections) {
    const parent = section.parentId || ''
    const children = childrenByParent.get(parent) ?? []
    children.push(section)
    childrenByParent.set(parent, children)
  }

  function branches(parent: string, depth: number): DocNavigationSection[] {
    if (depth > 3) return []
    return (childrenByParent.get(parent) ?? []).flatMap((section) => {
      const page = { id: section.id, title: getDocTitle(section, t) }
      const children = branches(section.id, depth + 1)
      if (children.length === 0) return [page]
      const groupTitle = groupTitles.get(section.id)
      if (isDocPage(section, sections)) {
        children.unshift({
          ...page,
          title:
            section.id === 'dashscope' && !section.title.trim()
              ? t('Image Generation')
              : page.title,
        })
      }
      if (children.length === 1) return children
      return [
        { ...page, title: groupTitle ? t(groupTitle) : page.title, children },
      ]
    })
  }

  return branches('', 1)
}

export function getDocFolderTrail(
  sections: DocNavigationSection[],
  page: string
): DocNavigationSection[] | undefined {
  for (const section of sections) {
    if (!section.children && section.id === page) return []
    if (!section.children) continue
    const trail = getDocFolderTrail(section.children, page)
    if (trail) return [section, ...trail]
  }
}

export function orderedDocSections(sections: DocSection[]) {
  const rows: { section: DocSection; depth: number }[] = []
  const byParent = new Map<string, DocSection[]>()
  for (const section of sections) {
    const parent = section.parentId || ''
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)?.push(section)
  }

  function visit(parent: string, depth: number) {
    if (depth > 3) return
    for (const section of byParent.get(parent) ?? []) {
      rows.push({ section, depth })
      visit(section.id, depth + 1)
    }
  }

  visit('', 1)
  return rows
}

export function validDocSlug(id: string) {
  return id.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
}

export function validDocSections(sections: DocSection[]) {
  return (
    sections.length > 0 &&
    sections.length <= 64 &&
    new Set(sections.map((section) => section.id)).size === sections.length &&
    sections.every(
      ({ id, title }) =>
        validDocSlug(id) &&
        (!!title.trim() || defaultTitles.has(id)) &&
        [...title.trim()].length <= 96
    ) &&
    orderedDocSections(sections).length === sections.length
  )
}

export const docSectionOption = (id: string) => `DocsSection:${id}`
