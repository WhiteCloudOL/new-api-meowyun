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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useDocumentationApiAddresses } from '@/features/documentation/api-addresses'
import {
  documentationQuery,
  documentationSectionsQuery,
  getDefaultDocumentation,
  resolveDocumentation,
} from '@/features/documentation/content'
import {
  defaultDocSections,
  docSectionOption,
  getDocTitle,
  orderedDocSections,
  type DocSection,
} from '@/features/documentation/sections'
import { cn } from '@/lib/utils'

import { FormNavigationGuard } from '../components/form-navigation-guard'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { DocumentationSectionManager } from './documentation-section-manager'

export function DocumentationEditor({
  section,
  defaultValue,
}: {
  section: DocSection
  defaultValue: string
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const option = documentationQuery(section.id)
  const { baseUrl } = useDocumentationApiAddresses()
  const language = i18n.resolvedLanguage || i18n.language
  const starter = getDefaultDocumentation(section.id, language)
  const defaults = {
    DocsContent: defaultValue.trim() ? defaultValue : starter,
  }
  const form = useForm({ defaultValues: defaults })
  useResetForm(form, defaults)
  const { isDirty, isSubmitting } = form.formState
  const handleSubmit = form.handleSubmit(async ({ DocsContent }) => {
    if (!isDirty) return
    const value = DocsContent.trim() ? DocsContent : ''
    await updateOption.mutateAsync({
      key: docSectionOption(section.id),
      value,
    })
    queryClient.setQueryData(option.queryKey, value)
    form.reset({ DocsContent: value || starter })
  })
  function handleReset() {
    form.reset(defaults)
    toast.success(t('Form reset to saved values'))
  }
  const draft = useWatch({ control: form.control, name: 'DocsContent' })

  return (
    <>
      <FormNavigationGuard when={isDirty} />
      <Form {...form}>
        <SettingsForm onSubmit={handleSubmit}>
          <SettingsPageFormActions
            onSave={handleSubmit}
            onReset={handleReset}
            isSaving={isSubmitting}
            isSaveDisabled={!isDirty}
            isResetDisabled={!isDirty}
          />
          <Tabs defaultValue='source' className='gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <TabsList>
                <TabsTrigger value='source'>{t('Markdown source')}</TabsTrigger>
                <TabsTrigger value='preview'>{t('Preview')}</TabsTrigger>
              </TabsList>
              <Button
                variant='ghost'
                nativeButton={false}
                render={
                  <Link
                    to='/docs/$section'
                    params={{ section: section.id }}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('Docs')}
                <ArrowUpRight data-icon='inline-end' />
              </Button>
            </div>
            <TabsContent value='source'>
              <FormField
                name='DocsContent'
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Documentation content')}</FormLabel>
                    <FormControl>
                      <Textarea
                        className='resize-y font-mono'
                        rows={18}
                        {...field}
                      />
                    </FormControl>
                    {starter && (
                      <FormDescription>
                        {t(
                          'Leave blank to show the starter documentation. Markdown headings become entries in the table of contents.'
                        )}
                      </FormDescription>
                    )}
                  </FormItem>
                )}
              />
            </TabsContent>
            <TabsContent
              value='preview'
              className='min-w-0 rounded-xl border p-5'
            >
              <Markdown renderDocument={(content) => content}>
                {resolveDocumentation(section.id, draft, language, baseUrl)}
              </Markdown>
            </TabsContent>
          </Tabs>
        </SettingsForm>
      </Form>
    </>
  )
}

export function DocumentationSection() {
  const { t } = useTranslation()
  const { doc } = useSearch({
    from: '/_authenticated/system-settings/site/$section',
  })
  const navigation = useQuery(documentationSectionsQuery)
  const sections = navigation.data ?? defaultDocSections
  const ordered = orderedDocSections(sections)
  const selected = sections.find(({ id }) => id === doc) ?? ordered[0].section
  const page = useQuery({
    ...documentationQuery(selected.id),
    enabled: !navigation.isPending,
  })

  let content
  if (navigation.isPending || page.isPending) {
    content = (
      <Skeleton
        className='h-48 rounded-xl'
        role='status'
        aria-label={t('Loading...')}
      />
    )
  } else if ((navigation.isError && !navigation.data) || page.isError) {
    content = (
      <p className='text-muted-foreground'>
        {t('Failed to load documentation')}
      </p>
    )
  } else {
    content = (
      <DocumentationEditor
        key={selected.id}
        section={selected}
        defaultValue={page.data ?? ''}
      />
    )
  }

  return (
    <SettingsSection title={t('Docs')}>
      <div className='grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]'>
        <div className='bg-card self-start rounded-xl border p-2'>
          {!navigation.isPending && (
            <div className='mb-2 border-b pb-2'>
              <DocumentationSectionManager sections={sections} />
            </div>
          )}
          <nav aria-label={t('Table of contents')}>
            {ordered.map(({ section, depth }) => (
              <Link
                key={section.id}
                to='/system-settings/site/$section'
                params={{ section: 'documentation' }}
                search={{ doc: section.id }}
                className={cn(
                  'hover:bg-muted block rounded-lg px-2 py-1.5 text-sm break-words',
                  depth === 2 && 'ms-3',
                  depth === 3 && 'ms-6',
                  selected.id === section.id &&
                    'bg-primary/10 text-primary font-semibold'
                )}
                aria-current={selected.id === section.id ? 'page' : undefined}
              >
                {getDocTitle(section, t)}
              </Link>
            ))}
          </nav>
        </div>
        <div className='min-w-0'>{content}</div>
      </div>
    </SettingsSection>
  )
}
