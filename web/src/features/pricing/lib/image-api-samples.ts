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
export type Lang = 'curl' | 'python' | 'typescript' | 'javascript'

export type SampleContext = {
  baseUrl: string
  apiKeyEnv: string
  modelName: string
  endpointType: string
  endpointPath: string
}

export function buildBailianImageSample(
  lang: Lang,
  ctx: SampleContext
): string {
  const polling = ctx.endpointType === 'aliyun-task'
  const async = ctx.endpointType === 'aliyun-image-async'
  const url =
    ctx.baseUrl + ctx.endpointPath.replace('{task_id}', 'YOUR_TASK_ID')
  const method = polling ? 'GET' : 'POST'
  const body = JSON.stringify({
    model: ctx.modelName,
    input: {
      messages: [
        {
          role: 'user',
          content: [{ text: 'A serene koi pond at sunset, ukiyo-e style.' }],
        },
      ],
    },
    parameters: { size: '1024*1024', n: 1 },
  })
  const headers = [
    ...(!polling ? [['Content-Type', 'application/json']] : []),
    ...(async ? [['X-DashScope-Async', 'enable']] : []),
  ]

  if (lang === 'curl') {
    return [
      `curl -X ${method} '${url}'`,
      `  -H "Authorization: Bearer $${ctx.apiKeyEnv}"`,
      ...headers.map(([key, value]) => `  -H '${key}: ${value}'`),
      ...(!polling ? [`  --data '${body}'`] : []),
    ].join(' \\\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      'import requests',
      '',
      'response = requests.request(',
      `    "${method}", ${JSON.stringify(url)},`,
      '    headers={',
      `        "Authorization": "Bearer " + os.environ["${ctx.apiKeyEnv}"],`,
      ...headers.map(([key, value]) => `        "${key}": "${value}",`),
      '    },',
      ...(!polling ? [`    json=${body},`] : []),
      ')',
      'response.raise_for_status()',
      'print(response.json())',
    ].join('\n')
  }
  return [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    `  method: '${method}',`,
    '  headers: {',
    `    Authorization: 'Bearer ' + process.env.${ctx.apiKeyEnv},`,
    ...headers.map(([key, value]) => `    '${key}': '${value}',`),
    '  },',
    ...(!polling ? [`  body: JSON.stringify(${body}),`] : []),
    '})',
    'if (!response.ok) throw new Error(await response.text())',
    'console.log(await response.json())',
  ].join('\n')
}

export function buildImageEditSample(lang: Lang, ctx: SampleContext): string {
  const url = ctx.baseUrl + ctx.endpointPath
  const prompt = 'Turn the reference image into a watercolor illustration.'
  if (lang === 'curl') {
    return [
      `curl '${url}'`,
      `  -H "Authorization: Bearer $${ctx.apiKeyEnv}"`,
      `  -F 'model=${ctx.modelName}'`,
      `  -F 'prompt=${prompt}'`,
      "  -F 'image=@reference.png'",
    ].join(' \\\n')
  }
  if (lang === 'python') {
    return [
      'import os',
      'import requests',
      '',
      'with open("reference.png", "rb") as image:',
      '    response = requests.post(',
      `        ${JSON.stringify(url)},`,
      `        headers={"Authorization": "Bearer " + os.environ["${ctx.apiKeyEnv}"]},`,
      `        data={"model": "${ctx.modelName}", "prompt": "${prompt}"},`,
      '        files={"image": ("reference.png", image, "image/png")},',
      '    )',
      'response.raise_for_status()',
      'print(response.json())',
    ].join('\n')
  }
  return [
    "import { readFile } from 'node:fs/promises'",
    '',
    'const form = new FormData()',
    `form.set('model', '${ctx.modelName}')`,
    `form.set('prompt', '${prompt}')`,
    "const image = await readFile('reference.png')",
    "form.set('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'reference.png')",
    '',
    `const response = await fetch(${JSON.stringify(url)}, {`,
    "  method: 'POST',",
    `  headers: { Authorization: 'Bearer ' + process.env.${ctx.apiKeyEnv} },`,
    '  body: form,',
    '})',
    'if (!response.ok) throw new Error(await response.text())',
    'console.log(await response.json())',
  ].join('\n')
}
