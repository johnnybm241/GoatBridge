export interface TeamMatchPlayer {
  userId: string;
  displayName: string;
}

export interface TeamMatchBoardResult {
  boardNumber: number;
  t1NsSigned: number | null;
  t2NsSigned: number | null;
  impsTeam1: number | null;
}

export interface TeamMatchState {
  matchCode: string;
  name: string;
  hostUserId: string;
  boardCount: number;
  status: 'lobby' | 'in_progress' | 'complete';
  team1Name: string;
  team2Name: string;
  team1Players: TeamMatchPlayer[];
  team2Players: TeamMatchPlayer[];
  table1RoomCode: string | null;
  table2RoomCode: string | null;
  boardResults: TeamMatchBoardResult[];
  totalImpsTeam1: number;
  totalImpsTeam2: number;
  createdAt: number;
}
