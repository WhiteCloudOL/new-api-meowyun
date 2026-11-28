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
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import mascot from '@/assets/journal/mascot.webp'
import { CopyButton } from '@/components/copy-button'
import { Skeleton } from '@/components/ui/skeleton'

type DocumentationBannerProps = {
  addresses: readonly { url: string; route: string }[]
  loading: boolean
}

export function DocumentationBanner(props: DocumentationBannerProps) {
  const { t } = useTranslation()
  const title = t('footer.columns.docs.links.apiDocs')

  return (
    <section
      aria-label={title}
      className='border-primary/15 from-card via-primary/3 to-primary/12 relative isolate mb-7 overflow-hidden rounded-2xl border bg-linear-to-br px-5 py-5 sm:min-h-56 sm:px-8 sm:py-6 lg:px-10'
    >
      <img
        src={mascot}
        alt=''
        width={960}
        height={878}
        className='pointer-events-none absolute end-3 top-2 -z-10 h-auto w-24 object-contain sm:end-8 sm:top-auto sm:bottom-0 sm:w-48 md:w-56 lg:end-12 lg:w-60'
      />
      <div className='sm:me-52 md:me-60 lg:me-72'>
        <div className='min-h-20 pe-21 sm:min-h-0 sm:pe-0'>
          <p className='flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl'>
            <BookOpen
              className='text-primary size-5 shrink-0'
              aria-hidden='true'
            />
            {title}
          </p>
          <p className='text-muted-foreground mt-1.5 text-sm'>
            {t(
              'Connect to the gateway with the API protocol your application uses'
            )}
          </p>
        </div>
        {props.loading ? (
          <Skeleton className='mt-4 h-16 max-w-xl' />
        ) : (
          <section
            aria-label={t('API Addresses')}
            className='border-primary/15 bg-background/85 mt-4 max-w-xl rounded-xl border'
          >
            <p className='border-primary/12 text-muted-foreground border-b px-3 py-2 text-xs font-semibold'>
              {t('API Addresses')}
            </p>
            <ul className='divide-primary/12 divide-y'>
              {props.addresses.map(({ url, route }) => (
                <li
                  key={JSON.stringify([url, route])}
                  className='flex items-center gap-2 px-3 py-1.5'
                >
                  <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1'>
                    <code
                      className='text-foreground text-sm break-all'
                      dir='ltr'
                    >
                      {url}
                    </code>
                    {route && (
                      <span className='text-muted-foreground text-xs break-words'>
                        {route}
                      </span>
                    )}
                  </div>
                  <CopyButton
                    value={url}
                    className='size-7'
                    aria-label={`${t('Copy API URL')} ${url}`}
                    tooltip={t('Copy API URL')}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  )
}
