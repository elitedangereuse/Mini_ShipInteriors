import { tr } from '../i18n'
import { artUrl } from '../site'

interface Choice { id: string; label: string }
const searchable = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
export function filterArt(choices: readonly Choice[], query: string): Choice[] {
  const words = searchable(query).trim().split(/\s+/).filter(Boolean)
  return choices.filter(({ label }) => words.every((word) => searchable(label).includes(word)))
}

/** Filtering never changes the artwork already displayed in the cabin. */
export function artChoice(choices: Choice[], current: string | undefined, cards: boolean, query: string,
  onSearch: (query: string) => void, onSelect: (id: string) => void): HTMLElement {
  const root = document.createElement('div')
  root.className = 'ed-art-choice'
  const preview = document.createElement('img')
  preview.className = 'ed-art-preview' + (current?.startsWith('badge:') ? ' ed-art-badge' : current?.startsWith('adv:') ? ' ed-art-poster' : ''); preview.alt = ''; preview.draggable = false
  if (current) preview.src = artUrl(current)
  const controls = document.createElement('div'); controls.className = 'ed-art-controls'
  const label = document.createElement('label'); label.className = 'ed-art-label'
  label.textContent = tr('Visuel exposé', 'Displayed artwork')
  const name = document.createElement('span'); name.className = 'ed-art-current'
  name.textContent = choices.find((v) => v.id === current)?.label ?? ''
  const select = document.createElement('select')
  select.className = 'ed-site-choice'; select.id = 'ed-art-select'
  label.htmlFor = select.id
  const count = document.createElement('span'); count.className = 'ed-art-count'
  count.setAttribute('aria-live', 'polite')
  const refresh = (search: string) => {
    const results = filterArt(choices, search)
    select.replaceChildren()
    if (!results.some((v) => v.id === current)) {
      const empty = document.createElement('option'); empty.value = ''; empty.disabled = true; empty.selected = true
      empty.textContent = results.length ? tr('Choisir un visuel…', 'Choose artwork…') : tr('Aucun résultat', 'No results')
      select.append(empty)
    }
    for (const v of results) {
      const option = document.createElement('option'); option.value = v.id; option.textContent = v.label
      option.selected = v.id === current; select.append(option)
    }
    select.disabled = !results.length
    count.textContent = tr(`${results.length} / ${choices.length} visuels`, `${results.length} / ${choices.length} artworks`)
  }
  controls.append(label, name)
  if (cards) {
    const search = document.createElement('input'); search.type = 'search'; search.className = 'ed-art-search'
    search.placeholder = tr('Rechercher une carte…', 'Search cards…')
    search.setAttribute('aria-label', tr('Rechercher dans mes cartes', 'Search my cards'))
    search.value = query
    search.oninput = () => { onSearch(search.value); refresh(search.value) }
    controls.append(search)
  }
  refresh(cards ? query : '')
  select.onchange = () => {
    if (!select.value) return
    onSelect(select.value)
    // The editor rebuilds its tools after changing the variant.
    document.getElementById(select.id)?.focus()
  }
  controls.append(select, count); root.append(preview, controls)
  // Typing, native undo and dropdown navigation must not trigger editor shortcuts.
  root.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation() })
  return root
}
