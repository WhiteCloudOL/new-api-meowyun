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
import { queryOptions } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  defaultDocSections,
  validDocSections,
  type DocSection,
} from './sections'
import anthropicEn from './starter/en/anthropic.md?raw'
import breezeEn from './starter/en/breeze.md?raw'
import dashscopeAsyncEn from './starter/en/dashscope-async.md?raw'
import dashscopeSpeechEn from './starter/en/dashscope-speech.md?raw'
import dashscopeEn from './starter/en/dashscope.md?raw'
import deepseekEn from './starter/en/deepseek.md?raw'
import geminiEn from './starter/en/gemini.md?raw'
import openaiAudioInputEn from './starter/en/openai-audio-input.md?raw'
import openaiImageEditsEn from './starter/en/openai-image-edits.md?raw'
import openaiImagesEn from './starter/en/openai-images.md?raw'
import openaiModelsEn from './starter/en/openai-models.md?raw'
import openaiResponsesEn from './starter/en/openai-responses.md?raw'
import openaiSpeechEn from './starter/en/openai-speech.md?raw'
import openaiVideosEn from './starter/en/openai-videos.md?raw'
import openaiEn from './starter/en/openai.md?raw'
import quickStartEn from './starter/en/quick-start.md?raw'
import troubleshootingEn from './starter/en/troubleshooting.md?raw'
import anthropicZh from './starter/zh/anthropic.md?raw'
import breezeZh from './starter/zh/breeze.md?raw'
import dashscopeAsyncZh from './starter/zh/dashscope-async.md?raw'
import dashscopeSpeechZh from './starter/zh/dashscope-speech.md?raw'
import dashscopeZh from './starter/zh/dashscope.md?raw'
import deepseekZh from './starter/zh/deepseek.md?raw'
import geminiZh from './starter/zh/gemini.md?raw'
import openaiAudioInputZh from './starter/zh/openai-audio-input.md?raw'
import openaiImageEditsZh from './starter/zh/openai-image-edits.md?raw'
import openaiImagesZh from './starter/zh/openai-images.md?raw'
import openaiModelsZh from './starter/zh/openai-models.md?raw'
import openaiResponsesZh from './starter/zh/openai-responses.md?raw'
import openaiSpeechZh from './starter/zh/openai-speech.md?raw'
import openaiVideosZh from './starter/zh/openai-videos.md?raw'
import openaiZh from './starter/zh/openai.md?raw'
import quickStartZh from './starter/zh/quick-start.md?raw'
import troubleshootingZh from './starter/zh/troubleshooting.md?raw'

const starter = new Map<string, readonly [string, string]>([
  ['quick-start', [quickStartEn, quickStartZh]],
  ['openai', [openaiEn, openaiZh]],
  ['openai-responses', [openaiResponsesEn, openaiResponsesZh]],
  ['openai-images', [openaiImagesEn, openaiImagesZh]],
  ['openai-image-edits', [openaiImageEditsEn, openaiImageEditsZh]],
  ['openai-speech', [openaiSpeechEn, openaiSpeechZh]],
  ['openai-models', [openaiModelsEn, openaiModelsZh]],
  ['openai-audio-input', [openaiAudioInputEn, openaiAudioInputZh]],
  ['openai-videos', [openaiVideosEn, openaiVideosZh]],
  ['anthropic', [anthropicEn, anthropicZh]],
  ['gemini', [geminiEn, geminiZh]],
  ['dashscope', [dashscopeEn, dashscopeZh]],
  ['dashscope-async', [dashscopeAsyncEn, dashscopeAsyncZh]],
  ['dashscope-speech', [dashscopeSpeechEn, dashscopeSpeechZh]],
  ['breeze', [breezeEn, breezeZh]],
  ['deepseek', [deepseekEn, deepseekZh]],
  ['troubleshooting', [troubleshootingEn, troubleshootingZh]],
])

export function getDefaultDocumentation(id: string, language: string): string {
  return (
    starter.get(id)?.[language.toLowerCase().startsWith('zh') ? 1 : 0] ?? ''
  )
}

export function resolveDocumentation(
  id: string,
  markdown: string | undefined,
  language: string,
  baseUrl: string
): string {
  const source = markdown?.trim()
    ? markdown
    : getDefaultDocumentation(id, language)
  return source.replaceAll('{{API_BASE}}', () => baseUrl)
}

async function getDocumentationOption(path: string): Promise<string> {
  const response = await api.get<{ success: boolean; data: string }>(path, {
    headers: { 'Cache-Control': null },
  })
  return requireServerSuccess(response.data).data
}

export const documentationSectionsQuery = queryOptions({
  queryKey: ['documentation-sections'],
  queryFn: async () => {
    const raw = await getDocumentationOption('/api/docs')
    if (!raw) return defaultDocSections
    const sections: DocSection[] = JSON.parse(raw)
    return validDocSections(sections) ? sections : defaultDocSections
  },
})

export const documentationQuery = (id: string) =>
  queryOptions({
    queryKey: ['documentation-content', id],
    queryFn: () =>
      getDocumentationOption(`/api/docs/${encodeURIComponent(id)}`),
  })
