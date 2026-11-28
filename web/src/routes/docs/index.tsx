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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { documentationSectionsQuery } from '@/features/documentation/content'
import {
  defaultDocSections,
  isDocPage,
  orderedDocSections,
} from '@/features/documentation/sections'

export const Route = createFileRoute('/docs/')({
  beforeLoad: async ({ context }) => {
    const sections = await context.queryClient
      .ensureQueryData(documentationSectionsQuery)
      .catch(() => defaultDocSections)
    const first = orderedDocSections(sections).find(({ section }) =>
      isDocPage(section, sections)
    )
    throw redirect({
      to: '/docs/$section',
      params: { section: first?.section.id ?? 'quick-start' },
      replace: true,
    })
  },
})
