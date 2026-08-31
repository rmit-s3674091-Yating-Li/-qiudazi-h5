import type {
  Event,
  EventConfig,
  Player,
  Profile,
  Snapshot,
} from "../domain/types";
export interface Filters {
  match_type?: string;
  level?: string;
  event_date?: string;
  status?: string;
  mine?: boolean;
  scope?: string;
}
export interface TournamentRepository {
  profile(): Promise<Profile>;
  completeProfile(name: string, avatarPath: string | null): Promise<Profile>;
  players(): Promise<Player[]>;
  savePlayer(
    id: string | null,
    name: string,
    avatarPath: string | null,
    version?: number,
  ): Promise<Player>;
  deletePlayer(id: string): Promise<void>;
  events(filters?: Filters): Promise<Event[]>;
  event(id: string): Promise<Snapshot>;
  saveEvent(
    id: string | null,
    config: EventConfig,
    version?: number,
  ): Promise<Event>;
  deleteEvent(id: string, version: number): Promise<void>;
}
