/**
 * MyTools – tối ưu thánh di vật CHO TỪNG VŨ KHÍ rồi xếp hạng vũ khí.
 *
 * Với mỗi vũ khí ứng viên, chạy đúng bộ giải (GOSolver) của tab Optimize với
 * cùng mục tiêu, bộ lọc chỉ số và kho thánh di vật, chỉ khác vũ khí được giả lập
 * (không ghi vào database). Kết quả = build tốt nhất của từng vũ khí.
 */
import {
  layeredAssignment,
  objKeyMap,
  objPathValue,
} from '@genshin-optimizer/common/util'
import type {
  CharacterKey,
  GenderKey,
  RefinementKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
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
import type { OptProblemInput } from '@genshin-optimizer/gi/solver'
import { GOSolver } from '@genshin-optimizer/gi/solver'
import { compactArtifacts } from '@genshin-optimizer/gi/solver-tc'
import { getTeamData, statFilterToNumNode } from '@genshin-optimizer/gi/ui'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { Data, NumNode } from '@genshin-optimizer/gi/wr'
import {
  constant,
  dynamicData,
  mergeData,
  optimize,
} from '@genshin-optimizer/gi/wr'
import type { WeaponCondDef, WeaponCondValues } from './weaponConditions'

export type BestWeaponRow = {
  weaponKey: WeaponKey
  /** id vũ khí trong database của bạn */
  weaponId: string
  level: number
  refinement: RefinementKey
  /** Nhân vật đang cầm vũ khí này ('' = không ai) */
  location: string
  /** Giá trị mục tiêu của build tốt nhất với vũ khí này (undefined = không có build hợp lệ) */
  value: number | undefined
  artifactIds: Partial<Record<(typeof allArtifactSlotKeys)[number], string>>
  isEquipped: boolean
}

export type BestWeaponProgress = {
  done: number
  total: number
  current?: WeaponKey
}

/** Dữ liệu tính toán dành cho worker, khi nhân vật cầm `weapon` (và điều kiện tùy chọn). */
function workerDataFor(
  database: ArtCharDatabase,
  teamId: string,
  teamCharId: string,
  gender: GenderKey,
  characterKey: CharacterKey,
  mainStatAssumptionLevel: number,
  weapon: ICachedWeapon | undefined,
  condValues?: { conds: WeaponCondDef[]; values: WeaponCondValues }
): Data | undefined {
  const activeChar = database.teams.getActiveTeamChar(teamId)
  const bundle = getTeamData(
    database,
    teamId,
    teamCharId,
    mainStatAssumptionLevel,
    [],
    weapon
  )
  if (!activeChar || !bundle?.teamData) return undefined
  if (weapon && condValues) {
    const charData = bundle.teamData[characterKey] as Data[] | undefined
    if (!charData) return undefined
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
  }
  return uiDataForTeam(bundle.teamData, gender, activeChar.key)[characterKey]
    ?.target.data[0]
}

/** Chạy bộ giải một lần cho một vũ khí, trả về build tốt nhất. */
async function solveOne(opts: {
  workerData: Data
  optConfig: OptConfig
  arts: ICachedArtifact[]
  database: ArtCharDatabase
  maxWorkers: number
  registerCancel: (cancel: () => void) => void
}) {
  const { optConfig, arts, database, maxWorkers } = opts
  const {
    optimizationTarget,
    statFilters,
    mainStatAssumptionLevel,
    allowPartial,
  } = optConfig
  const workerData = opts.workerData
  Object.assign(workerData, mergeData([workerData, dynamicData]))
  const targetNode = objPathValue(
    workerData.display ?? {},
    optimizationTarget!
  ) as NumNode | undefined
  if (!targetNode) return undefined
  const valueFilter = statFilterToNumNode(workerData, statFilters)
  const nodes = optimize(
    [...valueFilter.map((x) => x.value), targetNode],
    workerData,
    ({ path: [p] }) => p !== 'dyn'
  )
  const optimized = nodes.pop()!
  const problem: OptProblemInput = {
    arts: compactArtifacts(arts, mainStatAssumptionLevel, allowPartial),
    optimizationTarget: optimized,
    exclusion: optConfig.artSetExclusion,
    constraints: nodes.map((value, i) => ({
      value,
      min: valueFilter[i].minimum,
    })),
    topN: 1,
    plotBase: undefined,
  }
  const status = {
    tested: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    testedPerSecond: 0,
    skippedPerSecond: 0,
    startTime: performance.now(),
  }
  const solver = new GOSolver(problem, status, maxWorkers)
  opts.registerCancel(() => solver.cancel(new Error('cancelled')))
  try {
    const results = await solver.solve()
    const best = results
      .flatMap((r) => r.builds)
      .sort((a, b) => b.value - a.value)[0]
    if (!best) return undefined
    return {
      value: best.value,
      artifactIds: objKeyMap(allArtifactSlotKeys, (slot) =>
        best.artifactIds.find(
          (id: string) => database.arts.get(id)?.slotKey === slot
        )
      ) as BestWeaponRow['artifactIds'],
    }
  } finally {
    solver.cancel()
  }
}

/**
 * Tìm vũ khí tốt nhất: với mỗi vũ khí chạy tối ưu thánh di vật đầy đủ.
 * Chỉ dùng vũ khí thật trong kho của bạn, giữ nguyên cấp/tinh luyện.
 */
export async function runBestWeaponSearch(opts: {
  database: ArtCharDatabase
  teamId: string
  teamCharId: string
  gender: GenderKey
  characterKey: CharacterKey
  /** id vũ khí đang cầm của loadout (làm mốc) */
  equippedWeaponId: string | undefined
  /** Vũ khí THẬT của bạn để thử (đúng cấp, tinh luyện) */
  weapons: ICachedWeapon[]
  optConfig: OptConfig
  arts: ICachedArtifact[]
  maxWorkers: number
  condFor: (
    wk: WeaponKey
  ) => { conds: WeaponCondDef[]; values: WeaponCondValues } | undefined
  onProgress?: (p: BestWeaponProgress) => void
  /** Được gọi mỗi khi có thêm một vũ khí xong, để hiện kết quả dần dần */
  onRow?: (row: BestWeaponRow) => void
  registerCancel: (cancel: () => void) => void
  isCancelled: () => boolean
}): Promise<BestWeaponRow[]> {
  const rows: BestWeaponRow[] = []
  const list = opts.weapons.map((real) => {
    const equipped = real.id === opts.equippedWeaponId
    return {
      wk: real.key,
      real,
      equipped,
      // Vũ khí đang cầm: tính như bình thường. Còn lại: giả lập nhân vật cầm nó.
      weapon: equipped
        ? undefined
        : { ...real, location: charKeyToLocCharKey(opts.characterKey) },
    }
  })
  for (let i = 0; i < list.length; i++) {
    if (opts.isCancelled()) break
    const { wk, weapon, equipped, real } = list[i]
    opts.onProgress?.({ done: i, total: list.length, current: wk })
    const workerData = workerDataFor(
      opts.database,
      opts.teamId,
      opts.teamCharId,
      opts.gender,
      opts.characterKey,
      opts.optConfig.mainStatAssumptionLevel,
      weapon,
      weapon ? opts.condFor(wk) : undefined
    )
    let res: Awaited<ReturnType<typeof solveOne>>
    try {
      res = workerData
        ? await solveOne({
            workerData,
            optConfig: opts.optConfig,
            arts: opts.arts,
            database: opts.database,
            maxWorkers: opts.maxWorkers,
            registerCancel: opts.registerCancel,
          })
        : undefined
    } catch (e) {
      if (opts.isCancelled()) break
      console.error(`[MyTools] Lỗi khi tối ưu vũ khí ${wk}`, e)
      res = undefined
    }
    const row: BestWeaponRow = {
      weaponKey: wk,
      weaponId: real.id,
      level: real.level,
      refinement: real.refinement,
      location: real.location,
      value: res?.value,
      artifactIds: res?.artifactIds ?? {},
      isEquipped: equipped,
    }
    rows.push(row)
    opts.onRow?.(row)
  }
  opts.onProgress?.({ done: list.length, total: list.length })
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
}
