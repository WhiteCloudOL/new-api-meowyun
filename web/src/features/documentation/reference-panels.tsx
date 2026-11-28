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
import { useTranslation } from 'react-i18next'

import { CodeBlockFrame } from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'

import type { ApiReference } from './reference'

export function ApiEndpoint({ reference }: { reference: ApiReference }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('Endpoint')}
      className='border-border bg-card/65 rounded-lg border'
    >
      <div className='flex min-w-0 flex-wrap items-center gap-2.5 px-4 py-3.5'>
        <Badge
          variant='secondary'
          className='bg-primary/10 text-primary rounded-md font-mono font-semibold'
        >
          {reference.method}
        </Badge>
        <code className='min-w-0 text-sm font-medium break-all' dir='ltr'>
          {reference.path}
        </code>
      </div>
      {(reference.auth || reference.mediaType) && (
        <dl className='border-border divide-border text-muted-foreground divide-y border-t text-xs'>
          {reference.auth && (
            <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5'>
              <dt>{t('Authentication')}</dt>
              <dd
                className='text-foreground min-w-0 font-mono break-all'
                dir='ltr'
              >
                {reference.auth}
              </dd>
            </div>
          )}
          {reference.mediaType && (
            <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5'>
              <dt>{t('Request body')}</dt>
              <dd
                className='text-foreground min-w-0 font-mono break-all'
                dir='ltr'
              >
                {reference.mediaType}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}

function Example(props: { title: string; language: string; value: string }) {
  const { t } = useTranslation()
  return (
    <CodeBlockFrame
      className='my-0 shadow-none'
      showToolbar
      title={
        <span className='flex flex-wrap items-center gap-x-2.5 gap-y-1'>
          <span className='text-foreground font-sans text-xs font-semibold normal-case'>
            {props.title}
          </span>
          <span className='border-border border-s ps-2.5 normal-case'>
            {props.language}
          </span>
        </span>
      }
      endActions={
        <CopyButton
          value={props.value}
          tooltip={t('Copy code')}
          className='size-7'
        />
      }
    >
      <pre className='px-3 py-3 text-xs leading-6' dir='ltr'>
        <code>{props.value}</code>
      </pre>
    </CodeBlockFrame>
  )
}

export function ApiExamples({ reference }: { reference: ApiReference }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('Request example')} className='grid min-w-0 gap-3'>
      <Example
        title={t('Request example')}
        language='cURL'
        value={reference.request}
      />
      {reference.response && (
        <Example
          title={t('Response')}
          language='JSON'
          value={reference.response}
        />
      )}
    </section>
  )
}
