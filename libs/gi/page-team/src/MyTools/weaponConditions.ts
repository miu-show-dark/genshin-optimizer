/**
 * MyTools – điều kiện (passive có stack/kích hoạt) của từng vũ khí khi so sánh.
 *
 * Lựa chọn bật/tắt được lưu trong localStorage của trình duyệt (khóa
 * `mytools_weaponconds_<teamCharId>`), KHÔNG ghi vào database của GO, nên
 * không làm thay đổi dữ liệu nhân vật của bạn.
 */
import { evalIfFunc, objPathValue } from '@genshin-optimizer/common/util'
import type { WeaponKey } from '@genshin-optimizer/gi/consts'
import type { DocumentSection } from '@genshin-optimizer/gi/sheets'
import { getWeaponSheet } from '@genshin-optimizer/gi/sheets'
import type { UIData } from '@genshin-optimizer/gi/uidata'
import type { ReactNode } from 'react'

/** Một điều kiện của vũ khí, ví dụ "Số stack" với các mức 1..5, hoặc "Đang kích hoạt". */
export type WeaponCondDef = {
  /** Đường dẫn trong dữ liệu điều kiện, ví dụ ['MistsplitterReforged', 'MistsplittersEmblem'] */
  path: readonly string[]
  /** Khóa dạng chuỗi để lưu, ví dụ 'MistsplitterReforged.MistsplittersEmblem' */
  id: string
  /** Tên điều kiện (có thể là phần tử React đã dịch) */
  label: ReactNode
  /** Các mức có thể chọn (ngoài mức "Tắt"). Chỉ 1 mức nghĩa là công tắc bật/tắt. */
  options: Array<{ value: string; label: ReactNode }>
}

/** Điều kiện đã chọn của một vũ khí: id điều kiện -> mức đang bật. Thiếu = tắt. */
export type WeaponCondValues = Record<string, string>

/** Toàn bộ lựa chọn: khóa vũ khí -> các điều kiện đã chọn. Thiếu khóa = chưa chỉnh gì. */
export type WeaponCondOverrides = Partial<Record<WeaponKey, WeaponCondValues>>

type StatesLike = Record<string, { name?: ReactNode; path?: readonly string[] }>

/** Liệt kê các điều kiện của một vũ khí (rỗng nếu vũ khí không có điều kiện). */
export function listWeaponConditions(
  weaponKey: WeaponKey,
  data: UIData
): WeaponCondDef[] {
  const sheet = getWeaponSheet(weaponKey)
  if (!sheet) return []
  const result: WeaponCondDef[] = []
  for (const doc of sheet.document as DocumentSection[]) {
    if (!('states' in doc) || !doc.states) continue
    let states: StatesLike
    try {
      states = evalIfFunc(doc.states, data) as StatesLike
    } catch {
      continue
    }
    const stateKeys = Object.keys(states)
    if (!stateKeys.length) continue
    if ('path' in doc && doc.path) {
      // Điều kiện "exclusive": chọn 1 trong nhiều mức (ví dụ số stack)
      result.push({
        path: doc.path,
        id: doc.path.join('.'),
        label: doc.name,
        options: stateKeys.map((sk) => ({
          value: sk,
          label: states[sk].name ?? sk,
        })),
      })
    } else {
      // Điều kiện "multiple": mỗi state là một công tắc riêng
      for (const sk of stateKeys) {
        const p = states[sk]?.path
        if (!p) continue
        result.push({
          path: p,
          id: p.join('.'),
          label: states[sk].name ?? sk,
          options: [{ value: sk, label: states[sk].name ?? sk }],
        })
      }
    }
  }
  return result
}

/** Mức cao nhất của từng điều kiện (mức cuối cùng trong danh sách). */
export function maxValuesFor(conds: WeaponCondDef[]): WeaponCondValues {
  const values: WeaponCondValues = {}
  for (const c of conds)
    if (c.options.length) values[c.id] = c.options[c.options.length - 1].value
  return values
}

/**
 * Giá trị điều kiện hiện đang đặt trong dữ liệu nhân vật (tab Tổng quan).
 * Dùng cho vũ khí đang cầm, để ô chọn hiển thị đúng những gì bạn đã bật.
 */
export function valuesFromCharConditional(
  conds: WeaponCondDef[],
  charConditional: unknown
): WeaponCondValues {
  const values: WeaponCondValues = {}
  for (const c of conds) {
    const v = objPathValue(charConditional as object, c.path as string[])
    if (typeof v === 'string') values[c.id] = v
  }
  return values
}

const storageKey = (teamCharId: string) => `mytools_weaponconds_${teamCharId}`

export function loadWeaponCondOverrides(
  teamCharId: string
): WeaponCondOverrides {
  try {
    const raw = localStorage.getItem(storageKey(teamCharId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // localStorage có thể bị chặn (chế độ ẩn danh...)
  }
}

export function saveWeaponCondOverrides(
  teamCharId: string,
  overrides: WeaponCondOverrides
) {
  try {
    localStorage.setItem(storageKey(teamCharId), JSON.stringify(overrides))
  } catch {
    // bỏ qua nếu không lưu được
  }
}
