import {
  cardSchema,
  emptyCondition,
  emptyRule,
  transactionSchema,
  type Card,
  type ClassificationRule,
  type Transaction,
} from "./model";
export const defaultClassifications: ClassificationRule[] = [
  ["SKT", "통신비"],
  ["SK텔레콤", "통신비"],
  ["넷플릭스", "구독"],
  ["쿠팡", "온라인쇼핑"],
  ["네이버", "온라인쇼핑"],
  ["GS25", "편의점"],
  ["CU", "편의점"],
  ["이마트", "마트"],
  ["배달", "배달"],
  ["카페", "카페"],
  ["스타벅스", "카페"],
  ["주유", "주유"],
  ["전기", "공과금"],
  ["보험", "보험"],
  ["상품권", "상품권"],
  ["지하철", "교통"],
].map(([keyword, category], i) => ({
  id: `classification-${i}`,
  keyword,
  category: category as ClassificationRule["category"],
}));
const names = [
  ["우리 카드의정석2 SUPER", "우리", "credit", ""],
  ["KB Youth Club 체크카드", "KB국민", "debit", "A팩"],
  ["KB Youth Club 체크카드", "KB국민", "debit", "B팩"],
  ["우체국 개이득 체크카드", "우체국", "debit", ""],
  ["NH zgm 할인카드", "NH농협", "credit", ""],
  ["삼성 iD GLOBAL", "삼성", "credit", ""],
  ["신한 처음", "신한", "credit", ""],
  ["신한 Simple Plan+", "신한", "credit", ""],
];
export function demoCard(
  id = "demo-flat",
  name = "가상 카드 · 생활 2%",
  rate = 200,
  cap = 20000,
): Card {
  const r = emptyRule();
  r.id = id + "-v1";
  r.status = "demo";
  r.performanceMinimum = 300000;
  r.monthlyCap = cap;
  r.performanceExcludeCategories = ["상품권", "공과금"];
  r.benefits = [
    {
      id: id + "-benefit",
      name: "가상 기본 혜택",
      condition: {
        ...emptyCondition(),
        excludeCategories: ["상품권", "공과금"],
      },
      type: "bill",
      rateBps: rate,
      fixed: 0,
      perTransactionCap: null,
      dailyCap: null,
      monthlyCap: null,
      merchantMonthlyCap: null,
      categoryMonthlyCap: null,
      minimumPerformance: 0,
      priority: 0,
      stackable: false,
    },
  ];
  if (id === "demo-shop") r.benefits[0].condition.categories = ["온라인쇼핑"];
  return cardSchema.parse({
    id,
    name,
    issuer: "계산 검증용 · 실제 상품 아님",
    type: "credit",
    owned: true,
    annualFee: 0,
    issueFee: 0,
    pack: "",
    rules: [r],
  });
}
export function initialCards(): Card[] {
  return [
    ...names.map(([name, issuer, type, pack], i) =>
      cardSchema.parse({
        id: `card-${i}`,
        name,
        issuer,
        type,
        pack,
        owned: false,
        annualFee: 0,
        rules: [{ ...emptyRule(), id: `card-${i}-v1` }],
      }),
    ),
    demoCard(),
    demoCard("demo-shop", "가상 카드 · 쇼핑 5%", 500, 15000),
  ];
}
export function sampleTransactions(): Transaction[] {
  const rows: [string, number, Transaction["category"], string][] = [
    ["샘플 온라인몰", 220000, "온라인쇼핑", "online"],
    ["샘플 마트", 180000, "마트", "offline"],
    ["샘플 식당", 95000, "음식점", "offline"],
    ["SKT 샘플 통신비", 48000, "통신비", "online"],
    ["샘플 카페", 18000, "카페", "offline"],
    ["샘플 편의점", 25000, "편의점", "offline"],
    ["샘플 공과금", 60000, "공과금", "online"],
    ["샘플 교통", 55000, "교통", "offline"],
    ["샘플 구독", 17000, "구독", "online"],
  ];
  return [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ].flatMap((month, mi) =>
    rows.map(([merchant, amount, category, channel], i) =>
      transactionSchema.parse({
        id: `sample-${month}-${i}`,
        sourceId: `sample-${month}-${i}`,
        source: "sample",
        date: `${month}-${String(i * 2 + 2).padStart(2, "0")}`,
        postedDate: `${month}-${String(i * 2 + 3).padStart(2, "0")}`,
        merchant,
        amount: amount + (category === "온라인쇼핑" ? mi * 1000 : 0),
        category,
        channel,
        cardId: "demo-flat",
        autoPay: category === "통신비" || category === "구독",
        sample: true,
      }),
    ),
  );
}
