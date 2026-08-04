export const GRADES = [
  { id: "p1", label: "一年级", shortLabel: "小一", stage: "小学" },
  { id: "p2", label: "二年级", shortLabel: "小二", stage: "小学" },
  { id: "p3", label: "三年级", shortLabel: "小三", stage: "小学" },
  { id: "p4", label: "四年级", shortLabel: "小四", stage: "小学" },
  { id: "p5", label: "五年级", shortLabel: "小五", stage: "小学" },
  { id: "p6", label: "六年级", shortLabel: "小六", stage: "小学" },
  { id: "j1", label: "初一", shortLabel: "初一", stage: "初中" },
  { id: "j2", label: "初二", shortLabel: "初二", stage: "初中" },
  { id: "j3", label: "初三", shortLabel: "初三", stage: "初中" },
  { id: "h1", label: "高一", shortLabel: "高一", stage: "高中" },
  { id: "h2", label: "高二", shortLabel: "高二", stage: "高中" },
  { id: "h3", label: "高三", shortLabel: "高三", stage: "高中" },
] as const;

export type GradeCode = (typeof GRADES)[number]["id"];
export type SchoolStage = (typeof GRADES)[number]["stage"];

export const GRADE_GROUPS = [
  { label: "小学", gradeIds: ["p1", "p2", "p3", "p4", "p5", "p6"] },
  { label: "初中", gradeIds: ["j1", "j2", "j3"] },
  { label: "高中", gradeIds: ["h1", "h2", "h3"] },
] as const satisfies ReadonlyArray<{ label: SchoolStage; gradeIds: readonly GradeCode[] }>;

export const SUBJECTS = {
  chinese: { label: "语文", glyph: "文" },
  math: { label: "数学", glyph: "数" },
  english: { label: "英语", glyph: "英" },
  science: { label: "科学", glyph: "科" },
  moral: { label: "道德与法治", glyph: "德" },
  physics: { label: "物理", glyph: "物" },
  chemistry: { label: "化学", glyph: "化" },
  biology: { label: "生物", glyph: "生" },
  history: { label: "历史", glyph: "史" },
  geography: { label: "地理", glyph: "地" },
  politics: { label: "思想政治", glyph: "政" },
} as const;

export type SubjectCode = keyof typeof SUBJECTS;

const PRIMARY_SUBJECTS = ["chinese", "math", "english", "science", "moral"] as const;
const JUNIOR_BASE_SUBJECTS = [
  "chinese",
  "math",
  "english",
  "moral",
  "history",
  "geography",
  "biology",
] as const;
const HIGH_SCHOOL_SUBJECTS = [
  "chinese",
  "math",
  "english",
  "physics",
  "chemistry",
  "biology",
  "history",
  "geography",
  "politics",
] as const;

export const SUBJECTS_BY_GRADE: Record<GradeCode, readonly SubjectCode[]> = {
  p1: PRIMARY_SUBJECTS,
  p2: PRIMARY_SUBJECTS,
  p3: PRIMARY_SUBJECTS,
  p4: PRIMARY_SUBJECTS,
  p5: PRIMARY_SUBJECTS,
  p6: PRIMARY_SUBJECTS,
  j1: JUNIOR_BASE_SUBJECTS,
  j2: [...JUNIOR_BASE_SUBJECTS, "physics"],
  j3: [...JUNIOR_BASE_SUBJECTS, "physics", "chemistry"],
  h1: HIGH_SCHOOL_SUBJECTS,
  h2: HIGH_SCHOOL_SUBJECTS,
  h3: HIGH_SCHOOL_SUBJECTS,
};

export type TextbookOption = { id: string; label: string };

const OTHER_TEXTBOOK: TextbookOption = { id: "other", label: "其他 / 暂不确定" };

const TEXTBOOKS: Record<
  SubjectCode,
  Partial<Record<SchoolStage, readonly TextbookOption[]>>
> = {
  chinese: {
    小学: [{ id: "unified-pep", label: "统编版（人民教育出版社）" }],
    初中: [{ id: "unified-pep", label: "统编版（人民教育出版社）" }],
    高中: [
      { id: "unified-2019", label: "统编版（2019）" },
      { id: "shanghai", label: "沪教版" },
    ],
  },
  math: {
    小学: [
      { id: "pep", label: "人教版" },
      { id: "bnu", label: "北师大版" },
      { id: "jiangsu", label: "苏教版" },
      { id: "qingdao", label: "青岛版" },
      { id: "hebei", label: "冀教版" },
      { id: "southwest", label: "西师大版" },
      { id: "beijing", label: "北京版" },
      { id: "shanghai", label: "沪教版" },
    ],
    初中: [
      { id: "pep", label: "人教版" },
      { id: "bnu", label: "北师大版" },
      { id: "ecnup", label: "华师大版" },
      { id: "jiangsu-science", label: "苏科版" },
      { id: "zhejiang", label: "浙教版" },
      { id: "hunan", label: "湘教版" },
      { id: "hebei", label: "冀教版" },
      { id: "anhui", label: "沪科版" },
    ],
    高中: [
      { id: "pep-a", label: "人教 A 版" },
      { id: "pep-b", label: "人教 B 版" },
      { id: "bnu-2019", label: "北师大版（2019）" },
      { id: "jiangsu", label: "苏教版" },
      { id: "hunan", label: "湘教版" },
      { id: "shanghai", label: "沪教版" },
    ],
  },
  english: {
    小学: [
      { id: "pep", label: "人教 PEP 版" },
      { id: "foreign-research", label: "外研版" },
      { id: "yilin", label: "译林版" },
      { id: "oxford-shanghai", label: "牛津上海版" },
      { id: "beijing", label: "北京版" },
      { id: "hebei", label: "冀教版" },
    ],
    初中: [
      { id: "pep", label: "人教版" },
      { id: "foreign-research", label: "外研版" },
      { id: "yilin-oxford", label: "译林牛津版" },
      { id: "oxford-shanghai", label: "沪教牛津版" },
      { id: "bnu", label: "北师大版" },
      { id: "hebei", label: "冀教版" },
    ],
    高中: [
      { id: "pep-2019", label: "人教版（2019）" },
      { id: "foreign-research-2019", label: "外研版（2019）" },
      { id: "yilin-2020", label: "译林版（2020）" },
      { id: "bnu-2019", label: "北师大版（2019）" },
      { id: "shanghai", label: "沪教版" },
    ],
  },
  science: {
    小学: [
      { id: "education-science", label: "教科版" },
      { id: "jiangsu", label: "苏教版" },
      { id: "pep-hubei", label: "人教鄂教版" },
      { id: "qingdao", label: "青岛版" },
      { id: "hunan", label: "湘科版" },
      { id: "guangdong", label: "粤教科技版" },
    ],
  },
  moral: {
    小学: [{ id: "unified-pep", label: "统编版（人民教育出版社）" }],
    初中: [{ id: "unified-pep", label: "统编版（人民教育出版社）" }],
  },
  physics: {
    初中: [
      { id: "pep", label: "人教版" },
      { id: "shanghai-science", label: "沪科版" },
      { id: "education-science", label: "教科版" },
      { id: "jiangsu-science", label: "苏科版" },
      { id: "bnu", label: "北师大版" },
    ],
    高中: [
      { id: "pep-2019", label: "人教版（2019）" },
      { id: "shandong-2019", label: "鲁科版（2019）" },
      { id: "guangdong-2019", label: "粤教版（2019）" },
      { id: "shanghai-science", label: "沪科版" },
    ],
  },
  chemistry: {
    初中: [
      { id: "pep", label: "人教版" },
      { id: "shanghai", label: "沪教版" },
      { id: "shandong", label: "鲁教版" },
      { id: "science-guangdong", label: "科粤版" },
    ],
    高中: [
      { id: "pep-2019", label: "人教版（2019）" },
      { id: "shandong-2019", label: "鲁科版（2019）" },
      { id: "jiangsu-2019", label: "苏教版（2019）" },
    ],
  },
  biology: {
    初中: [
      { id: "pep", label: "人教版" },
      { id: "jiangsu", label: "苏教版" },
      { id: "bnu", label: "北师大版" },
      { id: "jinan", label: "济南版" },
    ],
    高中: [
      { id: "pep-2019", label: "人教版（2019）" },
      { id: "zhejiang-2019", label: "浙科版（2019）" },
    ],
  },
  history: {
    初中: [{ id: "unified-pep", label: "统编版（人民教育出版社）" }],
    高中: [{ id: "unified-2019", label: "统编版（2019）" }],
  },
  geography: {
    初中: [
      { id: "pep", label: "人教版" },
      { id: "hunan", label: "湘教版" },
      { id: "commerce-star", label: "商务星球版" },
      { id: "sinomap", label: "中图版" },
    ],
    高中: [
      { id: "pep-2019", label: "人教版（2019）" },
      { id: "hunan-2019", label: "湘教版（2019）" },
      { id: "sinomap-2019", label: "中图版（2019）" },
      { id: "shandong-2019", label: "鲁教版（2019）" },
    ],
  },
  politics: {
    高中: [{ id: "unified-2019", label: "统编版（2019）" }],
  },
};

export function isGradeCode(value: string): value is GradeCode {
  return GRADES.some((grade) => grade.id === value);
}

export function isSubjectCode(value: string): value is SubjectCode {
  return Object.hasOwn(SUBJECTS, value);
}

export function getGrade(gradeCode: GradeCode) {
  return GRADES.find((grade) => grade.id === gradeCode)!;
}

export function getSubjectsForGrade(gradeCode: GradeCode) {
  return SUBJECTS_BY_GRADE[gradeCode];
}

export function getTextbooksForSubject(gradeCode: GradeCode, subjectCode: SubjectCode) {
  const stage = getGrade(gradeCode).stage;
  return [...(TEXTBOOKS[subjectCode][stage] ?? []), OTHER_TEXTBOOK];
}

export function getTextbookLabel(
  gradeCode: GradeCode,
  subjectCode: SubjectCode,
  textbookId: string,
) {
  return getTextbooksForSubject(gradeCode, subjectCode).find(
    (textbook) => textbook.id === textbookId,
  )?.label;
}
