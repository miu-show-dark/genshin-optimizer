/**
 * MyTools – logic so sánh vũ khí (không có UI ở đây).
 *
 * Ý tưởng: GO đã có sẵn hàm `getTeamDataCalc(...)` nhận tham số `overrideWeapon`.
 * Ta chỉ cần lần lượt "giả lập" trang bị từng vũ khí cùng loại cho nhân vật đang xem,
 * giữ nguyên thánh di vật / team / buff, rồi đọc giá trị của mục tiêu tối ưu
 * (hoặc một Custom Multi Target) => xếp hạng.
 *
 * File này chỉ dùng các API công khai của GO nên khi đồng bộ cập nhật từ bản gốc
 * sẽ rất ít khi bị xung đột.
 */
import {
  deepClone,
  evalIfFunc,
  layeredAssignment,
  objPathValue,
} from '@genshin-optimizer/common/util'
import type {
  CharacterKey,
  GenderKey,
  RarityKey,
  RefinementKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  allWeaponKeys,
  charKeyToLocCharKey,
  weaponMaxAscension,
  weaponMaxLevel,
} from '@genshin-optimizer/gi/consts'
import type { ArtCharDatabase, ICachedWeapon } from '@genshin-optimizer/gi/db'
import type { DocumentSection } from '@genshin-optimizer/gi/sheets'
import { getWeaponSheet } from '@genshin-optimizer/gi/sheets'
import { getCharStat, getWeaponStat } from '@genshin-optimizer/gi/stats'
import { getTeamDataCalc } from '@genshin-optimizer/gi/ui'
import type { CalcResult, UIData } from '@genshin-optimizer/gi/uidata'

/** Các vũ khí cùng loại với nhân vật, lọc theo độ hiếm tối thiểu. */
export function listCandidateWeapons(
  characterKey: CharacterKey,
  minRarity: RarityKey = 4
): WeaponKey[] {
  const { weaponType } = getCharStat(characterKey)
  return allWeaponKeys.filter((wk) => {
    const stat = getWeaponStat(wk)
    return stat && stat.weaponType === weaponType && stat.rarity >= minRarity
  })
}

/** Tạo một vũ khí "ảo" ở cấp tối đa để đưa vào tính toán (không lưu vào database). */
export function makeVirtualWeapon(
  weaponKey: WeaponKey,
  characterKey: CharacterKey,
  refinement: RefinementKey
): ICachedWeapon {
  const rarity = getWeaponStat(weaponKey).rarity as RarityKey
  return {
    id: `mytools_${weaponKey}`,
    key: weaponKey,
    level: weaponMaxLevel[rarity],
    ascension: weaponMaxAscension[rarity],
    // vũ khí 1-2 sao không có tinh luyện
    refinement: rarity > 2 ? refinement : 1,
    location: charKeyToLocCharKey(characterKey),
    lock: false,
  }
}

/** Đọc giá trị số của một đường dẫn (path) trong bảng hiển thị của UIData. */
export function readTargetValue(
  uiData: UIData | undefined,
  path: string[]
): number | undefined {
  if (!uiData) return undefined
  const node = objPathValue(uiData.getDisplay(), path) as CalcResult | undefined
  const value = node?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Tính giá trị mục tiêu khi nhân vật cầm `weapon`.
 * Thánh di vật, team, kẻ địch, buff... lấy y nguyên từ loadout hiện tại.
 */
export function evalWithWeapon(
  database: ArtCharDatabase,
  teamId: string,
  teamCharId: string,
  gender: GenderKey,
  characterKey: CharacterKey,
  weapon: ICachedWeapon | undefined,
  targetPath: string[]
): number | undefined {
  const teamData = getTeamDataCalc(
    database,
    teamId,
    gender,
    teamCharId,
    0,
    undefined,
    weapon
  )
  return readTargetValue(teamData?.[characterKey]?.target, targetPath)
}

/**
 * Tìm các điều kiện (passive có stack/kích hoạt) của một vũ khí và trả về
 * trạng thái "tối đa" cho từng điều kiện: [path, stateKey].
 * - Điều kiện loại "exclusive": chọn state cuối cùng (thường là stack cao nhất).
 * - Điều kiện loại "multiple": bật tất cả các state.
 */
export function maxConditionalsForWeapon(
  weaponKey: WeaponKey,
  data: UIData
): Array<[readonly string[], string]> {
  const sheet = getWeaponSheet(weaponKey)
  if (!sheet) return []
  const result: Array<[readonly string[], string]> = []
  for (const doc of sheet.document as DocumentSection[]) {
    if (!('states' in doc) || !doc.states) continue
    let states: Record<string, { path?: readonly string[] }>
    try {
      states = evalIfFunc(doc.states, data) as Record<
        string,
        { path?: readonly string[] }
      >
    } catch {
      continue
    }
    const stateKeys = Object.keys(states)
    if (!stateKeys.length) continue
    if ('path' in doc && doc.path) {
      result.push([doc.path, stateKeys[stateKeys.length - 1]])
    } else {
      for (const sk of stateKeys) {
        const p = states[sk]?.path
        if (p) result.push([p, sk])
      }
    }
  }
  return result
}

/**
 * Ghi điều kiện "tối đa" cho các vũ khí trong danh sách vào teamChar,
 * CHỈ ghi những điều kiện chưa được đặt (không đè lựa chọn bạn đã bật tay).
 * Trả về số điều kiện đã ghi.
 */
export function applyMaxConditionals(
  database: ArtCharDatabase,
  teamCharId: string,
  weaponKeys: WeaponKey[],
  data: UIData
): number {
  let count = 0
  database.teamChars.set(teamCharId, (teamChar) => {
    const conditional = deepClone(teamChar.conditional) as Record<
      string,
      unknown
    >
    for (const wk of weaponKeys) {
      for (const [path, state] of maxConditionalsForWeapon(wk, data)) {
        if (objPathValue(conditional, path as string[]) !== undefined) continue
        layeredAssignment(conditional, path as string[], state)
        count++
      }
    }
    teamChar.conditional = conditional as typeof teamChar.conditional
  })
  return count
}

export type WeaponCompareRow = {
  weaponKey: WeaponKey
  rarity: number
  refinement: RefinementKey
  value: number | undefined
  hasConditional: boolean
  isEquipped: boolean
}

/** Nhường luồng cho trình duyệt vẽ lại giao diện giữa các lượt tính. */
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Chạy so sánh cho cả danh sách vũ khí. Tính từng cái một và nhường luồng
 * để trang không bị đơ; `onProgress` báo tiến độ, `isCancelled` cho phép dừng.
 */
export async function runWeaponCompare(opts: {
  database: ArtCharDatabase
  teamId: string
  teamCharId: string
  gender: GenderKey
  characterKey: CharacterKey
  equippedWeaponKey: WeaponKey | undefined
  weaponKeys: WeaponKey[]
  refinement: RefinementKey
  targetPath: string[]
  data: UIData
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}): Promise<WeaponCompareRow[]> {
  const rows: WeaponCompareRow[] = []
  const total = opts.weaponKeys.length
  for (let i = 0; i < total; i++) {
    if (opts.isCancelled?.()) break
    const wk = opts.weaponKeys[i]
    const weapon = makeVirtualWeapon(wk, opts.characterKey, opts.refinement)
    let value: number | undefined
    try {
      value = evalWithWeapon(
        opts.database,
        opts.teamId,
        opts.teamCharId,
        opts.gender,
        opts.characterKey,
        weapon,
        opts.targetPath
      )
    } catch (e) {
      console.error(`[MyTools] Lỗi khi tính vũ khí ${wk}`, e)
    }
    rows.push({
      weaponKey: wk,
      rarity: getWeaponStat(wk).rarity,
      refinement: weapon.refinement,
      value,
      hasConditional: maxConditionalsForWeapon(wk, opts.data).length > 0,
      isEquipped: wk === opts.equippedWeaponKey,
    })
    opts.onProgress?.(i + 1, total)
    await yieldToBrowser()
  }
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
}
