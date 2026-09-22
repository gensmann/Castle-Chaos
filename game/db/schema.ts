import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  state: text("state").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id").primaryKey(),
    playerId: text("player_id").notNull(),
    roomCode: text("room_code").notNull(),
    displayName: text("display_name").notNull(),
  },
  (t) => [index("idx_profiles_room").on(t.roomCode)],
);
