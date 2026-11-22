// Ranking of the quick search. cmdk's own matching is fuzzy (letters in order anywhere in the text),
// which let "tema" match nearly everything through the descriptions. This one wants every word typed
// to appear as a real piece of text, and ranks by where: the title first, then the words people use
// for the app, then its description.
//
// The keywords of an entry are laid out as [title, description, ...other words].

const norm = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function wordStart(text: string, token: string) {
  return text.split(/[\s:/\-_.]+/).some((word) => word.startsWith(token))
}

function tokenScore(token: string, title: string, description: string, words: string[]): number {
  if (title.startsWith(token)) return 4
  if (wordStart(title, token)) return 3
  if (title.includes(token)) return 2
  if (words.some((word) => word === token)) return 2.2
  if (words.some((word) => word.startsWith(token))) return 1.6
  if (words.some((word) => word.includes(token))) return 1
  if (description.includes(token)) return 0.4
  return 0
}

export function paletteScore(_value: string, search: string, keywords?: string[]): number {
  const tokens = norm(search).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  const [rawTitle = '', rawDescription = '', ...rawWords] = keywords ?? []
  const title = norm(rawTitle)
  const description = norm(rawDescription)
  const words = rawWords.map(norm)
  let total = 0
  for (const token of tokens) {
    const score = tokenScore(token, title, description, words)
    if (score === 0) return 0
    total += score
  }
  return total
}
