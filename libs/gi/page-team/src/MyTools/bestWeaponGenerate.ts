/**
 * MyTools – nối "tìm vũ khí tốt nhất" vào nút Generate Builds của tab Optimize.
 * Khi bật, bấm nút Tạo Build sẽ thử từng vũ khí trong kho của bạn, mỗi vũ khí
 * tối ưu thánh di vật đầy đủ, rồi đưa kết quả (vũ khí + 5 thánh di vật) vào
 * danh sách build của GO.
 */
import { objKeyMap } from '@genshin-optimizer/common/util'
import type { CharacterKey, GenderKey } from '@genshin-optimizer/gi/consts'
import {
  allArtifactSlotKeys,
  charKeyToLocCharKey,
} from '@genshin-optimizer/gi/consts'
import type {
  ArtCharDatabase,
  ICachedArtifact,
  ICachedWeapon,
  OptConfig,
} from '@genshin-optimizer/gi/db'
import { getCharStat, getWeaponStat } from '@genshin-optimizer/gi/stats'
import type { UIData } from '@genshin-optimizer/gi/uidata'
import type { BestWeaponRow } from './bestWeapon'
import { runBestWeaponSearch } from './bestWeapon'
import {
  listWeaponConditions,
  loadWeaponCondOverrides,
} from './weaponConditions'

export type BestWeaponOptions = {
  /** Bật: nút Tạo Build sẽ tìm cả vũ khí */
  enabled: boolean
  /** Có thử cả vũ khí đang trang bị cho nhân vật khác không */
  includeOthers: boolean
}

const optKey = (teamCharId: string) => `mytools_bestweapon_${teamCharId}`

export function loadBestWeaponOptions(teamCharId: string): BestWeaponOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(optKey(teamCharId)) ?? '{}')
    return {
      enabled: !!raw.enabled,
      includeOthers: raw.includeOthers !== false,
    }
  } catch {
    return { enabled: false, includeOthers: true }
  }
}

export function saveBestWeaponOptions(
  teamCharId: string,
  opts: BestWeaponOptions
) {
  try {
    localStorage.setItem(optKey(teamCharId), JSON.stringify(opts))
  } catch {
    // bỏ qua nếu không lưu được
  }
}

/** Vũ khí THẬT trong kho, cùng loại với nhân vật (lọc theo tùy chọn). */
export function listOwnedCandidates(
  weapons: ICachedWeapon[],
  characterKey: CharacterKey,
  includeOthers: boolean,
  equippedWeaponId: string | undefined
): ICachedWeapon[] {
  const weaponType = getCharStat(characterKey).weaponType
  const loc = charKeyToLocCharKey(characterKey)
  return weapons.filter(
    (w) =>
      getWeaponStat(w.key)?.weaponType === weaponType &&
      (includeOthers ||
        !w.location ||
        w.location === loc ||
        w.id === equippedWeaponId)
  )
}

/** Ghi kết quả vào danh sách build của GO (hiện đủ vũ khí + thánh di vật). */
function publish(
  database: ArtCharDatabase,
  optConfigId: string,
  maxBuilds: number,
  sorted: BestWeaponRow[]
) {
  const builds = sorted
    .filter((r) => r.value !== undefined)
    .slice(0, maxBuilds)
    .map((r) => ({
      weaponId: r.weaponId,
      artifactIds: objKeyMap(
        allArtifactSlotKeys,
        (slot) => r.artifactIds[slot]
      ),
    }))
  if (builds.length)
    database.optConfigs.newOrSetGeneratedBuildList(optConfigId, {
      builds,
      buildDate: Date.now(),
    })
}

export async function generateBestWeaponBuilds(opts: {
  database: ArtCharDatabase
  teamId: string
  teamCharId: string
  optConfigId: string
  gender: GenderKey
  characterKey: CharacterKey
  equippedWeaponId: string | undefined
  optConfig: OptConfig
  arts: ICachedArtifact[]
  maxWorkers: number
  data: UIData
  includeOthers: boolean
  /** Được cập nhật liên tục để thanh tiến độ của GO hiển thị */
  status: { tested: number; total: number }
  registerCancel: (cancel: () => void) => void
  isCancelled: () => boolean
}) {
  const overrides = loadWeaponCondOverrides(opts.teamCharId)
  const weapons = listOwnedCandidates(
    [...opts.database.weapons.values],
    opts.characterKey,
    opts.includeOthers,
    opts.equippedWeaponId
  )
  let sorted: BestWeaponRow[] = []
  await runBestWeaponSearch({
    database: opts.database,
    teamId: opts.teamId,
    teamCharId: opts.teamCharId,
    gender: opts.gender,
    characterKey: opts.characterKey,
    equippedWeaponId: opts.equippedWeaponId,
    weapons,
    optConfig: opts.optConfig,
    arts: opts.arts,
    maxWorkers: opts.maxWorkers,
    condFor: (wk) => {
      const values = overrides[wk]
      return values
        ? { conds: listWeaponConditions(wk, opts.data), values }
        : undefined
    },
    onProgress: ({ done, total }) => {
      opts.status.tested = done
      opts.status.total = total
    },
    onRow: (row) => {
      sorted = [...sorted, row].sort(
        (a, b) => (b.value ?? -1) - (a.value ?? -1)
      )
      publish(
        opts.database,
        opts.optConfigId,
        opts.optConfig.maxBuildsToShow,
        sorted
      )
    },
    registerCancel: opts.registerCancel,
    isCancelled: opts.isCancelled,
  })
}
