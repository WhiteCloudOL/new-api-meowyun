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
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  AudioLines,
  Braces,
  KeyRound,
  BookOpen,
  ListChecks,
  PawPrint,
  Image,
  MessageCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import mascot from '@/assets/journal/mascot.webp'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'

import './journal-home.css'

function highlightExample(command: string) {
  const tokens =
    /(?<string>"(?:\\.|[^"\\])*"|'[^'\n]*')|(?<keyword>\b(?:import|await|const|curl)\b)|(?<flag>-[Hd]\b)/g
  const parts = []
  let start = 0
  for (const match of command.matchAll(tokens)) {
    const kind = Object.keys(match.groups ?? {}).find(
      (name) => match.groups?.[name] !== undefined
    )
    parts.push(
      command.slice(start, match.index),
      <span key={match.index} className={`journal-${kind}`}>
        {match[0]}
      </span>
    )
    start = match.index + match[0].length
  }
  return [...parts, command.slice(start)]
}

export function JournalHome({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const { status, hasServerResponse } = useStatus()
  const docs =
    typeof status?.docs_link === 'string' &&
    /^https?:\/\//i.test(status.docs_link)
      ? status.docs_link
      : '/docs'
  const [language, setLanguage] = useState('cURL')
  const nav = parseHeaderNavModulesFromStatus(status)
  const address = String(
    status?.server_address || window.location.origin
  ).replace(/\/+$/, '')
  const base = address.endsWith('/v1') ? address : `${address}/v1`
  const canReadPrices =
    !!status &&
    nav.pricing.enabled &&
    (!nav.pricing.requireAuth || isAuthenticated)
  const { models } = usePricingData(canReadPrices)
  const catalog = [
    {
      label: t('Chat'),
      path: '/chat/completions',
      icon: MessageCircle,
      tone: 'rose',
      filter: { endpointType: 'openai' },
    },
    {
      label: t('Image Generation'),
      path: '/images/generations',
      icon: Image,
      tone: 'peach',
      filter: { endpointType: 'image-generation' },
    },
    {
      label: t('Voice synthesis'),
      path: '/audio/speech',
      icon: AudioLines,
      tone: 'mint',
      filter: { search: 'tts' },
    },
    {
      label: t('Web Search'),
      path: '/tools/search',
      icon: Search,
      tone: 'lilac',
      filter: { endpointType: 'deepseek-tools-search' },
    },
  ]
  const examples = [
    {
      id: 'chat',
      label: t('Chat'),
      path: '/chat/completions',
      body: '{"model":"deepseek-flash","messages":[{"role":"user","content":"Hello!"}]}',
      name: 'deepseek-flash',
    },
    {
      id: 'search',
      label: t('Web Search'),
      path: '/tools/search',
      body: '{"query":"DeepSeek API","count":3}',
      name: 'deepseek-search',
    },
  ]
  return (
    <main className='journal-home'>
      <section className='journal-cover'>
        <div className='journal-petals' aria-hidden='true'>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className='journal-intro'>
          <div className='journal-brand'>
            <span aria-hidden='true' />
            {String(status?.system_name || 'MeowYun API')}
          </div>
          <h1>
            {t('A single API')}
            <br />
            <em>{t('Many models')}</em>
          </h1>
          <p>
            {t(
              'Connect chat, images, speech and web search through one gateway'
            )}
          </p>
          <div className='journal-actions'>
            {nav.pricing.enabled && (
              <Button size='lg' render={<Link to='/pricing' />}>
                {t('Model Square')} <PawPrint />
              </Button>
            )}
            {nav.console && (
              <Button
                size='lg'
                variant='outline'
                render={
                  <Link to={isAuthenticated ? '/dashboard' : '/sign-in'} />
                }
              >
                {t('Console')}
              </Button>
            )}
          </div>
          <div className='journal-address'>
            {hasServerResponse && (
              <span
                className='journal-online'
                role='img'
                aria-label={t('Online')}
                title={t('Online')}
              />
            )}
            <span className='sr-only'>{t('API Base URL')}</span>
            <code>{base}</code>
            <CopyButton
              value={base}
              tooltip={t('Copy to clipboard')}
              successTooltip={t('Copied to your clipboard, meow!')}
            />
          </div>
        </div>
        <div className='journal-art' aria-hidden='true'>
          <img
            src={mascot}
            width={1100}
            height={826}
            fetchPriority='high'
            alt=''
          />
          <Sparkles className='journal-spark' />
          <span className='journal-heart'>♥</span>
        </div>
      </section>
      {nav.pricing.enabled && (
        <section className='journal-section'>
          <div className='journal-section-head'>
            <h2>
              {t('Model directory')}{' '}
              <span
                className='journal-sticker journal-peek'
                aria-hidden='true'
              />
            </h2>
            <Link to='/pricing'>
              {t('All models')} <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className='journal-directory'>
            {catalog.map(({ label, path, icon: Icon, tone, filter }) => (
              <Link
                key={path}
                to='/pricing'
                search={filter}
                className={`journal-entry journal-${tone}`}
              >
                <span className='journal-entry-icons'>
                  <span className='journal-icon'>
                    <Icon size={24} />
                  </span>
                  <ArrowUpRight size={17} />
                </span>
                <h3>{label}</h3>
                <code>{path}</code>
                <Icon className='journal-watermark' aria-hidden='true' />
              </Link>
            ))}
          </div>
          {canReadPrices && models.length > 0 && (
            <div className='journal-models'>
              <span>{t('Available Models')}</span>
              <div className='journal-model-strip'>
                {models.slice(0, 12).map(({ model_name }) => (
                  <Link
                    key={model_name}
                    to='/pricing'
                    search={{ search: model_name }}
                  >
                    {model_name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <section className='journal-section journal-guide'>
        <div>
          <Braces size={26} aria-hidden='true' />
          <h2>{t('footer.columns.docs.links.quickStart')}</h2>
          <p>{t('Copy an example and use your gateway API key')}</p>
          <span className='journal-sticker journal-dev' aria-hidden='true' />
        </div>
        <Tabs defaultValue='chat' className='journal-code'>
          <div className='journal-window'>
            <span className='journal-dots' aria-hidden='true'>
              <i />
              <i />
              <i />
            </span>
            <TabsList aria-label={t('Request example')}>
              {examples.map((e) => (
                <TabsTrigger value={e.id} key={e.id}>
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <NativeSelect
              size='sm'
              aria-label={t('Select Language')}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {['cURL', 'Python', 'JavaScript'].map((name) => (
                <NativeSelectOption key={name}>{name}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {examples.map((e) => {
            const url = `${base}${e.path}`
            let command = [
              `curl '${url.replaceAll("'", "'\\''")}'`,
              '  -H "Authorization: Bearer $API_KEY"',
              '  -H "Content-Type: application/json"',
              `  -d '${e.body}'`,
            ].join(' ' + '\\\n')
            if (language === 'Python') {
              command = [
                'import os, requests',
                '',
                'response = requests.post(',
                `    ${JSON.stringify(url)},`,
                '    headers={"Authorization": "Bearer " + os.environ["API_KEY"]},',
                `    json=${e.body},`,
                ')',
                'response.raise_for_status()',
                'print(response.json())',
              ].join('\n')
            } else if (language === 'JavaScript') {
              command = [
                `const response = await fetch(${JSON.stringify(url)}, {`,
                '  method: "POST",',
                '  headers: {',
                '    Authorization: "Bearer " + process.env.API_KEY,',
                '    "Content-Type": "application/json",',
                '  },',
                `  body: JSON.stringify(${e.body}),`,
                '});',
                'console.log(await response.json());',
              ].join('\n')
            }
            return (
              <TabsContent value={e.id} key={e.id}>
                <div className='journal-request'>
                  <strong>POST</strong>
                  <code>{e.path}</code>
                  <span>{e.name}</span>
                </div>
                <CopyButton
                  value={command}
                  className='journal-code-copy'
                  tooltip={t('Copy to clipboard')}
                />
                <pre>
                  <code>{highlightExample(command)}</code>
                </pre>
              </TabsContent>
            )
          })}
        </Tabs>
      </section>
      <div className='journal-resources'>
        {nav.docs && (
          <a href={docs}>
            <BookOpen />
            <span>
              {t('footer.columns.docs.links.apiDocs')}
              <small>{t('Explore supported endpoints')}</small>
            </span>
            <ArrowUpRight />
          </a>
        )}
        {nav.console && (
          <>
            <Link to='/keys'>
              <KeyRound />
              <span>
                {t('API Keys')}
                <small>{t('Manage access for each application')}</small>
              </span>
              <ArrowUpRight />
            </Link>
            <Link to='/usage-logs'>
              <ListChecks />
              <span>
                {t('Usage Logs')}
                <small>{t('Inspect individual API calls')}</small>
              </span>
              <ArrowUpRight />
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
