/** MyTools – hàm định dạng số dùng chung. */
export function formatValue(v: number | undefined) {
  if (v === undefined) return '—'
  if (Math.abs(v) < 10)
    return v.toLocaleString(undefined, { maximumFractionDigits: 3 })
  return Math.round(v).toLocaleString()
}

export function formatPct(v: number | undefined, base: number | undefined) {
  if (v === undefined || !base) return '—'
  return `${((v / base) * 100).toFixed(1)}%`
}
