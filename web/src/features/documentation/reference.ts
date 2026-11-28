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
import { lexer, type Tokens } from 'marked'

export type ApiReference = {
  body: string
  request: string
  response?: string
  method: string
  path: string
  auth?: string
  mediaType?: string
}

export function readApiReference(
  markdown: string,
  baseUrl: string
): ApiReference | undefined {
  const source = markdown.replaceAll(/\r\n?/g, '\n')
  const blocks = lexer(source).filter(
    (token): token is Tokens.Code => token.type === 'code'
  )
  const request = blocks.find(
    ({ lang, text }) =>
      /^(bash|sh|shell|curl)(?:\s|$)/i.test(lang ?? '') &&
      /^[ \t]*curl\b/m.test(text)
  )
  if (!request) return

  const command = request.text
    .slice(request.text.search(/^[ \t]*curl\b/m))
    .split(/\n[ \t]*\n/, 1)[0]
  const url = command.split('\n', 1)[0].match(/https?:\/\/[^\s'"\\]+/)?.[0]
  if (!url?.startsWith(`${baseUrl}/`)) return

  const auth = command.match(
    /(?:-H|--header)\s+['"]((?:Authorization|x-api-key|x-goog-api-key):[ \t]*(?:Bearer[ \t]+)?\$(?:NEW_API_KEY|API_KEY))(?=['"])/i
  )?.[1]
  const form = /(?:^|\s)(?:-F|--form)(?:\s|=)/.test(command)
  const headerMediaType = command.match(
    /(?:-H|--header)\s+['"]Content-Type:[ \t]*([^'"]+)['"]/i
  )?.[1]
  const explicitMethod = command.match(
    /(?:^|\s)(?:-X\s*|--request[ =]+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/
  )?.[1]
  const sendsBody =
    form ||
    /(?:^|\s)(?:-d|--data(?:-raw|-binary|-urlencode)?)(?:\s|=)/.test(command)
  const usesQuery = /(?:^|\s)(?:-G|--get)(?:\s|$)/.test(command)
  const method = explicitMethod ?? (sendsBody && !usesQuery ? 'POST' : 'GET')

  const response = blocks.find(({ lang }) => lang?.trim() === 'json response')
  // Preserve the rest of the Markdown, including link definitions outside tokens.
  const body = source.replace(request.raw, '\n\n')
  return {
    body: response ? body.replace(response.raw, '\n\n') : body,
    request: request.text,
    response: response?.text,
    method,
    path: url.slice(baseUrl.length),
    auth,
    mediaType: form ? 'multipart/form-data' : headerMediaType,
  }
}
