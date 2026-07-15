import Fuse from 'fuse.js'
import type { DataSheet } from './storage'

/**
 * Build a Fuse index over a single column of the sheet.
 *
 * Returns a function that, given a query, returns up to `limit` matches.
 * Each match carries the original row index (into the *unsorted* rows
 * array) so the caller can map it back to a referenced row.
 */
export function buildFuzzySearcher(
  sheet: DataSheet,
  column: string,
  limit = 5
): (query: string) => { value: string; rowIndex: number }[] {
  const items = sheet.rows.map((r, i) => ({
    rowIndex: i,
    value: String(r[column] ?? ''),
  }))
  const fuse = new Fuse(items, {
    keys: ['value'],
    includeScore: false,
    threshold: 0.4, // 0 = exact, 1 = anything
    ignoreLocation: true,
    minMatchCharLength: 1,
  })
  return (query: string) => {
    if (!query.trim()) return []
    return fuse
      .search(query, { limit })
      .map(r => ({ value: r.item.value, rowIndex: r.item.rowIndex }))
  }
}

/**
 * Sort the sheet's rows by a column (string comparison) and return a
 * list of original row indices in sorted order. The capture screen uses
 * this to navigate Prev/Next through the sorted view.
 */
export function sortedRowIndices(
  sheet: DataSheet,
  sortBy: string
): number[] {
  return sheet.rows
    .map((row, idx) => ({
      idx,
      key: String(row[sortBy] ?? ''),
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
    .map(x => x.idx)
}
