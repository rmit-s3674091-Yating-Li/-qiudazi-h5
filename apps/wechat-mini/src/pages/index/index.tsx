import { useState } from 'react'
import { useRouter } from '@tarojs/taro'
import { View, Text, Button, Map } from '@tarojs/components'
import { addPoint, initialScore } from '../../shared-domain/ScoringEngine.ts'
import type { Rules } from '../../shared-domain/types.ts'
import { isValidQuickGroupConfig } from '../../shared-domain/QuickGroupConfig.ts'
import { encodeMiniPath } from '../../core/navigation.ts'
import { decodeMiniLaunchIntent } from '../../core/launch-intent.ts'

const mockRules: Rules = {
  best_of: 1, scoring_type: 'points_11', custom_games_target: null,
  tiebreak_trigger: null, game_scoring: 'advantage',
}

export default function Index() {
  const router = useRouter()
  const receivedIntent = decodeMiniLaunchIntent(router.path, router.params)
  const [score, setScore] = useState(initialScore)
  const add = (side: 'A' | 'B') => {
    if (!score.winner) setScore(previous => addPoint(mockRules, previous, side))
  }
  return <View className='poc'>
    <View className='card'>
      <View className='title'>球搭子 · 小程序离线 PoC</View>
      <View className='note'>模拟数据；没有真实微信登录、赛事写入或 Supabase Session。</View>
      <Text>11 分制记分：{score.points[0]} : {score.points[1]}</Text>
      <View><Button onClick={() => add('A')}>A 得分</Button><Button onClick={() => add('B')}>B 得分</Button></View>
      <Text>胜方：{score.winner ?? '未结束'}</Text>
    </View>
    <View className='card'>
      <Text>Quick 循环+淘汰示例（8 人 / 2 组 / 每组出线 2 人）：{isValidQuickGroupConfig(8, 2, 2) ? '有效' : '无效'}</Text>
      <View className='note'>分享路径示例：{encodeMiniPath({ kind: 'event_view', eventId: 'demo-event' })}</View>
      <View className='note'>收到的模拟分享类型：{receivedIntent?.kind ?? '无有效分享参数'}</View>
      <View className='note'>仅解析导航；不会自动登录、报名、接受邀请或认领历史账号。</View>
    </View>
    <View className='card'>
      <Text>地图仅展示固定模拟位置；未启用定位、POI 搜索、网络请求。</Text>
      <Map className='mock-map' latitude={39.9} longitude={116.4} scale={11} />
      <Text>真实场馆选择：需另行真机与城市边界验收。</Text>
    </View>
  </View>
}
