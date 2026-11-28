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
import { ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

import type { DocNavigationSection } from './sections'

function NavigationBranch({
  section,
  current,
  filtering,
  onNavigate,
}: {
  section: DocNavigationSection
  current: string
  filtering: boolean
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(true)
  if (!section.children) {
    const selected = section.id === current
    return (
      <li>
        <Link
          to='/docs/$section'
          params={{ section: section.id }}
          onClick={onNavigate}
          activeOptions={{ exact: true, includeHash: false }}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'focus-visible:ring-ring block min-h-8 rounded-md px-2 py-1.5 text-sm leading-snug break-words focus-visible:ring-2 focus-visible:outline-none',
            selected
              ? 'bg-primary/9 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-accent/65 hover:text-foreground'
          )}
        >
          {section.title}
        </Link>
      </li>
    )
  }

  return (
    <li>
      <Collapsible open={filtering || open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          disabled={filtering}
          render={
            <Button
              variant='ghost'
              className='text-muted-foreground hover:text-foreground aria-expanded:text-muted-foreground h-auto min-h-8 w-full justify-between gap-2 rounded-md border-0 px-2 py-1.5 text-start leading-snug whitespace-normal shadow-none hover:bg-transparent disabled:opacity-100 aria-expanded:bg-transparent dark:hover:bg-transparent'
            />
          }
        >
          <span className='min-w-0 break-words'>{section.title}</span>
          <ChevronRight
            className={cn(
              'size-3.5 motion-safe:transition-transform rtl:rotate-180',
              (filtering || open) && 'rotate-90 rtl:rotate-90'
            )}
            aria-hidden='true'
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className='border-border ms-3 space-y-0.5 border-s ps-2'>
            {section.children.map((child) => (
              <NavigationBranch
                key={child.id}
                section={child}
                current={current}
                filtering={filtering}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

export function DocumentationNavigation({
  sections,
  current,
  onNavigate,
}: {
  sections: DocNavigationSection[]
  current: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()

  function matchingBranches(
    branches: DocNavigationSection[]
  ): DocNavigationSection[] {
    return branches.flatMap((section) => {
      if (section.title.toLowerCase().includes(query)) return [section]
      if (!section.children) return []
      const children = matchingBranches(section.children)
      return children.length > 0 ? [{ ...section, children }] : []
    })
  }

  const branches = query ? matchingBranches(sections) : sections

  return (
    <nav aria-label={t('Table of contents')} className='flex min-h-0 flex-col'>
      <div className='shrink-0 px-1 pb-3'>
        <InputGroup className='bg-background h-9'>
          <InputGroupAddon>
            <Search aria-hidden='true' />
          </InputGroupAddon>
          <InputGroupInput
            type='search'
            aria-label={t('Search')}
            placeholder={t('Search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
      </div>
      <div className='min-h-0 overflow-y-auto px-1'>
        {branches.length > 0 ? (
          <ul className='space-y-1'>
            {branches.map((section) => (
              <NavigationBranch
                key={section.id}
                section={section}
                current={current}
                filtering={Boolean(query)}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          <p className='text-muted-foreground px-2 py-2 text-sm' role='status'>
            {t('No results found')}
          </p>
        )}
      </div>
    </nav>
  )
}
