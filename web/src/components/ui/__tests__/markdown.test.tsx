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
import { render } from '@testing-library/react'
import { expect, test } from 'vitest'

import { Markdown } from '../markdown'

test.each([
  ['inline', 'Formula: $$\\frac{1}{2}$$.'],
  ['display', '$$\n\\frac{1}{2}\n$$'],
  ['fenced', '```math\n\\frac{1}{2}\n```'],
])('preserves MathML and visual output when rendering %s math', (_, source) => {
  const view = render(<Markdown>{source}</Markdown>)
  const math = view.getByRole('math', { hidden: true })

  expect(math.querySelector('mfrac')).not.toBeNull()
  expect(math.querySelector('annotation')).toHaveTextContent('\\frac{1}{2}')
  expect(view.container.querySelector('.katex-html')).toHaveAttribute(
    'aria-hidden',
    'true'
  )
})

test('does not load math resources when trust is inherited from a polluted prototype', () => {
  const originalTrust = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'trust'
  )

  try {
    Object.defineProperty(Object.prototype, 'trust', {
      configurable: true,
      value: true,
      writable: true,
    })

    const view = render(
      <Markdown>
        {'$$\\includegraphics{https://example.com/untrusted.png}$$'}
      </Markdown>
    )

    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container).toHaveTextContent('\\includegraphics')
  } finally {
    if (originalTrust) {
      Object.defineProperty(Object.prototype, 'trust', originalTrust)
    } else {
      Reflect.deleteProperty(Object.prototype, 'trust')
    }
  }
})

test('derives unique Unicode anchors from rendered headings and preserves fenced examples', () => {
  const source = [
    '[Jump to a heading](#快速-开始)',
    '',
    '## 快速 **开始**',
    '~~~markdown',
    '## Ignore this example heading',
    '~~~',
    '## 快速 开始',
    'Compatible endpoints',
    '--------------------',
  ].join('\n')
  const view = render(
    <Markdown
      renderDocument={(content, headings) => (
        <>
          <nav>
            {headings.map(({ id, text }) => (
              <a key={id} href={`#${id}`}>
                {text}
              </a>
            ))}
          </nav>
          {content}
        </>
      )}
    >
      {source}
    </Markdown>
  )

  expect(
    view
      .getAllByRole('link', { name: '快速 开始' })
      .map((link) => link.getAttribute('href'))
  ).toEqual(['#doc-快速-开始', '#doc-快速-开始-2'])
  expect(
    view.getByRole('heading', { name: 'Compatible endpoints' })
  ).toHaveAttribute('id', 'doc-compatible-endpoints')
  expect(
    view.queryByRole('link', { name: 'Ignore this example heading' })
  ).not.toBeInTheDocument()
  expect(view.getByRole('link', { name: 'Jump to a heading' })).toHaveAttribute(
    'href',
    '#doc-快速-开始'
  )
})

test('documentation opens site links in place and excludes embedded HTML', () => {
  const view = render(
    <Markdown renderDocument={(content) => content}>
      {
        '[API Keys](/keys)\n\n[Unsafe](javascript:alert%281%29)\n\n<form><input placeholder="fake login"></form>'
      }
    </Markdown>
  )

  const link = view.getByRole('link', { name: 'API Keys' })
  expect(link).toHaveAttribute('href', '/keys')
  expect(link).not.toHaveAttribute('target')
  expect(view.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()
  expect(view.queryByPlaceholderText('fake login')).not.toBeInTheDocument()
})
