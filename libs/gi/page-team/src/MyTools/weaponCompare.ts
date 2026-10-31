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
import { layeredAssignment, objPathValue } from '@genshin-optimizer/common/util'
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
import { getCharStat, getWeaponStat } from '@genshin-optimizer/gi/stats'
import { getTeamData, getTeamDataCalc } from '@genshin-optimizer/gi/ui'
import type { CalcResult, UIData } from '@genshin-optimizer/gi/uidata'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import { constant, type Data } from '@genshin-optimizer/gi/wr'
import type { WeaponCondDef, WeaponCondValues } from './weaponConditions'
import { listWeaponConditions } from './weaponConditions'

/** Các vũ khí cùng loại với nhân vật, lọc theo độ hiếm tối thiểu. */
export function listCandidateWeapons(
  characterKey: CharacterKey,
  minRarity: RarityKey = 4,
  maxRarity: RarityKey = 5
): WeaponKey[] {
  const { weaponType } = getCharStat(characterKey)
  return allWeaponKeys.filter((wk) => {
    const stat = getWeaponStat(wk)
    return (
      stat &&
      stat.weaponType === weaponType &&
      stat.rarity >= minRarity &&
      stat.rarity <= maxRarity
    )
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
 *
 * `condValues` (tùy chọn): các điều kiện passive của CHÍNH vũ khí đó do bạn chọn
 * trong tab So vũ khí. Khi có, nó thay thế hoàn toàn điều kiện của vũ khí này
 * trong dữ liệu nhân vật (các điều kiện khác như kỹ năng, set thánh di vật giữ nguyên).
 * Khi không có (undefined), dùng điều kiện đang đặt ở tab Tổng quan như bình thường.
 */
export function evalWithWeapon(
  database: ArtCharDatabase,
  teamId: string,
  teamCharId: string,
  gender: GenderKey,
  characterKey: CharacterKey,
  weapon: ICachedWeapon | undefined,
  targetPath: string[],
  condValues?: { conds: WeaponCondDef[]; values: WeaponCondValues }
): number | undefined {
  if (!weapon || !condValues) {
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

  // Dựng dữ liệu team như GO, rồi thay điều kiện của vũ khí này bằng lựa chọn của bạn
  const activeChar = database.teams.getActiveTeamChar(teamId)
  const bundle = getTeamData(database, teamId, teamCharId, 0, undefined, weapon)
  if (!activeChar || !bundle?.teamData) return undefined
  const charData = bundle.teamData[characterKey] as Data[] | undefined
  if (!charData) return undefined
  // Bỏ điều kiện cũ của vũ khí này (nếu có) để không bị trùng khi gộp dữ liệu
  for (const d of charData) {
    const cond = d.conditional as Record<string, unknown> | undefined
    if (cond && weapon.key in cond) delete cond[weapon.key]
  }
  const layer: Data = { conditional: {} }
  for (const c of condValues.conds) {
    const v = condValues.values[c.id]
    if (v) layeredAssignment(layer, ['conditional', ...c.path], constant(v))
  }
  charData.unshift(layer)
  const calc = uiDataForTeam(bundle.teamData, gender, activeChar.key)
  return readTargetValue(calc[characterKey]?.target, targetPath)
}

export type WeaponCompareRow = {
  weaponKey: WeaponKey
  rarity: number
  /** Các mốc tinh luyện đã tính (vũ khí 1-2★ chỉ có R1) */
  refinements: RefinementKey[]
  /** Giá trị theo từng mốc tinh luyện */
  values: Partial<Record<RefinementKey, number | undefined>>
  /** Mốc tinh luyện cao nhất đã tính, dùng để xếp hạng */
  refinement: RefinementKey
  /** Giá trị ở mốc tinh luyện cao nhất, dùng để xếp hạng */
  value: number | undefined
  hasConditional: boolean
  isEquipped: boolean
}

/** Nhường luồng cho trình duyệt vẽ lại giao diện giữa các lượt tính. */
const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Chạy so sánh cho cả danh sách vũ khí, ở một hoặc nhiều mốc tinh luyện.
 * Tính từng cái một và nhường luồng để trang không bị đơ;
 * `onProgress` báo tiến độ, `isCancelled` cho phép dừng.
 */
export async function runWeaponCompare(opts: {
  database: ArtCharDatabase
  teamId: string
  teamCharId: string
  gender: GenderKey
  characterKey: CharacterKey
  equippedWeaponKey: WeaponKey | undefined
  weaponKeys: WeaponKey[]
  /** Các mốc tinh luyện cần tính, ví dụ [1,2,3,4,5] hoặc [3] */
  refinements: RefinementKey[]
  targetPath: string[]
  data: UIData
  /** Điều kiện passive bạn đã chọn cho từng vũ khí (xem weaponConditions.ts) */
  overrides: Partial<Record<WeaponKey, WeaponCondValues>>
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}): Promise<WeaponCompareRow[]> {
  const rows: WeaponCompareRow[] = []
  const total = opts.weaponKeys.length
  for (let i = 0; i < total; i++) {
    if (opts.isCancelled?.()) break
    const wk = opts.weaponKeys[i]
    // Vũ khí 1-2★ không có tinh luyện nên chỉ tính 1 lần
    const hasRefinement = getWeaponStat(wk).rarity > 2
    const refs = hasRefinement ? opts.refinements : [1 as RefinementKey]
    const conds = listWeaponConditions(wk, opts.data)
    const chosen = opts.overrides[wk]
    const condValues = chosen ? { conds, values: chosen } : undefined
    const values: WeaponCompareRow['values'] = {}
    for (const r of refs) {
      const weapon = makeVirtualWeapon(wk, opts.characterKey, r)
      try {
        values[r] = evalWithWeapon(
          opts.database,
          opts.teamId,
          opts.teamCharId,
          opts.gender,
          opts.characterKey,
          weapon,
          opts.targetPath,
          condValues
        )
      } catch (e) {
        console.error(`[MyTools] Lỗi khi tính vũ khí ${wk} R${r}`, e)
      }
    }
    const top = refs[refs.length - 1]
    rows.push({
      weaponKey: wk,
      rarity: getWeaponStat(wk).rarity,
      refinements: refs,
      values,
      refinement: top,
      value: values[top],
      hasConditional: conds.length > 0,
      isEquipped: wk === opts.equippedWeaponKey,
    })
    opts.onProgress?.(i + 1, total)
    await yieldToBrowser()
  }
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
}
