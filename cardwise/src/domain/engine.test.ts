import { describe, expect, it } from "vitest";
import {
  calculateCard,
  singleCardComparison,
  withSktExample,
  periodKey,
  calendarSpending,
} from "./engine";
import {
  cardSchema,
  emptyCondition,
  ruleSchema,
  transactionSchema,
  backupSchema,
  type Card,
  type Transaction,
} from "./model";
import { deduplicate, mapRows, classify } from "./import";
import { demoCard, sampleTransactions } from "./sample";

function card(): Card {
  const c = demoCard("test", "테스트", 500, 100000);
  c.rules[0].performanceMinimum = 0;
  c.rules[0].performanceExcludeCategories = [];
  c.rules[0].benefits[0].condition = emptyCondition();
  return c;
}
function tx(
  id = "current",
  amount = 10000,
  date = "2026-10-05",
  changes: Partial<Transaction> = {},
): Transaction {
  return transactionSchema.parse({
    id,
    date,
    amount,
    merchant: "테스트 가맹점",
    cardId: "test",
    category: "음식점",
    ...changes,
  });
}
const opts = { knownMonths: ["2026-08", "2026-09", "2026-10"], pointValue: 1 };
const calc = (c: Card, ts: Transaction[]) =>
  calculateCard(c, ts, "2026-10", opts);
describe("원화 혜택과 전월실적 · 직접 산정한 기대값", () => {
  it("원화 소비 합계는 외화 미확인과 연결되지 않은 취소를 추정하지 않음", () => {
    const ts = [
      tx("buy", 20000),
      tx("foreign", 100, "2026-10-05", { foreign: true, currency: "USD" }),
      tx("unknown", 5000, "2026-10-06", { kind: "refund" }),
      tx("excess", 30000, "2026-10-07", { kind: "refund", originalId: "buy" }),
      tx("partial", 10000, "2026-10-08", { kind: "refund", originalId: "buy" }),
    ];
    expect(calendarSpending(ts, "2026-10")).toBe(10000);
  });
  it("1. 전월 30만원을 정확히 충족하면 1만원의 5% = 500원", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    const r = calc(c, [tx("prev", 300000, "2026-09-05"), tx()]);
    expect(r.previousPerformance).toBe(300000);
    expect(r.eligibility).toBe("met");
    expect(r.total).toBe(500);
  });
  it("2. 전월 299999원은 1원 부족해 혜택 0원", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    const r = calc(c, [tx("prev", 299999, "2026-09-05"), tx()]);
    expect(r.eligibility).toBe("unmet");
    expect(r.total).toBe(0);
  });
  it("3. 상품권 40만원 + 일반 10만원은 실적 10만원만 인정", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    c.rules[0].performanceExcludeCategories = ["상품권"];
    const r = calc(c, [
      tx("gift", 400000, "2026-09-05", { category: "상품권" }),
      tx("prev", 100000, "2026-09-06"),
      tx(),
    ]);
    expect(r.previousPerformance).toBe(100000);
    expect(r.eligibility).toBe("unmet");
  });
  it("4. 혜택 적용 거래를 실적에서 제외", () => {
    const c = card();
    c.rules[0].performanceExcludeDiscounted = true;
    const r = calc(c, [tx()]);
    expect(r.total).toBe(500);
    expect(r.performance).toBe(0);
  });
  it("5. 혜택 적용 거래를 실적에 포함", () => {
    const r = calc(card(), [tx()]);
    expect(r.total).toBe(500);
    expect(r.performance).toBe(10000);
  });
  it("6. 월 한도 700원에서 500 + 200원 적용", () => {
    const c = card();
    c.rules[0].monthlyCap = 700;
    const r = calc(c, [tx("a"), tx("b")]);
    expect(r.total).toBe(700);
    expect(r.lines.map((l) => l.total)).toEqual([500, 200]);
  });
  it("7. 건별 1000원 / 일별 1500원 한도 동시 적용", () => {
    const c = card();
    c.rules[0].benefits[0].rateBps = 1000;
    c.rules[0].benefits[0].perTransactionCap = 1000;
    c.rules[0].benefits[0].dailyCap = 1500;
    const r = calc(c, [
      tx("a", 20000),
      tx("b", 20000),
      tx("c", 20000, "2026-10-06"),
    ]);
    expect(r.lines.map((l) => l.total)).toEqual([1000, 500, 1000]);
    expect(r.total).toBe(2500);
  });
  it("8. 통합 900원 / 업종별 600원 한도", () => {
    const c = card();
    c.rules[0].monthlyCap = 900;
    c.rules[0].benefits[0].categoryMonthlyCap = 600;
    const r = calc(c, [
      tx("a"),
      tx("b"),
      tx("c", 10000, "2026-10-06", { category: "카페" }),
    ]);
    expect(r.lines.map((l) => l.total)).toEqual([500, 100, 300]);
    expect(r.total).toBe(900);
  });
  it("9. 같은 달 4천원 부분 환불은 혜택 200원 / 실적 4천원 역산", () => {
    const r = calc(card(), [
      tx("buy"),
      tx("refund", 4000, "2026-10-06", { kind: "refund", originalId: "buy" }),
    ]);
    expect(r.total).toBe(300);
    expect(r.performance).toBe(6000);
    expect(r.spend).toBe(6000);
  });
  it("10. 전월 결제의 다음 달 환불은 취소월에 반영", () => {
    const r = calc(card(), [
      tx("buy", 100000, "2026-09-05"),
      tx("refund", 40000, "2026-10-06", { kind: "refund", originalId: "buy" }),
      tx("new", 100000, "2026-10-07"),
    ]);
    expect(r.previousPerformance).toBe(100000);
    expect(r.total).toBe(3000);
    expect(r.performance).toBe(60000);
  });
  it("11. 무이자할부는 혜택과 실적에서 제외", () => {
    const r = calc(card(), [
      tx("a", 10000, "2026-10-05", { interestFree: true }),
    ]);
    expect(r.total).toBe(0);
    expect(r.performance).toBe(0);
  });
  it("12. 상품권/공과금은 지정한 실적·혜택 제외 조건 적용", () => {
    const c = card();
    c.rules[0].performanceExcludeCategories = ["상품권", "공과금"];
    c.rules[0].benefits[0].condition.excludeCategories = ["상품권", "공과금"];
    const r = calc(c, [
      tx("a", 10000, "2026-10-05", { category: "상품권" }),
      tx("b", 10000, "2026-10-06", { category: "공과금" }),
    ]);
    expect(r.total).toBe(0);
    expect(r.performance).toBe(0);
  });
  it("13. 간편결제 조건 일치/불일치", () => {
    const c = card();
    c.rules[0].benefits[0].condition.paymentMethods = ["네이버페이"];
    const r = calc(c, [
      tx("a", 10000, "2026-10-05", { paymentMethod: "네이버페이" }),
      tx("b"),
    ]);
    expect(r.lines.map((l) => l.total)).toEqual([500, 0]);
  });
  it("14. 전월 거래가 있어도 자료 확인이 없으면 판정 불가", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    const r = calculateCard(
      c,
      [tx("prev", 400000, "2026-09-05"), tx()],
      "2026-10",
      { knownMonths: [], pointValue: 1 },
    );
    expect(r.previousPerformance).toBeNull();
    expect(r.eligibility).toBe("unknown");
    expect(r.pending).toBe(true);
    expect(r.total).toBe(0);
  });
  it("15. 적용 기간이 다른 과거 1% / 현재 5% 규칙", () => {
    const c = card();
    const old = structuredClone(c.rules[0]);
    old.id = "old";
    old.end = "2026-09-30";
    old.benefits[0].rateBps = 100;
    const now = structuredClone(c.rules[0]);
    now.start = "2026-10-01";
    c.rules = [old, now];
    const ts = [tx("prev", 10000, "2026-09-05"), tx()];
    expect(calculateCard(c, ts, "2026-09", opts).total).toBe(100);
    expect(calc(c, ts).total).toBe(500);
  });
  it("16. 동일 파일의 중복 업로드는 거래를 추가하지 않음", () => {
    const rows = [{ 날짜: "2026-10-05", 가맹점: "가게", 금액: "10000" }];
    const ts = mapRows(
      rows,
      { date: "날짜", merchant: "가맹점", amount: "금액" },
      "same-file",
      "test",
      [card()],
      [],
    ).transactions;
    expect(deduplicate(ts, ts)).toMatchObject({
      added: [],
      duplicates: 1,
      conflicts: [],
    });
  });
  it("17. 같은 가맹점·금액의 별도 거래 ID는 둘 다 유지", () => {
    const ts = [tx("first"), tx("second")];
    expect(deduplicate(ts, []).added).toHaveLength(2);
    const rows = [
      { 날짜: "2026-10-05", 가게: "가게", 금액: "10000" },
      { 날짜: "2026-10-05", 가게: "가게", 금액: "10000" },
    ];
    const result = mapRows(
      rows,
      { date: "날짜", merchant: "가게", amount: "금액" },
      "file",
      "test",
      [card()],
      [],
    );
    expect(new Set(result.transactions.map((t) => t.id)).size).toBe(2);
  });
  it("18. 500P × 0.5원과 청구할인 500원은 별도로 계산", () => {
    const c = card();
    const points = structuredClone(c.rules[0].benefits[0]);
    points.id = "points";
    points.type = "points";
    points.stackable = true;
    c.rules[0].benefits[0].priority = 10;
    c.rules[0].benefits.push(points);
    const r = calculateCard(c, [tx()], "2026-10", { ...opts, pointValue: 0.5 });
    expect(r.lines[0]).toMatchObject({
      bill: 500,
      points: 500,
      pointWorth: 250,
      total: 750,
      net: 9250,
    });
  });
  it("19. 이미 있는 SKT 정기결제는 중복 추가하지 않음", () => {
    const original = [
      tx("skt", 48000, "2026-10-10", { merchant: "SKT", category: "통신비" }),
    ];
    expect(withSktExample(original, "2026-10", "test")).toHaveLength(1);
    expect(withSktExample([], "2026-10", "test")[0].amount).toBe(48000);
  });
  it("20. 입력 순서가 바뀌어도 비교 결과는 동일", () => {
    const ts = [tx("a"), tx("b", 20000)];
    expect(singleCardComparison([card()], ts, "2026-10", opts)).toEqual(
      singleCardComparison([card()], [...ts].reverse(), "2026-10", opts),
    );
  });
  it("원거래 없는 환불은 소비/혜택 추정 대신 확인 대상", () => {
    const r = calc(card(), [
      tx("orphan", 10000, "2026-10-05", { kind: "refund" }),
    ]);
    expect(r.pending).toBe(true);
    expect(r.lines[0].performance).toBe(0);
    expect(r.total).toBe(0);
  });
  it("원거래 금액을 초과한 누적 환불은 보류", () => {
    const r = calc(card(), [
      tx("buy"),
      tx("r1", 7000, "2026-10-06", { kind: "refund", originalId: "buy" }),
      tx("r2", 4000, "2026-10-07", { kind: "refund", originalId: "buy" }),
    ]);
    expect(r.lines[2].pending).toBe(true);
    expect(r.performance).toBe(3000);
  });
  it("원거래월 재계산 규칙은 과거 인정액을 수정", () => {
    const c = card();
    c.rules[0].refundTiming = "original-month";
    const ts = [
      tx("buy", 100000, "2026-09-05"),
      tx("r", 40000, "2026-10-06", { kind: "refund", originalId: "buy" }),
    ];
    expect(calc(c, ts).previousPerformance).toBe(60000);
    expect(calculateCard(c, ts, "2026-09", opts).total).toBe(3000);
    expect(calc(c, ts).total).toBe(0);
  });
  it("취소 후 통합한도 복원은 명시된 경우만 허용", () => {
    const c = card();
    c.rules[0].monthlyCap = 500;
    c.rules[0].refundRestoresCap = true;
    const r = calc(c, [
      tx("a"),
      tx("r", 10000, "2026-10-06", { kind: "refund", originalId: "a" }),
      tx("b", 10000, "2026-10-07"),
    ]);
    expect(r.lines.map((l) => l.total)).toEqual([500, -500, 500]);
    expect(r.capUsed).toBe(500);
  });
  it("전월 가정은 명시적으로 표시", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    const r = calculateCard(c, [tx()], "2026-10", {
      ...opts,
      assumption: 500000,
    });
    expect(r.assumed).toBe(true);
    expect(r.previousPerformance).toBe(500000);
    expect(r.total).toBe(500);
  });
  it("검증 필요 규칙은 계산에서 제외", () => {
    const c = card();
    c.rules[0].status = "unverified";
    const r = calc(c, [tx()]);
    expect(r.eligibility).toBe("unverified");
    expect(r.total).toBe(0);
    expect(r.pending).toBe(true);
  });
  it("외화 원화 청구금액이 없으면 환율을 추정하지 않음", () => {
    const r = calc(card(), [
      tx("foreign", 100, "2026-10-05", { foreign: true, currency: "USD" }),
    ]);
    expect(r.pending).toBe(true);
    expect(r.total).toBe(0);
    expect(r.performance).toBe(0);
  });
  it("원화 청구금액이 있으면 해당 금액으로 산정", () => {
    const r = calc(card(), [
      tx("foreign", 100, "2026-10-05", {
        foreign: true,
        currency: "USD",
        billingAmount: 140000,
      }),
    ]);
    expect(r.performance).toBe(140000);
    expect(r.total).toBe(7000);
  });
  it("가맹점별 한도는 동일 가맹점에만 누적", () => {
    const c = card();
    c.rules[0].benefits[0].merchantMonthlyCap = 600;
    const r = calc(c, [
      tx("a"),
      tx("b"),
      tx("c", 10000, "2026-10-06", { merchant: "다른 가맹점" }),
    ]);
    expect(r.total).toBe(1100);
  });
  it("매입일 누락은 계산 보류", () => {
    const c = card();
    c.rules[0].dateBasis = "posting";
    expect(calc(c, [tx()]).pending).toBe(true);
  });
  it("매입일 순서대로 한도 차감", () => {
    const c = card();
    c.rules[0].dateBasis = "posting";
    c.rules[0].monthlyCap = 700;
    const r = calc(c, [
      tx("early-approval", 10000, "2026-10-01", { postedDate: "2026-10-06" }),
      tx("late-approval", 10000, "2026-10-02", { postedDate: "2026-10-03" }),
    ]);
    expect(r.lines.map((l) => [l.transactionId, l.total])).toEqual([
      ["late-approval", 500],
      ["early-approval", 200],
    ]);
  });
  it("월 산정 시작일 10일은 9일 결제를 이전 기간에 배정", () => {
    const c = card();
    c.rules[0].periodStartDay = 10;
    expect(periodKey("2026-10-09", c.rules[0])).toBe("2026-09");
    expect(periodKey("2026-10-10", c.rules[0])).toBe("2026-10");
  });
  it("절사 16원 / 반올림 17원 / 올림 17원", () => {
    const c = card();
    expect(calc(c, [tx("a", 333)]).total).toBe(16);
    c.rules[0].rounding = "round";
    expect(calc(c, [tx("a", 333)]).total).toBe(17);
    c.rules[0].rounding = "ceil";
    expect(calc(c, [tx("a", 333)]).total).toBe(17);
  });
  it("자료 확인된 0원 전월은 미충족, 미확인 0원은 판정 불가", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    expect(calc(c, [tx()]).eligibility).toBe("unmet");
    expect(
      calculateCard(c, [tx()], "2026-10", { ...opts, knownMonths: [] })
        .eligibility,
    ).toBe("unknown");
  });
  it("최소 결제금액과 자동납부 조건", () => {
    const c = card();
    c.rules[0].benefits[0].condition.minimum = 20000;
    c.rules[0].benefits[0].condition.autoPayOnly = true;
    expect(
      calc(c, [
        tx("a", 20000, "2026-10-05", { autoPay: true }),
        tx("b", 20000),
        tx("c", 10000, "2026-10-06", { autoPay: true }),
      ]).total,
    ).toBe(1000);
  });
  it("같은 ID의 변경된 금액은 중복이 아니라 충돌", () => {
    const r = deduplicate([tx("a", 20000)], [tx("a", 10000)]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.duplicates).toBe(0);
  });
  it("6개월 샘플 결과는 수작업 기대값과 일치", () => {
    const c = demoCard();
    const ts = sampleTransactions();
    const months = [
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ];
    const values = months.map(
      (m) =>
        calculateCard(c, ts, m, { knownMonths: months, pointValue: 1 }).total,
    );
    expect(values).toEqual([0, 13180, 13200, 13220, 13240, 13260]);
    expect(ts).toHaveLength(54);
    expect(
      calculateCard(c, ts, "2026-10", { knownMonths: months, pointValue: 1 })
        .performance,
    ).toBe(663000);
  });
  it("이전 실제 배분과 재배분 가정은 다른 결과", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    const ts = [tx("old", 400000, "2026-09-03", { cardId: "other" }), tx()];
    expect(
      singleCardComparison([c], ts, "2026-10", opts, "actual")[0].total,
    ).toBe(0);
    expect(
      singleCardComparison([c], ts, "2026-10", opts, "reassigned")[0].total,
    ).toBe(500);
  });
  it("실제 사용할 수 없는 카드는 거래 배분을 보류", () => {
    const r = calc(card(), [
      tx("a", 10000, "2026-10-05", { eligibleCardIds: ["other"] }),
    ]);
    expect(r.pending).toBe(true);
    expect(r.total).toBe(0);
  });
  it("실적 구간 한도를 적용", () => {
    const c = card();
    c.rules[0].tiers = [
      { minimum: 500000, monthlyCap: 1000 },
      { minimum: 1000000, monthlyCap: 2000 },
    ];
    expect(
      calculateCard(c, [tx("a", 100000)], "2026-10", {
        ...opts,
        assumption: 500000,
      }).total,
    ).toBe(1000);
    expect(
      calculateCard(c, [tx("a", 100000)], "2026-10", {
        ...opts,
        assumption: 1000000,
      }).total,
    ).toBe(2000);
  });
  it("사용자 사전의 첫 키워드가 자동분류 우선", () => {
    expect(
      classify("샘플 카페", [
        { id: "a", keyword: "샘플", category: "구독" },
        { id: "b", keyword: "카페", category: "카페" },
      ]),
    ).toBe("구독");
  });
  it("불명확한 카드 이름은 임의로 선택하지 않음", () => {
    const c = card();
    const rows = [
      {
        date: "2026-10-01",
        merchant: "가게",
        amount: "1000",
        card: "모르는 카드",
      },
    ];
    expect(
      mapRows(
        rows,
        {
          date: "date",
          merchant: "merchant",
          amount: "amount",
          cardId: "card",
        },
        "file",
        "test",
        [c],
        [],
      ).errors,
    ).toHaveLength(1);
  });
  it("규칙 기간 충돌 / 검증 근거 누락 / 잘못된 날짜를 차단", () => {
    const c = card();
    c.rules.push(structuredClone(c.rules[0]));
    expect(cardSchema.safeParse(c).success).toBe(false);
    const r = card().rules[0];
    r.status = "official";
    expect(ruleSchema.safeParse(r).success).toBe(false);
    expect(
      transactionSchema.safeParse({ ...tx(), date: "2026-02-30" }).success,
    ).toBe(false);
  });
  it("백업 스키마 버전과 중복 ID 검증", () => {
    expect(backupSchema.safeParse({ schemaVersion: 999 }).success).toBe(false);
    const data = {
      schemaVersion: 1,
      exportedAt: "now",
      transactions: [tx(), tx()],
      cards: [card()],
      classifications: [],
      mappings: [],
      settings: { id: "main", pointValue: 1, knownMonths: [], dark: false },
    };
    expect(backupSchema.safeParse(data).success).toBe(false);
  });
  it("원거래월 취소는 승인금액을 두 번 차감하지 않음", () => {
    const c = card();
    c.rules[0].refundTiming = "original-month";
    const ts = [
      tx("buy", 100000, "2026-09-05"),
      tx("r", 40000, "2026-10-06", { kind: "refund", originalId: "buy" }),
    ];
    const prior = calculateCard(c, ts, "2026-09", opts),
      now = calc(c, ts);
    expect(prior.spend + now.spend).toBe(60000);
    expect(prior.lines[0].principal).toBe(100000);
  });
  it("원거래월 재계산도 초과 환불을 임의 차감하지 않음", () => {
    const c = card();
    c.rules[0].refundTiming = "original-month";
    const ts = [
      tx("buy"),
      tx("r", 20000, "2026-10-06", { kind: "refund", originalId: "buy" }),
    ];
    const r = calc(c, ts);
    expect(r.lines[1].pending).toBe(true);
    expect(r.lines[0].performance).toBe(10000);
  });
  it("신규 발급 유예가 명시된 경우만 간주 실적 적용", () => {
    const c = card();
    c.issuedDate = "2026-10-01";
    c.rules[0].performanceMinimum = 300000;
    c.rules[0].graceMonths = 2;
    c.rules[0].gracePerformance = 300000;
    expect(calc(c, [tx()])).toMatchObject({
      assumed: true,
      total: 500,
      eligibility: "met",
    });
    c.rules[0].graceMonths = 0;
    expect(calc(c, [tx()]).total).toBe(0);
  });
  it("누적 부분 취소 절사는 원래 할인액을 넘지 않음", () => {
    const c = card();
    const r = calc(c, [
      tx("buy", 101),
      tx("r1", 50, "2026-10-06", { kind: "refund", originalId: "buy" }),
      tx("r2", 51, "2026-10-07", { kind: "refund", originalId: "buy" }),
    ]);
    expect(r.lines.map((l) => l.total)).toEqual([5, -2, -3]);
    expect(r.total).toBe(0);
    expect(r.performance).toBe(0);
  });
  it("할인 여부에 따라 실적이 달라지는 전월은 미확정 유지", () => {
    const c = card();
    c.rules[0].performanceMinimum = 300000;
    c.rules[0].performanceExcludeDiscounted = true;
    const r = calculateCard(
      c,
      [tx("prev", 400000, "2026-09-02"), tx()],
      "2026-10",
      { knownMonths: ["2026-09"], pointValue: 1 },
    );
    expect(r.previousPerformance).toBeNull();
    expect(r.eligibility).toBe("unknown");
  });
});
