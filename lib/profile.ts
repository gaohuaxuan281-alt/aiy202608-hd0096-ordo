import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";
import { DEFAULT_USER_PROFILE, type UserProfile } from "./profile-types";

type UserProfileRow = {
  displayName: string;
  studyStage: UserProfile["studyStage"];
  school: string;
  updatedAt: number;
};

export async function getUserProfile(userId: string): Promise<UserProfile> {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      display_name AS displayName,
      study_stage AS studyStage,
      school,
      updated_at AS updatedAt
    FROM user_profiles
    WHERE user_id = ?
    LIMIT 1`)
    .bind(userId)
    .first<UserProfileRow>();

  return row ?? { ...DEFAULT_USER_PROFILE };
}

export async function saveUserProfile(
  userId: string,
  profile: Omit<UserProfile, "updatedAt">,
): Promise<UserProfile> {
  await ensureAuthSchema();
  const updatedAt = Date.now();
  await getD1()
    .prepare(`INSERT INTO user_profiles (
      user_id, display_name, study_stage, school, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      study_stage = excluded.study_stage,
      school = excluded.school,
      updated_at = excluded.updated_at`)
    .bind(userId, profile.displayName, profile.studyStage, profile.school, updatedAt)
    .run();

  return { ...profile, updatedAt };
}
