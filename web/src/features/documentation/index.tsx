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
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  List,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { Markdown, type MarkdownHeading } from '@/components/ui/markdown'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { useDocumentationApiAddresses } from './api-addresses'
import { DocumentationBanner } from './banner'
import {
  documentationQuery,
  documentationSectionsQuery,
  resolveDocumentation,
} from './content'
import { DocumentationNavigation } from './navigation'
import { readApiReference } from './reference'
import { ApiEndpoint, ApiExamples } from './reference-panels'
import {
  defaultDocSections,
  getDocFolderTrail,
  getDocNavigation,
  getDocTitle,
  isDocPage,
  orderedDocSections,
  type DocSection,
} from './sections'

function DocumentationOutline({
  headings,
  onNavigate,
}: {
  headings: MarkdownHeading[]
  onNavigate?: () => void
}) {
  const { t } = useTranslation()

  if (headings.length === 0) return null

  return (
    <nav aria-label={t('On this page')}>
      <p className='mb-3 text-sm font-semibold'>{t('On this page')}</p>
      <ul className='border-border space-y-1 border-s ps-3'>
        {headings.map(({ id, text, depth }) => (
          <li
            key={id}
            className={cn(depth === 3 && 'ms-2', depth > 3 && 'ms-4')}
          >
            <a
              href={`#${id}`}
              onClick={onNavigate}
              className='text-muted-foreground hover:text-primary focus-visible:ring-ring block rounded-sm py-1 text-sm leading-snug break-words focus-visible:ring-2 focus-visible:outline-none'
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function AdjacentPage({
  section,
  direction,
}: {
  section: DocSection
  direction: 'previous' | 'next'
}) {
  const { t } = useTranslation()
  const previous = direction === 'previous'
  const Arrow = previous ? ArrowLeft : ArrowRight

  return (
    <Link
      to='/docs/$section'
      params={{ section: section.id }}
      className={cn(
        'border-border bg-card/60 hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-ring flex items-center gap-3 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        !previous && 'flex-row-reverse text-end sm:col-start-2'
      )}
    >
      <Arrow className='text-primary size-4 shrink-0 rtl:rotate-180' />
      <span className='min-w-0'>
        <span className='text-muted-foreground block text-xs'>
          {previous ? t('Previous page') : t('Next page')}
        </span>
        <span className='block text-sm font-medium break-words'>
          {getDocTitle(section, t)}
        </span>
      </span>
    </Link>
  )
}

export function Documentation({ sectionId }: { sectionId: string }) {
  const { t, i18n } = useTranslation()
  const sectionsQuery = useQuery(documentationSectionsQuery)
  const sections = sectionsQuery.data ?? defaultDocSections
  const active = sections.find(({ id }) => id === sectionId)
  const page = useQuery({
    ...documentationQuery(sectionId),
    enabled: !sectionsQuery.isPending && !!active,
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const {
    addresses,
    baseUrl,
    loading: statusLoading,
  } = useDocumentationApiAddresses()
  const language = i18n.resolvedLanguage || i18n.language
  const markdown = resolveDocumentation(sectionId, page.data, language, baseUrl)
  const loading =
    sectionsQuery.isPending || (!!active && (page.isPending || statusLoading))
  const reference = useMemo(
    () => (loading ? undefined : readApiReference(markdown, baseUrl)),
    [loading, markdown, baseUrl]
  )
  const navigation = getDocNavigation(sections, t)
  const ordered = orderedDocSections(sections).filter(({ section }) =>
    isDocPage(section, sections)
  )
  const activeIndex = ordered.findIndex(
    ({ section }) => section.id === sectionId
  )
  const previous =
    activeIndex > 0 ? ordered[activeIndex - 1]?.section : undefined
  const next = activeIndex >= 0 ? ordered[activeIndex + 1]?.section : undefined
  const ancestors = getDocFolderTrail(navigation, sectionId) ?? []

  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#doc-')) return
    try {
      const id = decodeURIComponent(window.location.hash.slice(1))
      document.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView()
    } catch {
      // Ignore invalid URL fragments.
    }
  }, [loading, markdown])

  function renderPage(content: ReactNode, headings: MarkdownHeading[]) {
    const hasRail = !!reference || headings.length > 0
    return (
      <main className='mx-auto w-full max-w-[96rem] px-4 pt-22 pb-16 sm:px-6 lg:px-8'>
        <DocumentationBanner addresses={addresses} loading={statusLoading} />
        <div className='lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8'>
          <aside className='bg-muted/35 border-border sticky top-22 hidden max-h-[calc(100dvh-7rem)] min-w-0 flex-col self-start rounded-xl border px-3 pt-4 pb-3 lg:flex'>
            <p className='mb-4 flex items-center gap-2 px-2 text-sm font-semibold'>
              <BookOpen className='text-primary size-4' aria-hidden='true' />
              {t('footer.columns.docs.links.apiDocs')}
            </p>
            <DocumentationNavigation
              sections={navigation}
              current={sectionId}
            />
          </aside>
          <div className='bg-background/95 border-border sticky top-14 z-20 mb-5 border-b py-2 backdrop-blur-sm lg:hidden'>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger render={<Button variant='outline' />}>
                <List data-icon='inline-start' />
                {t('Table of contents')}
              </SheetTrigger>
              <SheetContent side='left'>
                <SheetHeader>
                  <SheetTitle>{t('Table of contents')}</SheetTitle>
                </SheetHeader>
                <div className='min-h-0 overflow-y-auto px-3 pb-4'>
                  <DocumentationNavigation
                    sections={navigation}
                    current={sectionId}
                    onNavigate={() => setMobileOpen(false)}
                  />
                  {headings.length > 0 && (
                    <div className='mt-4 border-t p-3'>
                      <DocumentationOutline
                        headings={headings}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <article className='min-w-0'>
            <header className='border-border mb-6 space-y-4 border-b pb-5'>
              <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                <Link to='/docs' className='hover:text-primary'>
                  {t('footer.columns.docs.links.apiDocs')}
                </Link>
                {ancestors.map((ancestor) => (
                  <span
                    key={ancestor.id}
                    className='inline-flex items-center gap-2'
                  >
                    <ChevronRight
                      className='size-3.5 rtl:rotate-180'
                      aria-hidden='true'
                    />
                    <span className='break-words'>{ancestor.title}</span>
                  </span>
                ))}
              </div>
              {loading ? (
                <Skeleton
                  className='h-10 max-w-80'
                  role='status'
                  aria-label={t('Loading...')}
                />
              ) : (
                <div className='space-y-3'>
                  <h1 className='text-3xl font-bold tracking-tight break-words sm:text-4xl'>
                    {active
                      ? getDocTitle(active, t)
                      : t('Documentation section not found')}
                  </h1>
                  {active && markdown && (
                    <CopyButton
                      value={markdown}
                      variant='outline'
                      size='sm'
                      aria-label={t('Markdown source')}
                      tooltip={t('Copy to clipboard')}
                    >
                      {t('Markdown source')}
                    </CopyButton>
                  )}
                </div>
              )}
            </header>
            <div
              className={cn(
                'grid min-w-0 gap-x-7 gap-y-6',
                hasRail && 'xl:grid-cols-[minmax(0,1fr)_11rem]',
                reference && 'xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.67fr)]'
              )}
            >
              {reference && (
                <div className='min-w-0 xl:col-start-1 xl:row-start-1'>
                  <ApiEndpoint reference={reference} />
                </div>
              )}
              {hasRail && (
                <aside
                  className={cn(
                    'min-w-0 space-y-5 xl:sticky xl:top-22 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto',
                    reference ? 'xl:row-span-2' : 'hidden xl:block'
                  )}
                >
                  {reference && <ApiExamples reference={reference} />}
                  <div className='hidden xl:block'>
                    <DocumentationOutline headings={headings} />
                  </div>
                </aside>
              )}
              <div
                className={cn(
                  'min-w-0 max-w-[52rem] xl:col-start-1',
                  reference && 'xl:row-start-2'
                )}
              >
                {loading && <Skeleton className='h-56 rounded-xl' />}
                {!loading && active && page.isError && (
                  <p className='text-muted-foreground'>
                    {t('Failed to load documentation')}
                  </p>
                )}
                {!loading && active && content}
              </div>
            </div>
            {!loading && (previous || next) && (
              <div className='border-border mt-10 grid gap-3 border-t pt-5 sm:grid-cols-2'>
                {previous && (
                  <AdjacentPage section={previous} direction='previous' />
                )}
                {next && <AdjacentPage section={next} direction='next' />}
              </div>
            )}
          </article>
        </div>
      </main>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <Markdown
        className='[&_pre]:bg-muted/55 [&_tbody_tr:nth-child(even)]:bg-muted/30 text-base [&_:is(h1,h2,h3,h4,h5,h6)]:scroll-mt-32 [&_h2]:mt-10 [&_h2]:border-b [&_h2]:pb-2.5 [&_h2]:text-2xl [&_h3]:mt-7 [&_li]:leading-7 [&_p]:my-4 [&_p]:leading-7 [&_pre]:my-5 [&_pre]:rounded-lg [&_pre]:p-4 [&_table]:text-sm [&_table_code]:whitespace-nowrap [&_th]:whitespace-nowrap'
        renderDocument={renderPage}
      >
        {!loading && active ? (reference?.body ?? markdown) : ''}
      </Markdown>
      <Footer />
    </PublicLayout>
  )
}
