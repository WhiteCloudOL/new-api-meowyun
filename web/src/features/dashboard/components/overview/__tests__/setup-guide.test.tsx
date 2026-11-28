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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

const storageKey = 'dashboard_overview_setup_guide_expanded'
let client: QueryClient
let keyLookupError: Error | null
let quotaRows: { created_at: number; quota: number; count: number }[]

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  keyLookupError = null
  quotaRows = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/token/?p=1&size=10':
        if (keyLookupError) throw keyLookupError
        return {
          data: {
            success: true,
            data: {
              items: [{ id: 1, name: 'App key', key: 'masked', status: 1 }],
            },
          },
        }
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
            },
          },
        }
      case '/api/user/models':
        return { data: { success: true, data: ['gpt-4o-mini'] } }
      case '/api/data/self':
        return { data: { success: true, data: quotaRows } }
      default:
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview setup guide', () => {
  it('shows a welcome snapshot with only the current day of usage when setup is complete', async () => {
    vi.setSystemTime(new Date(2026, 10, 28, 14))
    quotaRows = [
      {
        created_at: new Date(2026, 10, 27, 23).getTime() / 1000,
        quota: 250000,
        count: 1,
      },
      {
        created_at: new Date(2026, 10, 28, 13).getTime() / 1000,
        quota: 125000,
        count: 1,
      },
    ]
    await renderOverview()

    const welcome = await screen.findByRole('region', {
      name: 'Good afternoon',
    })
    const toggle = within(welcome).getByRole('button', {
      name: 'Show setup guide',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: 'Usage at a glance' })
    ).toBeVisible()
    expect(within(welcome).getByText('Setup progress: 3/3')).toBeInTheDocument()
    expect(within(welcome).getByText('Low balance')).toBeVisible()
    expect(within(welcome).getByText(formatQuota(125000))).toBeVisible()
    expect(within(welcome).queryByText(formatQuota(375000))).toBeNull()
    const overviewUsageRequests = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => url === '/api/data/self')
    expect(overviewUsageRequests).toHaveLength(1)
    const panel = document.getElementById(
      toggle.getAttribute('aria-controls') ?? ''
    )
    expect(panel).toBeInTheDocument()
    expect(panel).not.toBeVisible()
  })

  it('toggles the completed guide with the keyboard and restores focus after hiding it', async () => {
    const user = userEvent.setup()
    await renderOverview()
    const toggle = await screen.findByRole('button', {
      name: 'Show setup guide',
    })

    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    const hide = await screen.findByRole('button', { name: 'Hide setup guide' })
    expect(hide).toHaveFocus()
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    expect(
      document.getElementById(hide.getAttribute('aria-controls') ?? '')
    ).toBeVisible()
    expect(
      screen.getByRole('heading', {
        name: 'Build on your API gateway in minutes',
      })
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^API Keys/ })).toBeVisible()
    )

    await user.keyboard(' ')
    const reopened = screen.getByRole('button', { name: 'Show setup guide' })
    expect(reopened).toHaveAttribute('aria-expanded', 'false')
    expect(reopened).toHaveFocus()
    await user.click(reopened)
    await user.click(screen.getByRole('button', { name: 'Hide setup guide' }))
    expect(
      screen.getByRole('button', { name: 'Show setup guide' })
    ).toHaveFocus()
  })

  it('restores the completed guide preference after remounting', async () => {
    const user = userEvent.setup()
    const first = await renderOverview()
    await user.click(
      await screen.findByRole('button', { name: 'Show setup guide' })
    )
    first.unmount()

    const second = await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    ).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Hide setup guide' }))
    second.unmount()

    await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Show setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Setup guide complete')).not.toBeInTheDocument()
  })

  it('keeps the progress and quick actions when an incomplete guide is manually collapsed', async () => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    await renderOverview()

    await user.click(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    )
    expect(screen.getByText('Setup progress: 1/3')).toBeVisible()
    expect(screen.getAllByText('Balance depleted').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'API Keys' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Hide setup guide' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show setup guide' }))
    expect(
      screen.getByRole('button', { name: 'Hide setup guide' })
    ).toBeVisible()
  })

  it('updates the welcome banner when the remaining setup step completes', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'dashboard-user',
      role: 1,
      quota: 1000000,
    })
    window.localStorage.setItem(storageKey, 'collapsed')
    await renderOverview()
    expect(await screen.findByText('Setup progress: 2/3')).toBeVisible()

    act(() => {
      useAuthStore.getState().auth.setUser({
        id: 1,
        username: 'dashboard-user',
        role: 1,
        quota: 1000000,
        request_count: 1,
      })
    })
    expect(
      await screen.findByRole('button', { name: 'Show setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Setup progress: 3/3')).toBeInTheDocument()
  })

  it('does not show a completed setup entry when the key lookup fails', async () => {
    keyLookupError = new Error('Key lookup unavailable')
    await renderOverview()

    expect(
      await screen.findByRole('button', { name: 'Hide setup guide' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Show setup guide' })
    ).not.toBeInTheDocument()
  })

  it('shows an empty trend state for zero usage and keeps the three setup actions', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    await renderOverview()

    expect(await screen.findAllByText('No recent usage')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Create API Key/ })).toBeVisible()
    expect(screen.getByRole('link', { name: /Add credits/ })).toBeVisible()
    expect(screen.getByRole('link', { name: /Send a request/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Copy ready-to-run curl' })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Create API Key' })).toBeNull()
  })
})
