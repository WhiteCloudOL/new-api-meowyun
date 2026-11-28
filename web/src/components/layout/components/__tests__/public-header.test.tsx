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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import { PublicHeader } from '../public-header'

test('opening the mobile navigation reserves the same decorative marker slot for current and other pages', async () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData<StatusData>(STATUS_QUERY_KEY, {})
  const root = createRootRoute({
    component: () => (
      <PublicHeader
        showAuthButtons={false}
        showLanguageSwitcher={false}
        showNotifications={false}
        showThemeSwitch={false}
      />
    ),
  })
  const docs = createRoute({
    getParentRoute: () => root,
    path: '/docs/$section',
  })
  const router = createRouter({
    routeTree: root.addChildren([docs]),
    history: createMemoryHistory({ initialEntries: ['/docs/guide'] }),
  })
  const user = userEvent.setup()

  try {
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    )
    await user.click(
      await screen.findByRole('button', { name: 'Toggle navigation menu' })
    )
    const [, mobile] = screen.getAllByRole('navigation')
    expect(within(mobile).getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    for (const link of within(mobile).getAllByRole('link')) {
      expect(link.querySelector('span[aria-hidden="true"]')).toHaveTextContent(
        'ω'
      )
    }
  } finally {
    queryClient.clear()
  }
})
