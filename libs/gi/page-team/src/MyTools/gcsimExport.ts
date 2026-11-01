/**
 * MyTools – xuất đội hiện tại sang script của gcsim (https://gcsim.app).
 * Lấy nhân vật, cấp, cung mệnh, talent, vũ khí, thánh di vật đang mặc từ GO,
 * ghép với rotation ghi tắt của bạn (E, Q, N, C, NC, ...).
 */
import type { ArtifactSlotKey } from '@genshin-optimizer/gi/consts'
import { ascensionMaxLevel } from '@genshin-optimizer/gi/consts'
import type { ArtCharDatabase, ICachedArtifact } from '@genshin-optimizer/gi/db'
import { getMainStatDisplayValue } from '@genshin-optimizer/gi/util'

/** Tên nhân vật của GO khác tên trong gcsim (còn lại: viết thường, bỏ khoảng trắng). */
const charNameFix: Record<string, string> = {
  KamisatoAyaka: 'ayaka',
  KamisatoAyato: 'ayato',
  KaedeharaKazuha: 'kazuha',
  KujouSara: 'sara',
  RaidenShogun: 'raiden',
  SangonomiyaKokomi: 'kokomi',
  AratakiItto: 'itto',
  ShikanoinHeizou: 'heizou',
}

const statKeyMap: Record<string, string> = {
  hp: 'hp',
  hp_: 'hp%',
  atk: 'atk',
  atk_: 'atk%',
  def: 'def',
  def_: 'def%',
  eleMas: 'em',
  enerRech_: 'er',
  critRate_: 'cr',
  critDMG_: 'cd',
  heal_: 'heal',
  physical_dmg_: 'phys%',
  anemo_dmg_: 'anemo%',
  geo_dmg_: 'geo%',
  electro_dmg_: 'electro%',
  hydro_dmg_: 'hydro%',
  pyro_dmg_: 'pyro%',
  cryo_dmg_: 'cryo%',
  dendro_dmg_: 'dendro%',
}

export type GcsimOptions = {
  rotation: string
  duration: number
  iterations: number
  enemyResist: number
  /** Năng lượng nền nhận thêm: mỗi [min,max] giây nhận `energyAmount` */
  energyAmount: number
  energyMinSec: number
  energyMaxSec: number
  /** Luôn đủ năng lượng cho burst (nhận rất nhiều năng lượng mỗi giây) */
  alwaysFullEnergy: boolean
  /** Lặp rotation đến hết thời gian mô phỏng */
  loop: boolean
}

export type GcsimResult = { script: string; warnings: string[] }

const gcsimChar = (key: string) => charNameFix[key] ?? key.toLowerCase()
const num = (n: number) => String(Math.round(n * 10000) / 10000)

/** Cộng chỉ số chính + phụ của các thánh di vật thành dòng `add stats`. */
function artifactStats(arts: ICachedArtifact[]): string {
  const total: Record<string, number> = {}
  const add = (goKey: string, value: number) => {
    const key = statKeyMap[goKey]
    if (!key) return
    const isPercent =
      key.endsWith('%') || ['er', 'cr', 'cd', 'heal'].includes(key)
    total[key] = (total[key] ?? 0) + (isPercent ? value / 100 : value)
  }
  for (const art of arts) {
    add(
      art.mainStatKey,
      getMainStatDisplayValue(art.mainStatKey, art.rarity, art.level)
    )
    for (const sub of art.substats) if (sub.key) add(sub.key, sub.value)
  }
  return Object.entries(total)
    .map(([k, v]) => `${k}=${num(v)}`)
    .join(' ')
}

/** Dịch rotation ghi tắt sang các hành động gcsim, kèm nhân vật đang hành động. */
export function parseRotation(
  text: string,
  names: string[]
): { lines: string[]; warnings: string[] } {
  const warnings: string[] = []
  const normalized = text
    .replace(/swap/gi, ' ')
    .replace(/(?:char|nv)\s*([1-4])/gi, ' @$1 ')
    .replace(/\bc([1-4])\b/gi, ' @$1 ')
    .replace(/->|→|>/g, ' ')
  const tokens = normalized.split(/[\s,;]+/).filter(Boolean)
  let cur = 0
  let acts: string[] = []
  const lines: string[] = []
  const flush = () => {
    if (acts.length && names[cur])
      lines.push(`${names[cur]} ${acts.join(', ')};`)
    acts = []
  }
  for (const tok of tokens) {
    const sw = tok.match(/^@([1-4])$/)
    if (sw) {
      flush()
      const idx = Number(sw[1]) - 1
      if (!names[idx]) warnings.push(`Không có nhân vật ${sw[1]} trong đội`)
      else cur = idx
      continue
    }
    // Một token có thể dính nhiều đòn, ví dụ "NCE" hoặc "N3C"
    const re = /N(\d*)|C|Eh|E|Q|D|J|P|W(\d+)/gi
    let m: RegExpExecArray | null
    let consumed = 0
    while ((m = re.exec(tok))) {
      consumed += m[0].length
      const t = m[0].toUpperCase()
      if (t.startsWith('N'))
        acts.push(m[1] && m[1] !== '1' ? `attack:${m[1]}` : 'attack')
      else if (t === 'C') acts.push('charge')
      else if (t === 'EH') acts.push('skill[hold=1]')
      else if (t === 'E') acts.push('skill')
      else if (t === 'Q') acts.push('burst')
      else if (t === 'D') acts.push('dash')
      else if (t === 'J') acts.push('jump')
      else if (t === 'P') acts.push('high_plunge')
      else if (t.startsWith('W')) acts.push(`wait(${m[2]})`)
    }
    if (consumed !== tok.length)
      warnings.push(`Không hiểu "${tok}", đã bỏ qua phần không nhận ra`)
  }
  flush()
  return { lines, warnings }
}

export function buildGcsimScript(
  database: ArtCharDatabase,
  teamId: string,
  opts: GcsimOptions
): GcsimResult {
  const warnings: string[] = []
  const team = database.teams.get(teamId)
  if (!team) return { script: '', warnings: ['Không tìm thấy đội'] }
  const out: string[] = []
  const names: string[] = []
  out.push(
    `options iteration=${opts.iterations} duration=${opts.duration} swap_delay=12;`
  )
  out.push(
    `target lvl=${team.enemyOverride.enemyLevel ?? 100} resist=${opts.enemyResist} pos=0,0;`
  )
  if (opts.alwaysFullEnergy)
    out.push('energy every interval=60,60 amount=100; # luôn đủ năng lượng')
  else
    out.push(
      `energy every interval=${Math.round(opts.energyMinSec * 60)},${Math.round(opts.energyMaxSec * 60)} amount=${opts.energyAmount};`,
      ''
    )
  for (const datum of team.loadoutData) {
    if (!datum) continue
    const teamChar = database.teamChars.get(datum.teamCharId)
    const char = teamChar && database.chars.get(teamChar.key)
    if (!teamChar || !char) continue
    if (datum.buildType === 'tc') {
      warnings.push(
        `${teamChar.key}: đang dùng build Theorycraft, chưa xuất được thánh di vật (chỉ xuất nhân vật + vũ khí)`
      )
    }
    const name = gcsimChar(teamChar.key)
    if (teamChar.key.startsWith('Traveler'))
      warnings.push(
        `${teamChar.key}: tên Traveler trong gcsim có thể khác (aether/lumine); nếu gcsim báo lỗi, sửa tên "${name}" trong script`
      )
    if (char.level > 90)
      warnings.push(
        `${teamChar.key}: cấp ${char.level} vượt 90, script dùng 90 (gcsim chỉ hỗ trợ tối đa 90)`
      )
    names.push(name)
    const weapon = database.teams.getLoadoutWeapon(datum)
    const arts = (
      Object.values(database.teams.getLoadoutArtifacts(datum)) as Array<
        ICachedArtifact | undefined
      >
    ).filter((a): a is ICachedArtifact => !!a)
    out.push(
      `${name} char lvl=${Math.min(char.level, 90)}/${ascensionMaxLevel[char.ascension]} cons=${char.constellation} talent=${char.talent.auto},${char.talent.skill},${char.talent.burst};`
    )
    out.push(
      `${name} add weapon="${weapon.key.toLowerCase()}" refine=${weapon.refinement} lvl=${weapon.level}/${ascensionMaxLevel[weapon.ascension]};`
    )
    const setCount: Record<string, number> = {}
    for (const a of arts) setCount[a.setKey] = (setCount[a.setKey] ?? 0) + 1
    for (const [set, n] of Object.entries(setCount))
      if (n >= 2)
        out.push(
          `${name} add set="${set.toLowerCase()}" count=${n >= 4 ? 4 : 2};`
        )
    const stats = artifactStats(arts)
    if (stats) out.push(`${name} add stats ${stats};`)
    else if (datum.buildType !== 'tc')
      warnings.push(`${teamChar.key}: chưa mặc thánh di vật nào`)
    out.push('')
  }
  if (!names.length) return { script: '', warnings: ['Đội chưa có nhân vật'] }
  out.push(`active ${names[0]};`, '')
  const rot = parseRotation(opts.rotation, names)
  warnings.push(...rot.warnings)
  if (rot.lines.length) {
    if (opts.loop) out.push('while 1 {', ...rot.lines.map((l) => `  ${l}`), '}')
    else out.push(...rot.lines)
  } else warnings.push('Chưa có rotation, hãy ghi vào ô Rotation')
  warnings.push(
    'Tên nhân vật/vũ khí/set viết thường theo GO; nếu gcsim báo không nhận tên nào thì sửa tay tên đó trong script'
  )
  return { script: out.join('\n'), warnings }
}

export type { ArtifactSlotKey }
