export interface ClientCard {
  id: string
  name: string
  status: 'active' | 'pending'
  nextSessionDate: string | null
  lastLogDate: string | null
  daysLastLog: number | null
  checkinTotal: number
  checkinCompleted: number
  isFlagged: boolean
  flagReason?: string
  cycleId: string | null
}

const today = new Date()
const daysAgo = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
const daysFromNow = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export const MOCK_CLIENTS: ClientCard[] = [
  {
    id: 'c1',
    name: 'Sarah M.',
    status: 'active',
    nextSessionDate: daysFromNow(2),
    lastLogDate: daysAgo(0),
    daysLastLog: 0,
    checkinTotal: 7,
    checkinCompleted: 2,
    isFlagged: true,
    flagReason: 'Mood score of 2 logged yesterday',
    cycleId: 'cy1',
  },
  {
    id: 'c2',
    name: 'Marcus T.',
    status: 'active',
    nextSessionDate: daysFromNow(3),
    lastLogDate: daysAgo(1),
    daysLastLog: 1,
    checkinTotal: 7,
    checkinCompleted: 6,
    isFlagged: false,
    cycleId: 'cy2',
  },
  {
    id: 'c3',
    name: 'Priya K.',
    status: 'active',
    nextSessionDate: daysFromNow(5),
    lastLogDate: daysAgo(3),
    daysLastLog: 3,
    checkinTotal: 7,
    checkinCompleted: 4,
    isFlagged: false,
    cycleId: 'cy3',
  },
  {
    id: 'c4',
    name: 'James R.',
    status: 'active',
    nextSessionDate: daysFromNow(7),
    lastLogDate: daysAgo(0),
    daysLastLog: 0,
    checkinTotal: 7,
    checkinCompleted: 7,
    isFlagged: false,
    cycleId: 'cy4',
  },
  {
    id: 'c5',
    name: 'Anika W.',
    status: 'active',
    nextSessionDate: daysFromNow(10),
    lastLogDate: daysAgo(5),
    daysLastLog: 5,
    checkinTotal: 7,
    checkinCompleted: 1,
    isFlagged: true,
    flagReason: 'Client marked an entry as urgent',
    cycleId: 'cy5',
  },
  {
    id: 'c6',
    name: 'David L.',
    status: 'pending',
    nextSessionDate: null,
    lastLogDate: null,
    daysLastLog: null,
    checkinTotal: 0,
    checkinCompleted: 0,
    isFlagged: false,
    cycleId: null,
  },
]
