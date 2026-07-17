import Fuse from 'fuse.js'
import type { DataSheet, SortColumn, ColumnFilter } from './storage'

export function buildFuzzySearcher(
  sheet: DataSheet,
  columns: string[],
  limit = 5
): (query: string) => { value: string; column: string; rowIndex: number }[] {
  const items: { rowIndex: number; [key: string]: string | number }[] = []
  for (let i = 0; i < sheet.rows.length; i++) {
    const entry: { rowIndex: number; [key: string]: string | number } = {
      rowIndex: i,
    }
    for (const col of columns) {
      entry[col] = String(sheet.rows[i][col] ?? '')
    }
    items.push(entry)
  }
  const fuse = new Fuse(items, {
    keys: columns,
    includeScore: false,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 1,
  })
  return (query: string) => {
    if (!query.trim()) return []
    return fuse
      .search(query, { limit })
      .map(r => {
        const item = r.item
        let matchedCol = columns[0]
        let matchedVal = ''
        for (const col of columns) {
          const val = String(item[col] ?? '')
          if (val.toLowerCase().includes(query.toLowerCase())) {
            matchedCol = col
            matchedVal = val
            break
          }
        }
        if (!matchedVal) {
          matchedCol = columns[0]
          matchedVal = String(item[columns[0]] ?? '')
        }
        return {
          value: matchedVal,
          column: matchedCol,
          rowIndex: item.rowIndex as number,
        }
      })
  }
}

/**
 * Returns row indices after applying filters AND sorting.
 *
 * @param sheet      The data sheet
 * @param sortCols   Multi-column sort specification
 * @param filters    Active column filters
 * @param imageNames Set of photo_id values that have images on disk
 * @param photoIdCol Name of the photo_id column (for hasImageOnly filter)
 */
export function filteredSortedRowIndices(
  sheet: DataSheet,
  sortCols: SortColumn[],
  filters: ColumnFilter[],
  imageNames?: Set<string>,
  photoIdCol?: string,
): number[] {
  let indices = sheet.rows.map((_, idx) => idx)

  // Apply filters
  for (const filter of filters) {
    if (filter.excludedValues.length === 0 && !filter.hasImageOnly) continue

    indices = indices.filter(idx => {
      const value = String(sheet.rows[idx][filter.column] ?? '')

      // Exclude values that are unchecked
      if (filter.excludedValues.includes(value)) return false

      // For photo_id column: only keep rows that have images
      if (filter.hasImageOnly && filter.column === photoIdCol) {
        if (!imageNames || !imageNames.has(value)) return false
      }

      return true
    })
  }

  // Sort the filtered indices
  if (sortCols.length === 0) return indices

  return indices
    .map(idx => ({ idx, row: sheet.rows[idx] }))
    .sort((a, b) => {
      for (const sc of sortCols) {
        const va = String(a.row[sc.column] ?? '')
        const vb = String(b.row[sc.column] ?? '')
        const cmp = va.localeCompare(vb, undefined, { numeric: true })
        if (cmp !== 0) return sc.direction === 'desc' ? -cmp : cmp
      }
      return 0
    })
    .map(x => x.idx)
}

/**
 * Backwards-compatible wrapper that just sorts (no filters).
 */
export function sortedRowIndices(
  sheet: DataSheet,
  sortCols: SortColumn[]
): number[] {
  return filteredSortedRowIndices(sheet, sortCols, [])
}
