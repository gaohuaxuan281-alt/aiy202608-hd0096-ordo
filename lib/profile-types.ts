export const STUDY_STAGES = [
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
  "高三",
  "大学",
  "其他",
] as const;

export type StudyStage = (typeof STUDY_STAGES)[number] | "";

export type UserProfile = {
  displayName: string;
  studyStage: StudyStage;
  school: string;
  updatedAt: number | null;
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: "知序同学",
  studyStage: "",
  school: "",
  updatedAt: null,
};
