/**
 * MyTools – logic tính sát thương trung bình (avg dmg) của cả team trong 1 rotation.
 *
 * Cách làm: mỗi nhân vật trong team chọn một Custom Multi Target đại diện cho
 * "combo trong 1 vòng rotation" (trọng số = số lần đánh trúng). GO đã tính sẵn
 * tổng sát thương của multi-target đó (hitMode mặc định là avgHit = sát thương
 * kỳ vọng có tính crit). Ta cộng 4 nhân vật lại rồi chia cho thời gian rotation.
 */
import type { CharacterKey, GenderKey } from '@genshin-optimizer/gi/consts'
import type { ArtCharDatabase } from '@genshin-optimizer/gi/db'
import { getTeamDataCalc } from '@genshin-optimizer/gi/ui'
import { readTargetValue } from './weaponCompare'

export type RotationSettings = {
  /** Thời gian 1 vòng rotation (giây) */
  rotationSec: number
  /** teamCharId -> chỉ số Custom Multi Target dùng làm combo (-1 = bỏ qua) */
  picks: Record<string, number>
}

const storageKey = (teamId: string) => `mytools_rotation_${teamId}`

/** Lưu cài đặt rotation trong localStorage của trình duyệt (tách khỏi database GO). */
export function loadRotationSettings(teamId: string): RotationSettings {
  try {
    const raw = localStorage.getItem(storageKey(teamId))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RotationSettings>
      return {
        rotationSec:
          typeof parsed.rotationSec === 'number' && parsed.rotationSec > 0
            ? parsed.rotationSec
            : 20,
        picks:
          parsed.picks && typeof parsed.picks === 'object' ? parsed.picks : {},
      }
    }
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh...) -> dùng mặc định
  }
  return { rotationSec: 20, picks: {} }
}

export function saveRotationSettings(teamId: string, s: RotationSettings) {
  try {
    localStorage.setItem(storageKey(teamId), JSON.stringify(s))
  } catch {
    // bỏ qua nếu không lưu được
  }
}

export type RotationRow = {
  teamCharId: string
  characterKey: CharacterKey
  targetIndex: number
  targetName?: string
  /** Tổng sát thương của nhân vật trong 1 vòng (undefined nếu chưa chọn combo) */
  damage?: number
}

/**
 * Tính sát thương mỗi nhân vật trong 1 vòng.
 * Mỗi nhân vật phải được tính riêng với chính họ là "nhân vật chính", vì GO chỉ
 * dựng Custom Multi Target cho nhân vật đang được chọn.
 */
export function computeTeamRotation(
  database: ArtCharDatabase,
  teamId: string,
  gender: GenderKey,
  settings: RotationSettings
): RotationRow[] {
  const team = database.teams.get(teamId)
  if (!team) return []
  const rows: RotationRow[] = []
  for (const loadoutDatum of team.loadoutData) {
    if (!loadoutDatum) continue
    const { teamCharId } = loadoutDatum
    const teamChar = database.teamChars.get(teamCharId)
    if (!teamChar) continue
    const cmts = teamChar.customMultiTargets
    // Mặc định: dùng multi-target đầu tiên nếu có
    const pick = settings.picks[teamCharId] ?? (cmts.length ? 0 : -1)
    const targetIndex = pick < cmts.length ? pick : -1
    let damage: number | undefined
    if (targetIndex >= 0) {
      try {
        const teamData = getTeamDataCalc(database, teamId, gender, teamCharId)
        damage = readTargetValue(teamData?.[teamChar.key]?.target, [
          'custom',
          `${targetIndex}`,
        ])
      } catch (e) {
        console.error(`[MyTools] Lỗi khi tính rotation cho ${teamChar.key}`, e)
      }
    }
    rows.push({
      teamCharId,
      characterKey: teamChar.key,
      targetIndex,
      targetName: targetIndex >= 0 ? cmts[targetIndex]?.name : undefined,
      damage,
    })
  }
  return rows
}
