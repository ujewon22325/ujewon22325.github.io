import type { Card, Condition, RuleVersion, Transaction } from "./model";

export type Eligibility = "met" | "unmet" | "unknown" | "unverified";
export interface Line {
  transactionId: string;
  cardId: string;
  principal: number;
  bill: number;
  instant: number;
  cashback: number;
  points: number;
  pointWorth: number;
  total: number;
  net: number;
  performance: number;
  capUsed: number;
  reasons: string[];
  ruleId?: string;
  pending: boolean;
  performancePending: boolean;
}
export interface CardResult {
  cardId: string;
  month: string;
  previousPerformance: number | null;
  eligibility: Eligibility;
  lines: Line[];
  total: number;
  spend: number;
  performance: number;
  capUsed: number;
  cap: number | null;
  pending: boolean;
  performancePending: boolean;
  assumed: boolean;
}
export interface Options {
  knownMonths: string[];
  pointValue: number;
  assumption?: number;
}
/** Known KRW cash flow only. Never guesses an exchange rate or refund linkage. */
export function calendarSpending(all: Transaction[], month: string): number {
  const knownAmount = (t: Transaction) =>
    !(t.foreign && t.currency !== "KRW" && t.billingAmount === undefined);
  const originals = new Map(
    all.filter((t) => t.kind === "purchase").map((t) => [t.id, t]),
  );
  const refunds = new Map<string, number>();
  let total = 0;
  for (const t of [...all].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    if (t.date.slice(0, 7) > month || !knownAmount(t)) continue;
    let signed = amount(t);
    if (t.kind === "refund") {
      const original = t.originalId ? originals.get(t.originalId) : undefined;
      if (
        !original ||
        !knownAmount(original) ||
        original.cardId !== t.cardId ||
        original.date > t.date ||
        t.review
      )
        continue;
      const cumulative = (refunds.get(original.id) ?? 0) + amount(t);
      if (cumulative > amount(original)) continue;
      refunds.set(original.id, cumulative);
      signed = -signed;
    }
    if (t.date.startsWith(month)) total += signed;
  }
  return total;
}
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const ruleFor = (card: Card, date: string) =>
  card.rules.find((r) => r.start <= date && (!r.end || date <= r.end));
const usable = (r: RuleVersion) => r.status !== "unverified";
const round = (n: number, r: RuleVersion) =>
  Math[
    r.rounding === "floor" ? "floor" : r.rounding === "ceil" ? "ceil" : "round"
  ](n);
const amount = (t: Transaction) => t.billingAmount ?? t.amount;
export function periodKey(date: string, rule: RuleVersion): string {
  return Number(date.slice(8, 10)) < rule.periodStartDay
    ? shiftMonth(date.slice(0, 7), -1)
    : date.slice(0, 7);
}
function period(t: Transaction, r: RuleVersion) {
  return periodKey(
    r.dateBasis === "posting" ? (t.postedDate ?? t.date) : t.date,
    r,
  );
}
export function matchCondition(t: Transaction, c: Condition): string | null {
  if (c.categories.length && !c.categories.includes(t.category))
    return "적용 업종 아님";
  if (c.excludeCategories.includes(t.category)) return "혜택 제외 업종";
  if (
    c.merchants.length &&
    !c.merchants.some((s) => t.merchant.toLowerCase().includes(s.toLowerCase()))
  )
    return "가맹점 조건 불충족";
  if (amount(t) < c.minimum) return "최소 결제금액 미달";
  if (c.paymentMethods.length && !c.paymentMethods.includes(t.paymentMethod))
    return "결제수단 조건 불충족";
  if (c.channel !== "any" && c.channel !== t.channel)
    return "온라인·오프라인 조건 불충족";
  if (
    (c.region === "domestic" && t.foreign) ||
    (c.region === "foreign" && !t.foreign)
  )
    return "국내·해외 조건 불충족";
  if (c.autoPayOnly && !t.autoPay) return "자동납부 조건 불충족";
  if (c.excludeInterestFree && t.interestFree) return "무이자할부 혜택 제외";
  return null;
}
function blank(t: Transaction, cardId: string): Line {
  return {
    transactionId: t.id,
    cardId,
    principal: amount(t) * (t.kind === "refund" ? -1 : 1),
    bill: 0,
    instant: 0,
    cashback: 0,
    points: 0,
    pointWorth: 0,
    total: 0,
    net: 0,
    performance: 0,
    capUsed: 0,
    reasons: [],
    pending: false,
    performancePending: false,
  };
}

/** Chronological, integer-KRW evaluator. No dynamic code or external requests. */
export function calculateCard(
  card: Card,
  all: Transaction[],
  target: string,
  options: Options,
): CardResult {
  const txs = all
    .filter((t) => t.cardId === card.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const indexed = new Map(txs.map((t) => [t.id, t]));
  const ledger = new Map<string, Line>();
  const refundAmounts = new Map<string, number>();
  const items = txs.map((t) => ({
    t,
    r: ruleFor(
      card,
      t.kind === "refund" &&
        t.originalId &&
        indexed.get(t.originalId)?.kind === "purchase"
        ? indexed.get(t.originalId)!.date
        : t.date,
    ),
  }));
  // Original-month cancellation rules recompute the original purchase instead of adding a new spend.
  const reductions = new Map<string, number>();
  const invalidRefunds = new Set<string>();
  for (const { t } of items)
    if (t.kind === "refund" && t.originalId) {
      const original = indexed.get(t.originalId);
      const r = original && ruleFor(card, original.date);
      if (
        original?.kind === "purchase" &&
        r?.refundTiming === "original-month" &&
        t.date >= original.date &&
        !t.review &&
        !(t.foreign && t.currency !== "KRW" && t.billingAmount === undefined)
      ) {
        const refunded = (reductions.get(original.id) ?? 0) + amount(t);
        if (refunded > amount(original)) invalidRefunds.add(t.id);
        else reductions.set(original.id, refunded);
      }
    }
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const m = item.r ? period(item.t, item.r) : item.t.date.slice(0, 7);
    if (m <= target) {
      groups.set(m, [...(groups.get(m) ?? []), item]);
    }
  }
  let start = [...groups.keys(), shiftMonth(target, -1)].sort()[0];
  let prior: number | null = null;
  let final: CardResult = {
    cardId: card.id,
    month: target,
    previousPerformance: null,
    eligibility: "unknown",
    lines: [],
    total: 0,
    spend: 0,
    performance: 0,
    capUsed: 0,
    cap: null,
    pending: false,
    performancePending: false,
    assumed: false,
  };
  for (let m = start; m <= target; m = shiftMonth(m, 1)) {
    const monthItems = (groups.get(m) ?? []).sort((a, b) => {
      const da =
        a.r?.dateBasis === "posting" ? (a.t.postedDate ?? a.t.date) : a.t.date;
      const db =
        b.r?.dateBasis === "posting" ? (b.t.postedDate ?? b.t.date) : b.t.date;
      return da.localeCompare(db) || a.t.id.localeCompare(b.t.id);
    });
    const active = ruleFor(card, m + "-28") ?? monthItems[0]?.r;
    let prev =
      m === target && options.assumption !== undefined
        ? options.assumption
        : prior;
    let assumed = m === target && options.assumption !== undefined;
    if (active && card.issuedDate && active.graceMonths > 0) {
      const age =
        (Number(m.slice(0, 4)) - Number(card.issuedDate.slice(0, 4))) * 12 +
        Number(m.slice(5)) -
          Number(card.issuedDate.slice(5, 7));
      if (age >= 0 && age < active.graceMonths) {
        prev = active.gracePerformance;
        assumed = true;
      }
    }
    let eligibility: Eligibility =
      !active || !usable(active)
        ? "unverified"
        : active.performanceMinimum === 0
          ? "met"
          : prev === null
            ? "unknown"
            : prev >= active.performanceMinimum
              ? "met"
              : "unmet";
    const usage = new Map<string, number>();
    const lines: Line[] = [];
    let monthCap = active?.monthlyCap ?? null;
    if (active && prev !== null) {
      const tier = [...active.tiers]
        .sort((a, b) => b.minimum - a.minimum)
        .find((t) => prev! >= t.minimum);
      if (tier) monthCap = tier.monthlyCap;
    }
    let spentCap = 0;
    for (const { t, r } of monthItems) {
      const l = blank(t, card.id);
      l.ruleId = r?.id;
      lines.push(l);
      if (!r || !usable(r)) {
        l.pending = l.performancePending = true;
        l.reasons.push("검증된 유효 규칙 없음 · 혜택/실적 미확정");
        l.net = l.principal;
        continue;
      }
      if (t.review) {
        l.pending = l.performancePending = true;
        l.reasons.push(`확인 필요: ${t.review}`);
        l.net = l.principal;
        continue;
      }
      if (r.dateBasis === "posting" && !t.postedDate) {
        l.pending = l.performancePending = true;
        l.reasons.push("매입일 누락 · 계산 보류");
        l.net = l.principal;
        continue;
      }
      if (t.foreign && t.currency !== "KRW" && t.billingAmount === undefined) {
        l.pending = l.performancePending = true;
        l.reasons.push("원화 청구금액 없음 · 환율 추정하지 않음");
        l.net = l.principal;
        continue;
      }
      if (t.eligibleCardIds && !t.eligibleCardIds.includes(card.id)) {
        l.pending = l.performancePending = true;
        l.reasons.push("사용 불가능한 카드 · 배분 대상에서 제외");
        l.net = l.principal;
        continue;
      }
      if (t.kind === "refund") {
        if (invalidRefunds.has(t.id)) {
          l.pending = l.performancePending = true;
          l.reasons.push("원거래 금액을 초과한 취소 · 확인 필요");
          l.net = l.principal;
          continue;
        }
        const original = t.originalId ? indexed.get(t.originalId) : undefined;
        const old = t.originalId ? ledger.get(t.originalId) : undefined;
        if (
          !original ||
          original.kind !== "purchase" ||
          original.date > t.date ||
          !old ||
          (old.pending &&
            ruleFor(card, original.date)?.refundTiming !== "original-month")
        ) {
          l.pending = l.performancePending = true;
          l.reasons.push("원거래 미확인 · 환불 수동 연결 필요");
          l.net = l.principal;
          continue;
        }
        const originalRule = ruleFor(card, original.date)!;
        if (originalRule.refundTiming === "original-month") {
          l.reasons.push("원거래 월 재계산 · 이 달 혜택/실적 조정 0원");
          l.net = l.principal;
          continue;
        }
        const already = refundAmounts.get(original.id) ?? 0;
        if (already + amount(t) > amount(original)) {
          l.pending = l.performancePending = true;
          l.reasons.push("원거래 금액을 초과한 취소 · 확인 필요");
          l.net = l.principal;
          continue;
        }
        const cumulative = already + amount(t);
        refundAmounts.set(original.id, cumulative);
        // Cumulative rounding prevents multiple partial refunds from reversing too much or too little.
        const reverse = (n: number) =>
          -(
            round((n * cumulative) / amount(original), originalRule) -
            round((n * already) / amount(original), originalRule)
          );
        for (const key of [
          "bill",
          "instant",
          "cashback",
          "points",
          "pointWorth",
          "performance",
        ] as const)
          l[key] = reverse(old[key]);
        l.total = l.bill + l.instant + l.cashback + l.pointWorth;
        if (originalRule.refundRestoresCap) {
          const restored = Math.min(spentCap, -l.total);
          spentCap -= restored;
          usage.set("all", Math.max(0, (usage.get("all") ?? 0) - restored));
          l.capUsed = -restored;
        }
        l.reasons.push(
          `원거래 ${original.id} 연결 · 취소월 혜택 ${l.total}원 / 실적 ${l.performance}원 조정`,
        );
        l.net = l.principal - l.total;
        continue;
      }
      const effective = Math.max(0, amount(t) - (reductions.get(t.id) ?? 0));
      if (reductions.has(t.id))
        l.reasons.push(`원거래월 취소 ${reductions.get(t.id)}원 차감`);
      if (r.performanceExcludeCategories.includes(t.category))
        l.reasons.push("실적 제외 업종");
      else if (r.performanceExcludeInterestFree && t.interestFree)
        l.reasons.push("무이자할부 실적 제외");
      else l.performance = effective;
      let status: Eligibility =
        r.performanceMinimum === 0
          ? "met"
          : prev === null
            ? "unknown"
            : prev >= r.performanceMinimum
              ? "met"
              : "unmet";
      if (status === "unknown") {
        l.pending = true;
        l.reasons.push("전월 자료 미확인 · 혜택 판정 불가");
        if (r.performanceExcludeDiscounted) {
          l.performancePending = true;
          l.reasons.push("혜택 여부 미확인 · 실적 판정 불가");
        }
      } else if (status === "unmet")
        l.reasons.push(
          `전월실적 ${prev}원 · 기준 ${r.performanceMinimum}원 미달`,
        );
      else {
        let applied = false;
        for (const b of [...r.benefits].sort(
          (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
        )) {
          if (applied && !b.stackable) continue;
          const failure = matchCondition(
            { ...t, amount: effective, billingAmount: effective },
            b.condition,
          );
          if (failure) {
            l.reasons.push(`${b.name}: ${failure}`);
            continue;
          }
          if (
            b.minimumPerformance > 0 &&
            (prev === null || prev < b.minimumPerformance)
          ) {
            l.reasons.push(`${b.name}: 구간 실적 미달/미확인`);
            continue;
          }
          if (b.type === "points" && options.pointValue === 0) {
            l.reasons.push(`${b.name}: 포인트 가치 0원 · 가치 비교 제외`);
            continue;
          }
          const units = round((effective * b.rateBps) / 10000 + b.fixed, r);
          const worth =
            b.type === "points"
              ? Math.floor(units * options.pointValue)
              : units;
          const day = r.dateBasis === "posting" ? t.postedDate! : t.date;
          const tier =
            prev === null
              ? undefined
              : [...r.tiers]
                  .sort((a, b) => b.minimum - a.minimum)
                  .find((t) => prev! >= t.minimum);
          const limits: [string, number | null][] = [
            ["all", tier ? tier.monthlyCap : r.monthlyCap],
            [`rule:${b.id}`, b.monthlyCap],
            [`day:${b.id}:${day}`, b.dailyCap],
            [`merchant:${b.id}:${t.merchant}`, b.merchantMonthlyCap],
            [`category:${b.id}:${t.category}`, b.categoryMonthlyCap],
          ];
          const remaining = limits.map(([key, limit]) =>
            limit === null
              ? Infinity
              : Math.max(0, limit - (usage.get(key) ?? 0)),
          );
          let earned = Math.min(
            worth,
            b.perTransactionCap ?? Infinity,
            ...remaining,
            Math.max(0, effective - l.total),
          );
          let points = 0;
          if (b.type === "points") {
            points = Math.min(units, Math.floor(earned / options.pointValue));
            earned = Math.floor(points * options.pointValue);
            l.points += points;
            l.pointWorth += earned;
          } else
            l[
              b.type === "bill"
                ? "bill"
                : b.type === "instant"
                  ? "instant"
                  : "cashback"
            ] += earned;
          if (earned > 0) {
            applied = true;
            l.total += earned;
            l.capUsed += earned;
            spentCap += earned;
            for (const [key] of limits)
              usage.set(key, (usage.get(key) ?? 0) + earned);
          }
          l.reasons.push(
            `${b.name}: ${effective}원 × ${(b.rateBps / 100).toFixed(2)}% + ${b.fixed}${b.type === "points" ? "P" : "원"} → ${earned}원${earned < worth ? " (한도/원금 제한)" : ""}`,
          );
        }
      }
      if (r.performanceExcludeDiscounted && l.total > 0) {
        l.performance = 0;
        l.reasons.push("혜택 적용 거래는 실적 제외");
      }
      l.net = l.principal - l.total;
      ledger.set(t.id, l);
    }
    const performance = lines.reduce((n, l) => n + l.performance, 0);
    const perfPending = lines.some((l) => l.performancePending);
    final = {
      cardId: card.id,
      month: m,
      previousPerformance: prev,
      eligibility,
      lines,
      total: lines.reduce((n, l) => n + l.total, 0),
      spend: lines.reduce((n, l) => n + l.principal, 0),
      performance,
      capUsed: spentCap,
      cap: monthCap,
      pending:
        lines.some((l) => l.pending) ||
        eligibility === "unverified" ||
        eligibility === "unknown",
      performancePending: perfPending,
      assumed,
    };
    prior =
      options.knownMonths.includes(m) && !perfPending ? performance : null;
  }
  return final;
}
export function singleCardComparison(
  cards: Card[],
  txs: Transaction[],
  month: string,
  options: Options,
  historyMode: "actual" | "reassigned" = "actual",
): CardResult[] {
  return cards
    .map((c) =>
      calculateCard(
        c,
        txs.map((t) =>
          historyMode === "reassigned" ||
          (ruleFor(c, t.date)
            ? period(t, ruleFor(c, t.date)!)
            : t.date.slice(0, 7)) === month
            ? { ...t, cardId: c.id }
            : t,
        ),
        month,
        options,
      ),
    )
    .sort((a, b) => b.total - a.total || a.cardId.localeCompare(b.cardId));
}
export function withSktExample(
  txs: Transaction[],
  month: string,
  cardId: string,
): Transaction[] {
  if (
    txs.some(
      (t) =>
        t.kind === "purchase" &&
        t.date.startsWith(month) &&
        t.category === "통신비" &&
        /SKT|SK텔레콤/i.test(t.merchant),
    )
  )
    return txs;
  return [
    ...txs,
    {
      id: `skt-${month}`,
      sourceId: "",
      source: "simulation",
      date: month + "-10",
      merchant: "SKT 정기 통신비 (가정)",
      amount: 48000,
      cardId,
      category: "통신비",
      industry: "",
      kind: "purchase",
      foreign: false,
      currency: "KRW",
      paymentMethod: "일반",
      channel: "online",
      interestFree: false,
      autoPay: true,
      sample: true,
    },
  ];
}
