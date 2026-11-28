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
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { documentationSectionsQuery } from '@/features/documentation/content'
import {
  getDocTitle,
  orderedDocSections,
  validDocSections,
  validDocSlug,
  type DocSection,
} from '@/features/documentation/sections'

import { SettingsForm } from '../components/settings-form-layout'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'

export function DocumentationSectionManager({
  sections,
}: {
  sections: DocSection[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [open, setOpen] = useState(false)
  const published = JSON.stringify(sections)
  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm({
      defaultValues: { DocsSections: published },
      onSubmit: async ({ DocsSections }) => {
        const arranged = JSON.parse(DocsSections) as DocSection[]
        if (!validDocSections(arranged)) return
        await updateOption.mutateAsync({
          key: 'DocsSections',
          value: DocsSections,
        })
        queryClient.setQueryData(documentationSectionsQuery.queryKey, arranged)
        await queryClient.invalidateQueries({
          queryKey: documentationSectionsQuery.queryKey,
        })
        setOpen(false)
      },
    })
  const draft = JSON.parse(
    useWatch({ control: form.control, name: 'DocsSections' }) ?? published
  ) as DocSection[]
  const ordered = orderedDocSections(draft)
  const canAdd =
    draft.length < 64 &&
    validDocSlug(slug) &&
    !!title.trim() &&
    !draft.some((section) => section.id === slug)
  const canSave = isDirty && validDocSections(draft)

  function change(next: DocSection[]) {
    form.setValue('DocsSections', JSON.stringify(next), { shouldDirty: true })
  }

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (isSubmitting) return
        if (next) {
          form.reset({ DocsSections: published })
          setTitle('')
          setSlug('')
        }
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={<Button variant='outline' className='w-full justify-start' />}
      >
        <ListTree data-icon='inline-start' />
        {t('Manage sections')}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className='flex max-h-[min(90dvh,52rem)] flex-col overflow-hidden sm:max-w-4xl'
      >
        <DialogHeader>
          <DialogTitle>{t('Manage sections')}</DialogTitle>
          <DialogDescription>
            {t(
              'Organize documentation into up to three levels. Each section has its own page and Markdown content.'
            )}
          </DialogDescription>
        </DialogHeader>
        <SettingsForm
          className='flex min-h-0 flex-col gap-0'
          onSubmit={(event) => {
            void handleSubmit(event).catch(() => {
              // The update hook reports the server error and preserves the draft.
            })
          }}
        >
          <div className='min-h-0 space-y-4 overflow-y-auto overscroll-contain px-1 pt-1 pb-4'>
            <div className='flex flex-wrap items-end gap-2'>
              <label className='min-w-36 flex-1 space-y-1 text-sm'>
                <span>{t('Name')}</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={96}
                />
              </label>
              <label className='min-w-36 flex-1 space-y-1 text-sm'>
                <span>{t('Slug')}</span>
                <Input
                  value={slug}
                  onChange={(event) =>
                    setSlug(event.target.value.toLowerCase())
                  }
                  maxLength={64}
                  placeholder='my-section'
                />
              </label>
              <Button
                type='button'
                disabled={!canAdd}
                onClick={() => {
                  change([...draft, { id: slug, title: title.trim() }])
                  setTitle('')
                  setSlug('')
                }}
              >
                <Plus data-icon='inline-start' />
                {t('Add section')}
              </Button>
            </div>
            <div className='space-y-2'>
              {ordered.map(({ section, depth }) => {
                const index = draft.findIndex(({ id }) => id === section.id)
                const title = getDocTitle(section, t)
                const parent = section.parentId || ''
                const siblings = draft.filter(
                  (item) => (item.parentId || '') === parent
                )
                const position = siblings.findIndex(
                  (item) => item.id === section.id
                )
                const hasChildren = draft.some(
                  (item) => item.parentId === section.id
                )
                const parentChoices = ordered.filter(
                  ({ section: candidate, depth: level }) => {
                    if (candidate.id === section.id || level >= 3) return false
                    const moved = draft.map((item) =>
                      item.id === section.id
                        ? { ...item, parentId: candidate.id }
                        : item
                    )
                    return orderedDocSections(moved).length === draft.length
                  }
                )

                function move(target: number) {
                  const other = draft.findIndex(
                    ({ id }) => id === siblings[target]?.id
                  )
                  if (other < 0) return
                  const updated = [...draft]
                  ;[updated[index], updated[other]] = [
                    updated[other],
                    updated[index],
                  ]
                  change(updated)
                }

                return (
                  <div
                    key={section.id}
                    className='bg-card grid gap-2 rounded-xl border p-3 data-[doc-depth=2]:ms-2 data-[doc-depth=3]:ms-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end'
                    data-doc-depth={depth}
                  >
                    <label className='space-y-1 text-sm'>
                      <span className='text-muted-foreground text-xs'>
                        {t('Name')} · <code>{section.id}</code>
                      </span>
                      <Input
                        value={section.title}
                        maxLength={96}
                        placeholder={title}
                        aria-label={`${t('Name')} · ${section.id}`}
                        onChange={(event) => {
                          const value = event.target.value
                          change(
                            draft.map((item) =>
                              item.id === section.id
                                ? { ...item, title: value }
                                : item
                            )
                          )
                        }}
                      />
                    </label>
                    <label className='min-w-0 space-y-1 text-sm'>
                      <span className='text-muted-foreground text-xs'>
                        {t('Parent section')}
                      </span>
                      <NativeSelect
                        value={parent}
                        aria-label={`${t('Parent section')} · ${section.id}`}
                        className='w-full'
                        onChange={(event) => {
                          const value = event.target.value
                          change(
                            draft.map((item) =>
                              item.id === section.id
                                ? { ...item, parentId: value }
                                : item
                            )
                          )
                        }}
                      >
                        <NativeSelectOption value=''>
                          {t('Top level')}
                        </NativeSelectOption>
                        {parentChoices.map(
                          ({ section: choice, depth: level }) => (
                            <NativeSelectOption
                              key={choice.id}
                              value={choice.id}
                            >
                              {level === 2 ? '↳ ' : ''}
                              {getDocTitle(choice, t)}
                            </NativeSelectOption>
                          )
                        )}
                      </NativeSelect>
                    </label>
                    <div className='flex flex-wrap gap-1'>
                      <Button
                        type='button'
                        size='icon-sm'
                        variant='ghost'
                        aria-label={`${t('Move up')} · ${section.id}`}
                        disabled={position === 0}
                        onClick={() => move(position - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type='button'
                        size='icon-sm'
                        variant='ghost'
                        aria-label={`${t('Move down')} · ${section.id}`}
                        disabled={position + 1 >= siblings.length}
                        onClick={() => move(position + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type='button'
                        size='icon-sm'
                        variant='ghost'
                        aria-label={`${t('Remove')} · ${section.id}`}
                        disabled={hasChildren || draft.length <= 1}
                        onClick={() =>
                          change(draft.filter(({ id }) => id !== section.id))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter className='shrink-0'>
            <Button
              type='button'
              variant='ghost'
              onClick={handleReset}
              disabled={!isDirty || isSubmitting}
            >
              {t('Reset')}
            </Button>
            <DialogClose
              render={<Button variant='outline' disabled={isSubmitting} />}
            >
              {t('Cancel')}
            </DialogClose>
            <Button type='submit' disabled={!canSave || isSubmitting}>
              {isSubmitting ? t('Saving...') : t('Save changes')}
            </Button>
          </DialogFooter>
        </SettingsForm>
      </DialogContent>
    </Dialog>
  )
}
