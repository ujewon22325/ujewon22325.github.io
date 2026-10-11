import { z } from "zod";

export const categories = [
  "온라인쇼핑",
  "오프라인쇼핑",
  "통신비",
  "구독",
  "편의점",
  "마트",
  "음식점",
  "배달",
  "카페",
  "교통",
  "주유",
  "공과금",
  "보험",
  "상품권",
  "해외결제",
  "기타",
] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;
const money = z.number().int().min(0).max(1_000_000_000);
const validDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  s >= "1900-01-01" &&
  s <= "2100-12-31" &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export const dateSchema = z
  .string()
  .refine(validDay, "YYYY-MM-DD 형식의 유효한 날짜를 입력하세요.");
export const transactionSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().default(""),
  source: z.string().default("manual"),
  date: dateSchema,
  postedDate: dateSchema.optional(),
  merchant: z.string().min(1).max(200),
  amount: money.refine((n) => n > 0, "금액은 1원 이상이어야 합니다."),
  billingAmount: money.optional(),
  cardId: z.string(),
  category: categorySchema,
  industry: z.string().default(""),
  kind: z.enum(["purchase", "refund"]).default("purchase"),
  originalId: z.string().optional(),
  foreign: z.boolean().default(false),
  currency: z.string().default("KRW"),
  paymentMethod: z.string().default("일반"),
  channel: z.enum(["online", "offline", "unknown"]).default("unknown"),
  interestFree: z.boolean().default(false),
  autoPay: z.boolean().default(false),
  recordedBenefit: money.optional(),
  eligibleCardIds: z.array(z.string()).optional(),
  review: z.string().optional(),
  sample: z.boolean().default(false),
});
export type Transaction = z.infer<typeof transactionSchema>;
export const conditionSchema = z.object({
  categories: z.array(categorySchema).default([]),
  excludeCategories: z.array(categorySchema).default([]),
  merchants: z.array(z.string()).default([]),
  minimum: money.default(0),
  paymentMethods: z.array(z.string()).default([]),
  channel: z.enum(["any", "online", "offline"]).default("any"),
  region: z.enum(["any", "domestic", "foreign"]).default("any"),
  autoPayOnly: z.boolean().default(false),
  excludeInterestFree: z.boolean().default(true),
});
export type Condition = z.infer<typeof conditionSchema>;
export const benefitSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    condition: conditionSchema,
    type: z.enum(["bill", "instant", "cashback", "points"]),
    rateBps: z.number().int().min(0).max(10_000).default(0),
    fixed: money.default(0),
    perTransactionCap: money.nullable().default(null),
    dailyCap: money.nullable().default(null),
    monthlyCap: money.nullable().default(null),
    merchantMonthlyCap: money.nullable().default(null),
    categoryMonthlyCap: money.nullable().default(null),
    minimumPerformance: money.default(0),
    priority: z.number().int().default(0),
    stackable: z.boolean().default(false),
  })
  .refine(
    (b) => b.rateBps > 0 || b.fixed > 0,
    "할인율 또는 고정 혜택을 입력하세요.",
  );
export type Benefit = z.infer<typeof benefitSchema>;
export const ruleSchema = z
  .object({
    id: z.string().min(1),
    start: dateSchema,
    end: dateSchema.nullable(),
    status: z.enum(["unverified", "user", "official", "demo"]),
    sourceUrl: z
      .string()
      .refine(
        (s) => !s || z.url().safeParse(s).success,
        "유효한 근거 URL을 입력하세요.",
      )
      .default(""),
    checkedDate: dateSchema.optional(),
    dateBasis: z.enum(["approval", "posting"]).default("approval"),
    periodStartDay: z.number().int().min(1).max(28).default(1),
    rounding: z.enum(["floor", "round", "ceil"]).default("floor"),
    performanceMinimum: money.default(0),
    performanceExcludeCategories: z.array(categorySchema).default([]),
    performanceExcludeInterestFree: z.boolean().default(true),
    performanceExcludeDiscounted: z.boolean().default(false),
    monthlyCap: money.nullable().default(null),
    tiers: z
      .array(z.object({ minimum: money, monthlyCap: money.nullable() }))
      .default([]),
    refundTiming: z
      .enum(["original-month", "refund-month"])
      .default("refund-month"),
    refundRestoresCap: z.boolean().default(false),
    graceMonths: z.number().int().min(0).max(12).default(0),
    gracePerformance: money.default(0),
    benefits: z.array(benefitSchema).default([]),
  })
  .superRefine((r, ctx) => {
    if (r.end && r.end < r.start)
      ctx.addIssue({
        code: "custom",
        message: "종료일은 시작일 이후여야 합니다.",
      });
    if (
      r.status === "official" &&
      (!/^https:\/\//.test(r.sourceUrl) || !r.checkedDate)
    )
      ctx.addIssue({
        code: "custom",
        message: "공식 검증은 HTTPS 근거 URL과 확인 날짜가 필요합니다.",
      });
    const ids = r.benefits.map((b) => b.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "혜택 ID가 중복됩니다." });
    if (new Set(r.tiers.map((t) => t.minimum)).size !== r.tiers.length)
      ctx.addIssue({ code: "custom", message: "동일 실적 구간이 중복됩니다." });
    for (const b of r.benefits)
      if (
        b.condition.categories.some((c) =>
          b.condition.excludeCategories.includes(c),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: `${b.name}: 적용/제외 업종이 충돌합니다.`,
        });
  });
export type RuleVersion = z.infer<typeof ruleSchema>;
export const cardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    issuer: z.string().min(1),
    type: z.enum(["credit", "debit"]),
    owned: z.boolean(),
    annualFee: money,
    issueFee: money.default(0),
    issuedDate: dateSchema.optional(),
    pack: z.string().default(""),
    rules: z.array(ruleSchema),
  })
  .superRefine((c, ctx) => {
    const rules = [...c.rules].sort((a, b) => a.start.localeCompare(b.start));
    if (new Set(rules.map((r) => r.id)).size !== rules.length)
      ctx.addIssue({ code: "custom", message: "규칙 버전 ID가 중복됩니다." });
    for (let i = 1; i < rules.length; i++)
      if (!rules[i - 1].end || rules[i - 1].end! >= rules[i].start)
        ctx.addIssue({
          code: "custom",
          message:
            "규칙 적용 기간이 겹칩니다. 이전 버전의 종료일을 수정하세요.",
        });
  });
export type Card = z.infer<typeof cardSchema>;
export const classificationSchema = z.object({
  id: z.string(),
  keyword: z.string().min(1),
  category: categorySchema,
});
export type ClassificationRule = z.infer<typeof classificationSchema>;
export const mappingSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  columns: z.record(z.string(), z.string()),
});
export type Mapping = z.infer<typeof mappingSchema>;
export const settingsSchema = z.object({
  id: z.literal("main"),
  pointValue: z.number().min(0).max(100).default(1),
  knownMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).default([]),
  dark: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export const backupSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    transactions: z.array(transactionSchema),
    cards: z.array(cardSchema),
    classifications: z.array(classificationSchema),
    mappings: z.array(mappingSchema),
    settings: settingsSchema,
  })
  .superRefine((data, ctx) => {
    for (const [name, records] of [
      ["결제내역", data.transactions],
      ["카드", data.cards],
      ["분류", data.classifications],
      ["매핑", data.mappings],
    ] as const)
      if (new Set(records.map((r) => r.id)).size !== records.length)
        ctx.addIssue({ code: "custom", message: `${name} ID 중복` });
    if (
      data.transactions.some((t) => !data.cards.some((c) => c.id === t.cardId))
    )
      ctx.addIssue({
        code: "custom",
        message: "결제내역의 카드가 백업에 없습니다.",
      });
  });
export type Backup = z.infer<typeof backupSchema>;
export const emptyCondition = (): Condition => conditionSchema.parse({});
export const emptyRule = (): RuleVersion =>
  ruleSchema.parse({
    id: crypto.randomUUID(),
    start: "2020-01-01",
    end: null,
    status: "unverified",
  });
