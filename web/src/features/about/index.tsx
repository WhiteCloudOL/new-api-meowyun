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
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Boxes,
  Cable,
  Route,
  Receipt,
  GitFork,
  GitPullRequest,
  History,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import aboutMascot from '@/assets/journal/about-mascot.webp'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { FORK_REPOSITORY_URL } from '@/lib/constants'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getAboutContent } from './api'

import './journal-about.css'

function JournalAbout({ markdown }: { markdown: string }) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  return (
    <PublicLayout showMainContainer={false}>
      <main className='journal-about'>
        <section className='journal-about-cover'>
          <div>
            <span className='journal-about-label'>{t('About')}</span>
            <h1>{systemName || 'MeowYun API'}</h1>
            <p>
              {t(
                'This fork extends New API with voice synthesis and web search'
              )}
            </p>
            <div className='journal-about-actions'>
              <Button
                render={
                  <a
                    href={FORK_REPOSITORY_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <GitFork />
                {t('Open Source')}
              </Button>
              <Button
                variant='outline'
                render={
                  <a
                    href={`${FORK_REPOSITORY_URL}/commits/main/`}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <History />
                {t('Changelog')}
              </Button>
            </div>
          </div>
          <img src={aboutMascot} alt='' width={480} height={480} />
        </section>
        {markdown && (
          <section className='journal-about-notes'>
            <RichContent
              mode='markdown'
              content={markdown}
              className='prose-neutral dark:prose-invert max-w-none'
            />
          </section>
        )}
        <ul className='journal-features'>
          {[
            { icon: Boxes, label: t('Unified multimodal access') },
            { icon: Cable, label: t('OpenAI-compatible API') },
            { icon: Route, label: t('Channel routing and failover') },
            { icon: Receipt, label: t('Usage-based billing') },
          ].map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon aria-hidden='true' />
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <section className='journal-about-credits'>
          <h2>
            <GitPullRequest aria-hidden='true' />
            {t('Project origins')}
          </h2>
          <ul>
            <li>
              <a
                href='https://github.com/QuantumNous/new-api'
                target='_blank'
                rel='noopener noreferrer'
              >
                New API <ArrowUpRight />
              </a>
              <a
                href='https://github.com/QuantumNous'
                target='_blank'
                rel='noopener noreferrer'
              >
                QuantumNous
              </a>
            </li>
            <li>
              <a
                href='https://github.com/songquanpeng/one-api'
                target='_blank'
                rel='noopener noreferrer'
              >
                One API <ArrowUpRight />
              </a>
              <a
                href='https://github.com/songquanpeng'
                target='_blank'
                rel='noopener noreferrer'
              >
                JustSong
              </a>
            </li>
            <li>
              <a
                href={`${FORK_REPOSITORY_URL}/blob/main/LICENSE`}
                target='_blank'
                rel='noopener noreferrer'
              >
                AGPL v3.0 <ArrowUpRight />
              </a>
              <span>{t('License')}</span>
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </PublicLayout>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: async () => requireServerSuccess(await getAboutContent()),
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return <JournalAbout markdown={rawContent} />
}
