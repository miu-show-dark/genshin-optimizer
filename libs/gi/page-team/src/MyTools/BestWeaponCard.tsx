/**
 * MyTools – thẻ "Vũ khí tốt nhất" trong tab Optimize.
 * Chạy tối ưu thánh di vật cho TỪNG vũ khí ứng viên (cùng mục tiêu, bộ lọc,
 * kho thánh di vật với nút Generate) rồi xếp hạng vũ khí theo build tốt nhất.
 */

import { useDataManagerValues } from '@genshin-optimizer/common/database-ui'
import { CardThemed, ImgIcon } from '@genshin-optimizer/common/ui'
import { objKeyMap } from '@genshin-optimizer/common/util'
import { weaponAsset } from '@genshin-optimizer/gi/assets'
import { allArtifactSlotKeys } from '@genshin-optimizer/gi/consts'
import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import {
  TeamCharacterContext,
  useDatabase,
  useDBMeta,
} from '@genshin-optimizer/gi/db-ui'
import { getCharStat, getWeaponStat } from '@genshin-optimizer/gi/stats'
import { DataContext, useNumWorkers } from '@genshin-optimizer/gi/ui'
import {
  Alert,
  Box,
  Button,
  CardContent,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useContext, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BestWeaponProgress, BestWeaponRow } from './bestWeapon'
import { runBestWeaponSearch } from './bestWeapon'
import { formatPct, formatValue } from './format'
import {
  listWeaponConditions,
  loadWeaponCondOverrides,
} from './weaponConditions'

export default function BestWeaponCard({
  optConfig,
  getArts,
  disabled,
}: {
  optConfig: OptConfig
  /** Lấy kho thánh di vật theo đúng bộ lọc hiện tại của tab Optimize */
  getArts: (cfg: OptConfig) => ICachedArtifact[]
  /** Đang chạy Generate bình thường */
  disabled: boolean
}) {
  const { t } = useTranslation(['weaponNames_gen'])
  const database = useDatabase()
  const { gender } = useDBMeta()
  const { teamId, teamCharId, teamChar, loadoutDatum } =
    useContext(TeamCharacterContext)
  const { data } = useContext(DataContext)
  const [maxWorkers] = useNumWorkers()
  const characterKey = teamChar.key

  const [rows, setRows] = useState<BestWeaponRow[]>([])
  const [progress, setProgress] = useState<BestWeaponProgress>()
  const [running, setRunning] = useState(false)
  const cancelled = useRef(false)
  const cancelSolver = useRef<() => void>(() => {})

  const equippedWeapon = database.teams.getLoadoutWeapon(loadoutDatum)
  // Vũ khí THẬT trong kho của bạn, cùng loại với nhân vật
  const allWeapons = useDataManagerValues(database.weapons)
  const weaponType = getCharStat(characterKey).weaponType
  const candidates = useMemo(
    () =>
      allWeapons.filter((w) => getWeaponStat(w.key)?.weaponType === weaponType),
    [allWeapons, weaponType]
  )

  // Đưa kết quả vào danh sách build của GO (hiện đủ vũ khí + 5 thánh di vật,
  // có nút Equip to Current Build) thay vì chỉ hiện bảng xếp hạng.
  const publishBuilds = (sorted: BestWeaponRow[]) => {
    const builds = sorted
      .filter((r) => r.value !== undefined)
      .slice(0, optConfig.maxBuildsToShow)
      .map((r) => ({
        weaponId: r.weaponId,
        artifactIds: objKeyMap(
          allArtifactSlotKeys,
          (slot) => r.artifactIds[slot]
        ),
      }))
    if (builds.length)
      database.optConfigs.newOrSetGeneratedBuildList(teamChar.optConfigId, {
        builds,
        buildDate: Date.now(),
      })
  }

  const canRun = !!optConfig.optimizationTarget?.length && !disabled

  const run = async () => {
    cancelled.current = false
    setRunning(true)
    setRows([])
    const overrides = loadWeaponCondOverrides(teamCharId)
    try {
      const result = await runBestWeaponSearch({
        database,
        teamId,
        teamCharId,
        gender,
        characterKey,
        equippedWeaponId: equippedWeapon?.id,
        weapons: candidates,
        optConfig,
        arts: getArts(optConfig),
        maxWorkers,
        condFor: (wk) => {
          const values = overrides[wk]
          return values
            ? { conds: listWeaponConditions(wk, data), values }
            : undefined
        },
        onProgress: setProgress,
        onRow: (row) =>
          setRows((r) => {
            const next = [...r, row].sort(
              (a, b) => (b.value ?? -1) - (a.value ?? -1)
            )
            publishBuilds(next)
            return next
          }),
        registerCancel: (c) => (cancelSolver.current = c),
        isCancelled: () => cancelled.current,
      })
      setRows(result)
      publishBuilds(result)
    } finally {
      setRunning(false)
      setProgress(undefined)
    }
  }
  const cancel = () => {
    cancelled.current = true
    cancelSolver.current()
  }

  const base = rows.find((r) => r.isEquipped)?.value
  const best = rows[0]?.value

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontWeight: 'bold' }}>
          Vũ khí tốt nhất (tối ưu thánh di vật cho từng vũ khí)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Thử TỪNG vũ khí bạn đang có trong kho (đúng cấp, tinh luyện thật), mỗi
          cái chạy tối ưu thánh di vật đầy đủ theo mục tiêu, bộ lọc và kho thánh
          di vật ở trên, rồi xếp hạng. Kết quả hiện ngay ở danh sách build bên
          dưới (đủ vũ khí + 5 thánh di vật, có nút Equip to Current Build). Vũ
          khí đang cầm là mốc so sánh. Điều kiện passive lấy từ tab So vũ khí
          (nếu bạn đã chọn).
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
          <Button
            variant="contained"
            color={running ? 'error' : 'success'}
            disabled={!running && !canRun}
            onClick={running ? cancel : run}
          >
            {running
              ? 'Dừng'
              : `Tìm vũ khí tốt nhất (${candidates.length} vũ khí của bạn)`}
          </Button>
        </Box>
        {!optConfig.optimizationTarget?.length && (
          <Alert severity="info">Chọn mục tiêu tối ưu trước.</Alert>
        )}
        {running && progress && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={(progress.done / Math.max(1, progress.total)) * 100}
            />
            <Typography variant="caption">
              {progress.done}/{progress.total}
              {progress.current
                ? ` – đang tối ưu ${t(`weaponNames_gen:${progress.current}`)}`
                : ''}
            </Typography>
          </Box>
        )}
        {rows.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Vũ khí</TableCell>
                <TableCell align="right">Build tốt nhất</TableCell>
                <TableCell align="right">% so với tốt nhất</TableCell>
                <TableCell align="right">% so với đang cầm</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={row.weaponId} selected={row.isEquipped}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <ImgIcon
                        size={2}
                        src={weaponAsset(row.weaponKey, true)}
                      />
                      {t(`weaponNames_gen:${row.weaponKey}`)} Lv.{row.level} R
                      {row.refinement}
                      {row.isEquipped
                        ? ' (đang cầm)'
                        : row.location
                          ? ` (${row.location})`
                          : ''}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{formatValue(row.value)}</TableCell>
                  <TableCell align="right">
                    {formatPct(row.value, best)}
                  </TableCell>
                  <TableCell align="right">
                    {formatPct(row.value, base)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </CardThemed>
  )
}
