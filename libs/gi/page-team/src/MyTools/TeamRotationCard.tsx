/**
 * MyTools – Thẻ "Rotation team" hiển thị trong trang cài đặt team.
 * Tổng hợp avg dmg 1 vòng của từng nhân vật (từ Custom Multi Target), tính DPS team.
 */
import { CardThemed } from '@genshin-optimizer/common/ui'
import { useDatabase, useDBMeta } from '@genshin-optimizer/gi/db-ui'
import type { TeamData } from '@genshin-optimizer/gi/ui'
import { CharacterName, CharIconSide } from '@genshin-optimizer/gi/ui'
import {
  Alert,
  Box,
  Button,
  CardContent,
  FormControl,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatValue } from './format'
import type { RotationSettings } from './teamRotation'
import {
  computeTeamRotation,
  loadRotationSettings,
  saveRotationSettings,
} from './teamRotation'

export default function TeamRotationCard({
  teamId,
  teamData,
}: {
  teamId: string
  /** Truyền vào để thẻ tự tính lại mỗi khi dữ liệu team thay đổi */
  teamData?: TeamData
}) {
  const database = useDatabase()
  const { gender } = useDBMeta()
  const navigate = useNavigate()

  const [settings, setSettings] = useState<RotationSettings>(() =>
    loadRotationSettings(teamId)
  )
  useEffect(() => setSettings(loadRotationSettings(teamId)), [teamId])
  const updateSettings = (s: RotationSettings) => {
    setSettings(s)
    saveRotationSettings(teamId, s)
  }

  const rows = useMemo(
    () => computeTeamRotation(database, teamId, gender, settings),
    // teamData đổi => dữ liệu team (build, buff, multi-target) đã đổi => tính lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [database, teamId, gender, settings, teamData]
  )

  const total = rows.reduce((sum, r) => sum + (r.damage ?? 0), 0)
  const dps = settings.rotationSec > 0 ? total / settings.rotationSec : 0

  return (
    <CardThemed bgt="light">
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6">Rotation team (avg dmg)</Typography>
        <Alert severity="info">
          Với mỗi nhân vật, tạo một Custom Multi Target mô tả combo của họ trong
          1 vòng rotation (trọng số = số lần đòn đó trúng), rồi chọn nó ở bảng
          dưới. Sát thương là giá trị trung bình có tính crit. Buff được coi là
          bật suốt vòng nếu bạn đã bật nó, nên với buff ngắn hãy tách đòn có
          buff và không buff thành các dòng riêng trong multi-target.
        </Alert>

        <TextField
          size="small"
          type="number"
          label="Thời gian 1 vòng rotation (giây)"
          value={settings.rotationSec}
          inputProps={{ min: 1, step: 0.5 }}
          sx={{ maxWidth: 280 }}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v > 0) updateSettings({ ...settings, rotationSec: v })
          }}
        />

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nhân vật</TableCell>
                <TableCell>Combo (Custom Multi Target)</TableCell>
                <TableCell align="right">Sát thương / vòng</TableCell>
                <TableCell align="right">DPS</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Tỷ trọng</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const cmts =
                  database.teamChars.get(row.teamCharId)?.customMultiTargets ??
                  []
                const share = total && row.damage ? row.damage / total : 0
                return (
                  <TableRow key={row.teamCharId}>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <CharIconSide characterKey={row.characterKey} />
                        <CharacterName
                          characterKey={row.characterKey}
                          gender={gender}
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <Select
                          value={row.targetIndex}
                          onChange={(e) =>
                            updateSettings({
                              ...settings,
                              picks: {
                                ...settings.picks,
                                [row.teamCharId]: Number(e.target.value),
                              },
                            })
                          }
                        >
                          <MenuItem value={-1}>
                            <em>Không tính (support thuần)</em>
                          </MenuItem>
                          {cmts.map((cmt, i) => (
                            <MenuItem key={i} value={i}>
                              {cmt.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="right">
                      {formatValue(row.damage)}
                    </TableCell>
                    <TableCell align="right">
                      {row.damage !== undefined && settings.rotationSec > 0
                        ? formatValue(row.damage / settings.rotationSec)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Box
                          sx={{
                            height: 8,
                            borderRadius: 1,
                            bgcolor: 'primary.main',
                            width: `${Math.round(share * 100)}%`,
                            minWidth: share ? 4 : 0,
                          }}
                        />
                        <Typography variant="caption">
                          {(share * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        color="info"
                        onClick={() =>
                          navigate(`/teams/${teamId}/${row.characterKey}`)
                        }
                      >
                        Sửa combo
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>

        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <Typography>
            Tổng sát thương / vòng: <strong>{formatValue(total)}</strong>
          </Typography>
          <Typography>
            DPS team: <strong>{formatValue(dps)}</strong>
          </Typography>
        </Box>
      </CardContent>
    </CardThemed>
  )
}
