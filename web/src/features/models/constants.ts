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

import type { NameRule, ModelStatus, SyncSource } from './types'

// ============================================================================
// Pagination
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20

// ============================================================================
// Name Rule Options
// ============================================================================

export function getNameRuleOptions(t: TFunction) {
  return [
    { label: t('Exact Match'), value: 0 as NameRule },
    { label: t('Prefix Match'), value: 1 as NameRule },
    { label: t('Contains Match'), value: 2 as NameRule },
    { label: t('Suffix Match'), value: 3 as NameRule },
  ] as const
}

export function getNameRuleConfig(
  t: TFunction
): Record<NameRule, { label: string; color: string; description: string }> {
  return {
    0: {
      label: t('Exact'),
      color: 'green',
      description: t('Match model name exactly'),
    },
    1: {
      label: t('Prefix'),
      color: 'blue',
      description: t('Match models starting with this name'),
    },
    2: {
      label: t('Contains'),
      color: 'orange',
      description: t('Match models containing this name'),
    },
    3: {
      label: t('Suffix'),
      color: 'purple',
      description: t('Match models ending with this name'),
    },
  }
}

// ============================================================================
// Model Status
// ============================================================================

export function getModelStatusOptions(t: TFunction) {
  return [
    { label: t('All Status'), value: 'all' },
    { label: t('Shown'), value: 'enabled' },
    { label: t('Not shown'), value: 'disabled' },
  ] as const
}

export function getModelStatusConfig(
  t: TFunction
): Record<ModelStatus, { label: string; variant: 'success' | 'neutral' }> {
  return {
    1: { label: t('Shown'), variant: 'success' },
    0: { label: t('Not shown'), variant: 'neutral' },
  }
}

// ============================================================================
// Sync Status Options
// ============================================================================

export function getSyncStatusOptions(t: TFunction) {
  return [
    { label: t('All Sync Status'), value: 'all' },
    { label: t('Official Sync'), value: 'yes' },
    { label: t('No Sync'), value: 'no' },
  ] as const
}

// ============================================================================
// Deployment Status
// ============================================================================

export function getDeploymentStatusOptions(t: TFunction) {
  return [
    { label: t('All Status'), value: 'all' },
    { label: t('Running'), value: 'running' },
    { label: t('Completed'), value: 'completed' },
    { label: t('Failed'), value: 'failed' },
    { label: t('Deployment requested'), value: 'deployment requested' },
    { label: t('Termination requested'), value: 'termination requested' },
    { label: t('Destroyed'), value: 'destroyed' },
  ] as const
}

export function getDeploymentStatusConfig(t: TFunction): Record<
  string,
  {
    label: string
    variant: 'success' | 'neutral' | 'warning' | 'danger'
  }
> {
  return {
    running: { label: t('Running'), variant: 'success' },
    completed: { label: t('Completed'), variant: 'success' },
    failed: { label: t('Failed'), variant: 'danger' },
    error: { label: t('Failed'), variant: 'danger' },
    destroyed: { label: t('Destroyed'), variant: 'danger' },
    'deployment requested': {
      label: t('Deployment requested'),
      variant: 'warning',
    },
    'termination requested': {
      label: t('Termination requested'),
      variant: 'warning',
    },
  }
}

// ============================================================================
// Quota Type
// ============================================================================

export function getQuotaTypeConfig(
  t: TFunction
): Record<number, { label: string; color: string }> {
  return {
    0: { label: t('Usage-based'), color: 'violet' },
    1: { label: t('Per-call'), color: 'teal' },
  }
}

// ============================================================================
// Endpoint Templates
// ============================================================================

type EndpointConfig = { path: string; method: string }

const openAIImageEndpoints = {
  'image-generation': { path: '/v1/images/generations', method: 'POST' },
  'image-edits': { path: '/v1/images/edits', method: 'POST' },
}

const aliyunTtsEndpoints = {
  'aliyun-tts': {
    path: '/api/v1/services/audio/tts/SpeechSynthesizer',
    method: 'POST',
  },
  'aliyun-qwen-tts': {
    path: '/api/v1/services/aigc/multimodal-generation/generation',
    method: 'POST',
  },
  'aliyun-voice-customization': {
    path: '/api/v1/services/audio/tts/customization',
    method: 'POST',
  },
}

const aliyunImageEndpoints = {
  ...openAIImageEndpoints,
  'aliyun-image': {
    path: '/api/v1/services/aigc/multimodal-generation/generation',
    method: 'POST',
  },
  'aliyun-image-async': {
    path: '/api/v1/services/aigc/image-generation/generation',
    method: 'POST',
  },
  'aliyun-text-to-image': {
    path: '/api/v1/services/aigc/text2image/image-synthesis',
    method: 'POST',
  },
  'aliyun-image-to-image': {
    path: '/api/v1/services/aigc/image2image/image-synthesis',
    method: 'POST',
  },
  'aliyun-task': { path: '/api/v1/tasks/{task_id}', method: 'GET' },
}

export const ENDPOINT_TEMPLATES: Record<string, EndpointConfig> = {
  openai: { path: '/v1/chat/completions', method: 'POST' },
  'openai-response': { path: '/v1/responses', method: 'POST' },
  anthropic: { path: '/v1/messages', method: 'POST' },
  gemini: { path: '/v1beta/models/{model}:generateContent', method: 'POST' },
  'jina-rerank': { path: '/rerank', method: 'POST' },
  embeddings: { path: '/v1/embeddings', method: 'POST' },
  'openai-tts': { path: '/v1/audio/speech', method: 'POST' },
  'deepseek-tools-search': { path: '/v1/tools/search', method: 'POST' },
  'deepseek-tools-fetch': { path: '/v1/tools/fetch', method: 'POST' },
  ...aliyunTtsEndpoints,
  ...aliyunImageEndpoints,
  'aliyun-video': {
    path: '/api/v1/services/aigc/video-generation/video-synthesis',
    method: 'POST',
  },
  'aliyun-image-to-video': {
    path: '/api/v1/services/aigc/image2video/video-synthesis',
    method: 'POST',
  },
}

export const MODEL_ENDPOINT_PRESETS: Record<
  string,
  Record<string, EndpointConfig>
> = {
  ...Object.fromEntries(
    Object.entries(ENDPOINT_TEMPLATES).map(([key, endpoint]) => [
      key,
      { [key]: endpoint },
    ])
  ),
  'deepseek-websearch': {
    'deepseek-tools-search': ENDPOINT_TEMPLATES['deepseek-tools-search'],
  },
  'deepseek-fetch': {
    'deepseek-tools-fetch': ENDPOINT_TEMPLATES['deepseek-tools-fetch'],
  },
  'image-generation': openAIImageEndpoints,
  'aliyun-tts': {
    'openai-tts': ENDPOINT_TEMPLATES['openai-tts'],
    ...aliyunTtsEndpoints,
  },
  'aliyun-image': aliyunImageEndpoints,
  aliyun: {
    openai: ENDPOINT_TEMPLATES.openai,
    'openai-tts': ENDPOINT_TEMPLATES['openai-tts'],
    ...aliyunTtsEndpoints,
    ...aliyunImageEndpoints,
    'aliyun-video': ENDPOINT_TEMPLATES['aliyun-video'],
    'aliyun-image-to-video': ENDPOINT_TEMPLATES['aliyun-image-to-video'],
  },
}

// ============================================================================
// Sync Locale Options
// ============================================================================

export function getSyncLocaleOptions(t: TFunction) {
  return [
    { label: t('Chinese'), value: 'zh' },
    { label: t('English'), value: 'en' },
    { label: t('Japanese'), value: 'ja' },
  ] as const
}

export function getSyncSourceOptions(t: TFunction) {
  return [
    {
      label: t('Official Repository'),
      value: 'official' as SyncSource,
      description: t('Sync from the public upstream metadata repository.'),
      disabled: false,
    },
  ] as const
}
