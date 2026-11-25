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
import { describe, expect, it } from 'vitest'

import {
  buildBailianImageSample,
  buildImageEditSample,
  type Lang,
} from '../lib/image-api-samples'

const context = {
  baseUrl: 'https://gateway.example',
  apiKeyEnv: 'NEW_API_KEY',
  modelName: 'qwen-image-3.0-pro',
}

describe('Bailian image API samples', () => {
  it.each<Lang>(['curl', 'python', 'typescript', 'javascript'])(
    'uses the DashScope image payload and only sets the async header on submissions that require it (%s)',
    (lang) => {
      const sync = buildBailianImageSample(lang, {
        ...context,
        endpointType: 'aliyun-image',
        endpointPath: '/api/v1/services/aigc/multimodal-generation/generation',
      })
      const async = buildBailianImageSample(lang, {
        ...context,
        endpointType: 'aliyun-image-async',
        endpointPath: '/api/v1/services/aigc/image-generation/generation',
      })

      expect(sync).toContain('/multimodal-generation/generation')
      expect(sync).toContain('"messages":')
      expect(sync).not.toContain('X-DashScope-Async')
      expect(async).toContain('/image-generation/generation')
      expect(async).toContain('X-DashScope-Async')
      expect(async).toContain('"messages":')
    }
  )

  it.each<Lang>(['curl', 'python', 'typescript', 'javascript'])(
    'queries the gateway task ID using GET without a body (%s)',
    (lang) => {
      const sample = buildBailianImageSample(lang, {
        ...context,
        endpointType: 'aliyun-task',
        endpointPath: '/api/v1/tasks/{task_id}',
      })

      expect(sample).toContain('/api/v1/tasks/YOUR_TASK_ID')
      expect(sample).toContain('GET')
      expect(sample).not.toContain('qwen-image')
      expect(sample).not.toContain('X-DashScope-Async')
    }
  )
})

describe('OpenAI image edit samples', () => {
  it.each<Lang>(['curl', 'python', 'typescript', 'javascript'])(
    'uploads a reference image using multipart form data (%s)',
    (lang) => {
      const sample = buildImageEditSample(lang, {
        ...context,
        endpointType: 'image-edits',
        endpointPath: '/v1/images/edits',
      })

      expect(sample).toContain('/v1/images/edits')
      expect(sample).toContain('reference.png')
      expect(sample).not.toContain('application/json')
    }
  )
})
