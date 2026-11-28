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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DocumentationEditor,
  DocumentationSection,
} from '@/features/system-settings/site/documentation-section'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import { documentationQuery, documentationSectionsQuery } from '../content'
import { Documentation } from '../index'

test.each([
  ['', '/v1/chat/completions'],
  ['## My saved notes', '## My saved notes'],
])(
  'fills the Markdown editor from the published content or its default (%s)',
  async (saved, expected) => {
    const queryClient = new QueryClient()
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <DocumentationEditor
            section={{ id: 'openai', title: 'OpenAI' }}
            defaultValue={saved}
          />
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      )
      const source = await screen.findByRole<HTMLTextAreaElement>('textbox', {
        name: 'Documentation content',
      })
      expect(source.value).toContain(expected)
      if (saved) expect(source).toHaveValue(saved)
      expect(
        screen.queryByRole('button', { name: 'Load starter documentation' })
      ).not.toBeInTheDocument()
    } finally {
      queryClient.clear()
    }
  }
)

test('selecting a third-level section from the mobile directory changes the URL and displays only its Markdown', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  queryClient.setQueryData(documentationSectionsQuery.queryKey, [
    { id: 'guides', title: 'Guides' },
    { id: 'intro', title: 'Introduction', parentId: 'guides' },
    { id: 'images', title: 'Images', parentId: 'guides' },
    { id: 'edits', title: 'Image edits', parentId: 'images' },
    { id: 'generations', title: 'Image generation', parentId: 'images' },
    { id: 'health', title: 'Health' },
    { id: 'status', title: 'Status API', parentId: 'health' },
  ])
  queryClient.setQueryData(
    documentationQuery('intro').queryKey,
    '## First section only'
  )
  queryClient.setQueryData(
    documentationQuery('edits').queryKey,
    [
      '## Edit examples only',
      '```bash',
      "curl '{{API_BASE}}/v1/images/edits' -F 'image=@cat.png'",
      '```',
      '```json response',
      '{"data":[]}',
      '```',
    ].join('\n\n')
  )
  queryClient.setQueryData<StatusData>(STATUS_QUERY_KEY, {
    api_info_enabled: true,
    api_info: [
      { url: 'https://primary.example/gateway/v1/', route: 'Primary' },
      { url: 'https://secondary.example', route: 'Secondary' },
    ],
  })
  const root = createRootRoute()
  const page = createRoute({
    getParentRoute: () => root,
    path: '/docs/$section',
    component: () => {
      const { section } = page.useParams()
      return <Documentation key={section} sectionId={section} />
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/docs/intro'] }),
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

    const toggle = await screen.findByRole('button', {
      name: 'Table of contents',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: 'First section only' })
    ).toBeVisible()
    await user.click(toggle)

    const drawer = await screen.findByRole('dialog', {
      name: 'Table of contents',
    })
    expect(within(drawer).queryByRole('link', { name: 'Images' })).toBeNull()
    expect(within(drawer).queryByRole('button', { name: 'Health' })).toBeNull()
    expect(
      within(drawer).getByRole('link', { name: 'Status API' })
    ).toHaveAttribute('href', '/docs/status')
    const images = within(drawer).getByRole('button', { name: 'Images' })
    images.focus()
    await user.keyboard('{Enter}')
    expect(images).toHaveAttribute('aria-expanded', 'false')
    expect(router.state.location.pathname).toBe('/docs/intro')
    const search = within(drawer).getByRole('searchbox', { name: 'Search' })
    await user.type(search, 'image edits')
    expect(images).toHaveAttribute('aria-expanded', 'true')
    const link = within(drawer).getByRole('link', { name: 'Image edits' })
    expect(link).toHaveAttribute('href', '/docs/edits')
    await user.click(link)

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/docs/edits')
    )
    expect(
      await screen.findByRole('heading', { name: 'Edit examples only' })
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'First section only' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const banner = screen.getByRole('region', {
      name: 'footer.columns.docs.links.apiDocs',
    })
    const apiAddresses = within(banner).getByRole('region', {
      name: 'API Addresses',
    })
    expect(
      within(apiAddresses)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('code')?.textContent)
    ).toEqual([
      'https://primary.example/gateway/v1/',
      'https://secondary.example',
    ])
    const endpoint = screen.getByRole('region', { name: 'Endpoint' })
    expect(within(endpoint).getByText('POST')).toBeVisible()
    expect(within(endpoint).getByText('/v1/images/edits')).toBeVisible()
    expect(within(endpoint).getByText('multipart/form-data')).toBeVisible()
    const examples = screen.getByRole('region', { name: 'Request example' })
    expect(examples).toHaveTextContent(
      'https://primary.example/gateway/v1/images/edits'
    )
    expect(examples).toHaveTextContent('{"data":[]}')
    expect(examples).not.toHaveTextContent('https://secondary.example')
  } finally {
    queryClient.clear()
  }
})

test('saving section changes closes the manager and reloads the editor navigation', async () => {
  const sections = [{ id: 'intro', title: 'Introduction' }]
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  queryClient.setQueryData(documentationSectionsQuery.queryKey, sections)
  queryClient.setQueryData(
    documentationQuery('intro').queryKey,
    'Editor content'
  )
  queryClient.setQueryData<StatusData>(STATUS_QUERY_KEY, {})
  let saved = JSON.stringify(sections)
  const put = vi.spyOn(api, 'put').mockImplementation(async (_url, data) => {
    saved = (data as { value: string }).value
    return { data: { success: true } }
  })
  const get = vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: saved },
  }))
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  const route = createRoute({
    getParentRoute: () => authenticated,
    path: '/system-settings/site/$section',
    component: DocumentationSection,
  })
  const router = createRouter({
    routeTree: root.addChildren([authenticated.addChildren([route])]),
    history: createMemoryHistory({
      initialEntries: ['/system-settings/site/documentation'],
    }),
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
      await screen.findByRole('button', { name: 'Manage sections' })
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage sections',
    })
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Name' }),
      'Status API'
    )
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Slug' }),
      'status-api'
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Add section' })
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    )

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'DocsSections',
      value: JSON.stringify([
        ...sections,
        { id: 'status-api', title: 'Status API' },
      ]),
    })
    expect(get).toHaveBeenCalledWith('/api/docs', expect.any(Object))
    expect(screen.getByRole('link', { name: 'Status API' })).toBeVisible()
    expect(
      screen.getByRole('textbox', { name: 'Documentation content' })
    ).toHaveValue('Editor content')
  } finally {
    get.mockRestore()
    put.mockRestore()
    queryClient.clear()
  }
})
