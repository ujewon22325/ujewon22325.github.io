import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Wallet,
  GitCompareArrows,
  Copy,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import Papa from "papaparse";
import { db, backup, deleteAll, loadSample, restore } from "./data/db";
import {
  categories,
  cardSchema,
  emptyRule,
  transactionSchema,
  backupSchema,
  type Card,
  type ClassificationRule,
  type Transaction,
} from "./domain/model";
import {
  calculateCard,
  singleCardComparison,
  shiftMonth,
  calendarSpending,
  type Line,
} from "./domain/engine";
import { classify } from "./domain/import";
import {
  Badge,
  Button,
  Field,
  Modal,
  Panel,
  labelStatus,
  saveDownload,
  won,
} from "./components/ui";
import { CardEditor } from "./components/CardEditor";
import { ImportDialog } from "./components/ImportDialog";
import { TransactionEditor } from "./components/TransactionEditor";

const navigation = [
  ["dashboard", "대시보드", LayoutDashboard],
  ["transactions", "결제내역", FileText],
  ["cards", "카드 관리", CreditCard],
  ["compare", "카드 비교", GitCompareArrows],
  ["settings", "설정", SettingsIcon],
] as const;
type Page = (typeof navigation)[number][0];
const currentMonth = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
const sampleMonths = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
];
const transactionAmount = (t: Transaction) =>
  t.foreign && t.currency !== "KRW" && t.billingAmount === undefined
    ? `${t.amount.toLocaleString("ko-KR")} ${t.currency} (원화 미확인)`
    : won(t.billingAmount ?? t.amount);
export default function App() {
  const data = useLiveQuery(
    async () => ({
      cards: await db.cards.toArray(),
      transactions: await db.transactions.toArray(),
      classifications: await db.classifications.toArray(),
      settings: await db.settings.get("main"),
    }),
    [],
  );
  const [page, setPage] = useState<Page>("dashboard");
  const [month, setMonth] = useState(currentMonth);
  const [sample, setSample] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [detail, setDetail] = useState<Line | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [historyMode, setHistoryMode] = useState<"actual" | "reassigned">(
    "actual",
  );
  const [assumption, setAssumption] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] =
    useState<ClassificationRule["category"]>("기타");
  const [knownMonthsDraft, setKnownMonthsDraft] = useState<string[] | null>(
    null,
  );
  const [pointDraft, setPointDraft] = useState("1");
  const cards = data?.cards ?? [];
  const settings = data?.settings;
  const transactions = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.sample === sample),
    [data, sample],
  );
  const options = useMemo(
    () => ({
      knownMonths: sample ? sampleMonths : (settings?.knownMonths ?? []),
      pointValue: settings?.pointValue ?? 1,
    }),
    [sample, settings],
  );
  const results = useMemo(
    () => cards.map((c) => calculateCard(c, transactions, month, options)),
    [cards, transactions, month, options],
  );
  const activeResults = results.filter((r) =>
    transactions.some((t) => t.cardId === r.cardId && t.date <= month + "-31"),
  );
  const comparisonCards = cards.filter(
    (c) =>
      c.rules.some((r) => r.status !== "unverified") &&
      (sample || !c.rules.every((r) => r.status === "demo")),
  );
  const comparisons = useMemo(
    () =>
      singleCardComparison(
        comparisonCards,
        transactions,
        month,
        {
          ...options,
          assumption: assumption === "" ? undefined : Number(assumption),
        },
        historyMode,
      ),
    [cards, transactions, month, options, assumption, historyMode, sample],
  );
  const monthTx = transactions.filter((t) => t.date.startsWith(month));
  const lineMap = new Map(
    results.flatMap((r) => r.lines.map((l) => [l.transactionId, l] as const)),
  );
  const monthSpend = calendarSpending(transactions, month);
  const total = activeResults.reduce((n, r) => n + r.total, 0);
  const incomplete = activeResults.some((r) => r.pending);
  const comparable = comparisons.filter((r) => !r.pending);
  const best = comparable[0];
  const recorded = monthTx.filter((t) => t.recordedBenefit !== undefined);
  const recordedTotal = recorded.reduce(
    (n, t) => n + t.recordedBenefit! * (t.kind === "refund" ? -1 : 1),
    0,
  );
  const monthly = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => {
        const tx = transactions.filter((t) => t.date.startsWith(m));
        const rs = cards
          .filter((c) => transactions.some((t) => t.cardId === c.id))
          .map((c) => calculateCard(c, transactions, m, options));
        return {
          month: m.slice(5) + "월",
          spend: calendarSpending(transactions, m),
          benefit: rs.reduce((n, r) => n + r.total, 0),
        };
      }),
    [cards, transactions, month, options],
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!settings?.dark);
  }, [settings?.dark]);
  useEffect(() => {
    setKnownMonthsDraft(settings?.knownMonths ?? null);
    setPointDraft(String(settings?.pointValue ?? 1));
  }, [settings?.knownMonths, settings?.pointValue]);
  async function run(action: () => Promise<unknown>, success?: string) {
    setError("");
    try {
      await action();
      if (success) setNotice(success);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "처리하지 못했습니다. 브라우저 저장 공간과 입력값을 확인하세요.",
      );
    }
  }
  function newCard() {
    setEditCard(
      cardSchema.parse({
        id: crypto.randomUUID(),
        name: "새 카드",
        issuer: "직접 등록",
        type: "credit",
        owned: true,
        annualFee: 0,
        rules: [emptyRule()],
      }),
    );
  }
  function newTransaction() {
    if (!cards.length) {
      setError("카드를 먼저 등록하세요.");
      return;
    }
    setEditTx(
      transactionSchema.parse({
        id: crypto.randomUUID(),
        date: month + "-01",
        merchant: "새 결제",
        amount: 1,
        cardId: cards[0].id,
        category: "기타",
        sample,
      }),
    );
  }
  async function deleteCard(c: Card) {
    if ((data?.transactions ?? []).some((t) => t.cardId === c.id))
      throw Error(
        "연결된 거래가 있는 카드는 삭제할 수 없습니다. 거래를 다른 카드로 수정하거나 삭제하세요.",
      );
    if (window.confirm(`“${c.name}” 카드를 삭제할까요?`))
      await db.cards.delete(c.id);
  }
  async function exportCsv() {
    const rows = results.flatMap((r) =>
      r.lines.map((l) => {
        const t = transactions.find((t) => t.id === l.transactionId)!;
        return {
          날짜: t.date,
          가맹점: t.merchant,
          카드: cards.find((c) => c.id === r.cardId)?.name,
          승인금액: t.amount,
          통화: t.currency,
          원화계산금액:
            t.foreign && t.currency !== "KRW" && t.billingAmount === undefined
              ? "미확인"
              : l.principal,
          청구할인: l.bill,
          현장할인: l.instant,
          캐시백: l.cashback,
          포인트: l.points,
          포인트가치: l.pointWorth,
          예상혜택: l.total,
          실적인정: l.performance,
          판정: l.pending ? "미확정" : "입력규칙기준예상",
          근거: l.reasons.join(" / "),
        };
      }),
    );
    saveDownload(
      "\uFEFF" + Papa.unparse(rows, { escapeFormulae: true }),
      `cardwise-${month}-results.csv`,
      "text/csv;charset=utf-8",
    );
  }
  if (!data || !settings)
    return (
      <div className="grid min-h-screen place-items-center">
        <p role="status">기기 안의 데이터를 불러오는 중…</p>
      </div>
    );
  const filtered = monthTx
    .filter(
      (t) =>
        (!query || t.merchant.toLowerCase().includes(query.toLowerCase())) &&
        (!category || t.category === category),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <span className="brand-mark">
            <Wallet size={22} />
          </span>
          <span>
            CardWise<span className="brand-sub">내 소비에 맞는 카드</span>
          </span>
        </a>
        <div className="nav-label">내 카드와 소비</div>
        <nav aria-label="주 메뉴">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              {label}
              {page === id && <ChevronRight size={15} className="ml-auto" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <strong>내 기기에서만 처리</strong>
          <p>금융 데이터는 서버로 전송되지 않습니다.</p>
          <Badge>로컬 전용</Badge>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">
              <Wallet size={19} />
            </span>
            <strong>CardWise</strong>
          </div>
          <div className="desktop-breadcrumb">
            내 지갑 <ChevronRight size={14} />
            <span>{navigation.find((n) => n[0] === page)?.[1]}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={sample ? "amber" : "green"}>
              {sample ? "개인정보 없는 샘플" : "기기 내 저장"}
            </Badge>
            <Button
              variant="ghost"
              aria-label={settings.dark ? "라이트 모드" : "다크 모드"}
              onClick={() =>
                void run(() =>
                  db.settings.update("main", { dark: !settings.dark }),
                )
              }
            >
              {settings.dark ? <Sun size={19} /> : <Moon size={19} />}
            </Button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {sample ? "가상 샘플로 살펴보기" : "나의 카드 혜택 노트"}
              </p>
              <h1>
                {page === "dashboard"
                  ? "내 소비, 더 현명하게."
                  : navigation.find((n) => n[0] === page)?.[1]}
              </h1>
              <p className="subtitle">
                {page === "dashboard"
                  ? "결제내역으로 살펴보는 카드 혜택과 전월실적"
                  : page === "transactions"
                    ? "원본은 보존하고, 분류와 계산 근거는 명확하게"
                    : page === "cards"
                      ? "직접 확인한 약관으로 나만의 카드 규칙을 관리하세요"
                      : page === "compare"
                        ? "같은 거래를 한 장의 카드로 결제했을 때의 예상 혜택"
                        : "데이터와 계산 가정을 직접 관리하세요"}
              </p>
            </div>
            <div className="heading-controls">
              <label className="sr-only" htmlFor="month">
                분석 월
              </label>
              <input
                id="month"
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
              <Button onClick={() => setImportOpen(true)}>
                <Upload size={16} />
                <span>내역 가져오기</span>
              </Button>
            </div>
          </div>
          <div className="workspace-toggle">
            <div>
              <button aria-pressed={!sample} onClick={() => setSample(false)}>
                내 데이터
              </button>
              <button aria-pressed={sample} onClick={() => setSample(true)}>
                샘플 모드
              </button>
            </div>
            <span>
              {sample
                ? "가상 카드·6개월 샘플 · 실제 상품 비교 아님"
                : "회원가입 없이, 이 브라우저에만 저장"}
            </span>
          </div>
          {error && (
            <div className="error mb-4" role="alert">
              {error}
              <button
                aria-label="오류 닫기"
                className="ml-3 underline"
                onClick={() => setError("")}
              >
                닫기
              </button>
            </div>
          )}
          {notice && (
            <div className="success mb-4" role="status">
              <Check size={16} />
              {notice}
              <button
                className="ml-auto underline"
                onClick={() => setNotice("")}
              >
                닫기
              </button>
            </div>
          )}
          {!transactions.length && (
            <Panel className="empty-state">
              <span className="empty-icon">
                <CreditCard size={30} />
              </span>
              <h2>첫 결제내역을 등록해 보세요</h2>
              <p>
                CSV·엑셀 내역을 가져오거나 개인정보 없는 샘플로 살펴볼 수
                있어요.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <Upload size={16} />내 결제내역 가져오기
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      await loadSample();
                      setSample(true);
                      setMonth("2026-10");
                    }, "6개월 샘플을 불러왔습니다. 내 데이터와 분리해서 표시합니다.")
                  }
                >
                  6개월 샘플 둘러보기
                </Button>
              </div>
            </Panel>
          )}
          {page === "dashboard" && (
            <>
              <div className="metric-grid">
                <Metric
                  title="이번 달 순결제액"
                  value={won(monthSpend)}
                  foot="원화 확인 거래 · 연결 환불 차감"
                  icon={<Wallet size={19} />}
                />
                <Metric
                  title="실제 배분의 예상 혜택"
                  value={won(total)}
                  foot={
                    incomplete
                      ? "미확정 거래 포함 · 부분 합계"
                      : "입력한 규칙 기준 · 확정 혜택 아님"
                  }
                  icon={<CreditCard size={19} />}
                />
                <Metric
                  title="단독 카드 최대 예상"
                  value={best ? won(best.total) : "판정 불가"}
                  foot="판정 가능한 단독 시나리오 범위"
                  accent
                  icon={<TrendingUp size={19} />}
                />
                <Metric
                  title="추가 절약 가능액"
                  value={
                    best && !incomplete
                      ? won(Math.max(0, best.total - total))
                      : "판정 불가"
                  }
                  foot="연회비 제외 · 가정에 따라 달라져요"
                  icon={<ArrowDownToLine size={19} />}
                />
              </div>
              <div className="dashboard-grid">
                <Panel>
                  <div className="section-heading">
                    <div>
                      <h2>월별 소비 흐름</h2>
                      <p>최근 6개월 · 승인일 기준</p>
                    </div>
                    <Badge>소비 / 예상 혜택</Badge>
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={monthly}
                        margin={{ top: 15, right: 15, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="spend-fill"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#62a58e"
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="100%"
                              stopColor="#62a58e"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 5"
                          vertical={false}
                          stroke="#d9e3df"
                        />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(n) => `${n / 10000}만`}
                          axisLine={false}
                          tickLine={false}
                          width={48}
                        />
                        <Tooltip
                          formatter={(n, name) => [
                            won(Number(n)),
                            name === "spend" ? "소비액" : "예상 혜택",
                          ]}
                        />
                        <YAxis
                          yAxisId="benefit"
                          orientation="right"
                          axisLine={false}
                          tickLine={false}
                          width={44}
                          tickFormatter={(n) => `${n / 10000}만`}
                        />
                        <Area
                          isAnimationActive={false}
                          name="spend"
                          type="monotone"
                          dataKey="spend"
                          stroke="#29775d"
                          strokeWidth={2.5}
                          fill="url(#spend-fill)"
                        />
                        <Area
                          isAnimationActive={false}
                          name="benefit"
                          yAxisId="benefit"
                          type="monotone"
                          dataKey="benefit"
                          stroke="#94b9ef"
                          fill="none"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="bg-emerald-700" />
                      소비액
                    </span>
                    <span>
                      <i className="bg-blue-300" />
                      예상 혜택 (규칙 기준)
                    </span>
                  </div>
                </Panel>
                <Panel className="insight-panel">
                  <div className="flex items-center gap-2">
                    <span className="insight-icon">
                      <SlidersHorizontal size={19} />
                    </span>
                    <h2>이번 달 체크 포인트</h2>
                  </div>
                  <div className="insight-value">
                    {won(activeResults.reduce((n, r) => n + r.performance, 0))}
                  </div>
                  <p>
                    다음 달에 사용할 실적 인정액 합계
                    <br />
                    {activeResults.some((r) => r.performancePending)
                      ? "확인되지 않은 항목이 있어 부분 합계입니다."
                      : "각 카드의 실적 제외 규칙을 적용했습니다."}
                  </p>
                  <div className="insight-divider" />
                  <strong>명세서에 기록된 확정 혜택</strong>
                  <div className="mt-2 text-2xl font-bold">
                    {recorded.length
                      ? won(recordedTotal)
                      : "아직 입력하지 않았어요"}
                  </div>
                  <p>
                    {recorded.length
                      ? `${recorded.length}/${monthTx.length}건만 확인 · 예상액과 별도 집계`
                      : "계산 결과는 예상값입니다. 명세서의 실제 혜택은 결제내역에서 따로 입력할 수 있어요."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setPage("transactions")}
                  >
                    거래별 근거 확인
                    <ArrowRight size={16} />
                  </Button>
                </Panel>
              </div>
              <div className="dashboard-grid">
                <Panel>
                  <div className="section-heading">
                    <div>
                      <h2>카드별 실적 상태</h2>
                      <p>전월 자료가 확인된 카드만 판정합니다.</p>
                    </div>
                    <Button variant="ghost" onClick={() => setPage("cards")}>
                      관리
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                  <div className="status-list">
                    {results
                      .filter(
                        (r) =>
                          cards.find((c) => c.id === r.cardId)?.owned ||
                          transactions.some((t) => t.cardId === r.cardId),
                      )
                      .map((r) => (
                        <div key={r.cardId} className="status-row">
                          <span className="mini-card">
                            <CreditCard size={19} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <strong>
                              {cards.find((c) => c.id === r.cardId)?.name}
                            </strong>
                            <small>
                              전월{" "}
                              {r.previousPerformance === null
                                ? "자료 미확인"
                                : won(r.previousPerformance)}{" "}
                              · 다음 달{" "}
                              {r.performancePending ? "부분 합계 " : ""}
                              {won(r.performance)}
                            </small>
                          </div>
                          <Badge
                            tone={r.eligibility === "met" ? "green" : "amber"}
                          >
                            {labelStatus(r.eligibility)}
                          </Badge>
                        </div>
                      ))}
                  </div>
                  {!activeResults.length && (
                    <p className="text-sm text-slate-500">
                      결제내역을 등록하면 실적 상태가 표시됩니다.
                    </p>
                  )}
                  <p className="fine-print">
                    실제 카드의 초기 규칙은 모두 검증 필요입니다. 할인율과
                    한도를 임의로 채우지 않습니다.
                  </p>
                </Panel>
                <Panel>
                  <div className="section-heading">
                    <div>
                      <h2>최근 결제내역</h2>
                      <p>이 달의 최근 5건</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => setPage("transactions")}
                    >
                      전체 보기
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                  {[...monthTx]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .map((t) => (
                      <button
                        key={t.id}
                        className="recent-row"
                        onClick={() => setEditTx(t)}
                      >
                        <span className="merchant-icon">
                          {t.merchant.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{t.merchant}</strong>
                          <small>
                            {t.date} · {t.category}
                          </small>
                        </span>
                        <strong className="ml-auto tabular-nums">
                          {t.kind === "refund" ? "-" : ""}
                          {transactionAmount(t)}
                        </strong>
                      </button>
                    ))}
                  {!monthTx.length && (
                    <p className="py-5 text-sm text-slate-500">
                      선택한 월에 결제내역이 없습니다.
                    </p>
                  )}
                  <div className="tip">
                    <ShieldCheck size={18} />
                    <p>
                      혜택보다 먼저 실적을 확인하세요. 전월 자료를 모두 등록한
                      후 설정에서 자료 확인을 표시할 수 있어요.
                    </p>
                  </div>
                </Panel>
              </div>
            </>
          )}
          {page === "transactions" && (
            <Panel>
              <div className="section-heading">
                <div>
                  <h2>
                    결제내역{" "}
                    <span className="text-slate-400">{filtered.length}건</span>
                  </h2>
                  <p>환불은 승인금액에 더하지 않고 별도로 연결합니다.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void run(exportCsv)}>
                    <Download size={16} />
                    결과 CSV
                  </Button>
                  <Button variant="outline" onClick={newTransaction}>
                    <Plus size={16} />
                    직접 입력
                  </Button>
                </div>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="가맹점 검색"
                    placeholder="가맹점 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="업종 필터"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">전체 업종</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>승인일</th>
                      <th>가맹점 / 사용 카드</th>
                      <th>분류</th>
                      <th className="text-right">승인금액</th>
                      <th className="text-right">예상 혜택</th>
                      <th className="text-right">실적 인정</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((t) => {
                      const line = lineMap.get(t.id);
                      return (
                        <tr key={t.id}>
                          <td className="whitespace-nowrap">
                            {t.date}
                            <small>
                              {t.kind === "refund" ? "취소·환불" : ""}
                            </small>
                          </td>
                          <td>
                            <strong>{t.merchant}</strong>
                            <small>
                              {cards.find((c) => c.id === t.cardId)?.name}{" "}
                              {t.review && (
                                <span className="text-amber-700">
                                  {" "}
                                  · 확인 필요
                                </span>
                              )}
                            </small>
                          </td>
                          <td>
                            <Badge>{t.category}</Badge>
                          </td>
                          <td className="text-right tabular-nums">
                            {t.kind === "refund" ? "-" : ""}
                            {transactionAmount(t)}
                          </td>
                          <td className="text-right">
                            {line ? (
                              <button
                                className="amount-link"
                                onClick={() => setDetail(line)}
                              >
                                {line.pending ? "미확정" : won(line.total)}
                                <ChevronRight size={13} />
                              </button>
                            ) : (
                              "선택 산정기간 밖"
                            )}
                          </td>
                          <td className="text-right">
                            {line?.performancePending
                              ? "부분/미확정"
                              : won(line?.performance ?? 0)}
                          </td>
                          <td>
                            <div className="flex">
                              <Button
                                variant="ghost"
                                aria-label={`${t.merchant} 편집`}
                                onClick={() => setEditTx(t)}
                              >
                                편집
                              </Button>
                              <Button
                                variant="ghost"
                                aria-label={`${t.merchant} 삭제`}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "이 거래를 삭제할까요? 연결된 환불은 확인 대상으로 바뀔 수 있습니다.",
                                    )
                                  )
                                    void run(
                                      () => db.transactions.delete(t.id),
                                      "거래가 삭제되었습니다.",
                                    );
                                }}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <p className="py-12 text-center text-slate-500">
                  조건에 맞는 결제내역이 없습니다.
                </p>
              )}
              {filtered.length > 500 && (
                <p className="notice">
                  첫 500건을 표시합니다. 검색과 업종 필터로 범위를 줄이세요.
                  계산에는 전체 거래를 사용합니다.
                </p>
              )}
            </Panel>
          )}
          {page === "cards" && (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  공식적으로 확인하지 않은 상품은 계산에 포함되지 않습니다.
                </p>
                <Button onClick={newCard}>
                  <Plus size={16} />
                  카드 직접 등록
                </Button>
              </div>
              <div className="card-grid">
                {cards.map((c, i) => (
                  <Panel key={c.id} className="card-panel">
                    <div className={`card-art art-${i % 4}`}>
                      <CreditCard size={26} />
                      <span>{c.issuer}</span>
                      <div className="card-art-number">
                        •••• &nbsp; •••• &nbsp; CARDWISE
                      </div>
                      <strong>
                        {c.type === "credit" ? "CREDIT" : "DEBIT"} {c.pack}
                      </strong>
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-2">
                      <h2>
                        {c.name} {c.pack}
                      </h2>
                      <Badge
                        tone={
                          c.rules.every((r) => r.status === "unverified")
                            ? "amber"
                            : "green"
                        }
                      >
                        {c.rules.every((r) => r.status === "unverified")
                          ? "검증 필요"
                          : c.rules.every((r) => r.status === "demo")
                            ? "가상 예제"
                            : "입력 규칙"}
                      </Badge>
                    </div>
                    <p className="my-3 text-sm text-slate-500">
                      {c.owned ? "보유 카드" : "미보유"} ·{" "}
                      {c.rules.every((r) => r.status === "unverified")
                        ? "연회비 미확인 (기본값 0원)"
                        : `연회비 ${won(c.annualFee)}`}{" "}
                      · 규칙 {c.rules.length}개
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditCard(c)}
                      >
                        규칙 편집
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`${c.name} 복제`}
                        onClick={() =>
                          void run(
                            () =>
                              db.cards.add({
                                ...structuredClone(c),
                                id: crypto.randomUUID(),
                                name: c.name + " (복제)",
                              }),
                            "카드를 복제했습니다.",
                          )
                        }
                      >
                        <Copy size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`${c.name} 삭제`}
                        onClick={() => void run(() => deleteCard(c))}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            </>
          )}
          {page === "compare" && (
            <>
              <Panel className="mb-5">
                <div className="section-heading">
                  <div>
                    <h2>단독 카드 시나리오</h2>
                    <p>
                      선택 월의 거래를 한 장에 배분합니다. 여러 장 조합·추천
                      배분은 아직 지원하지 않습니다.
                    </p>
                  </div>
                  <Badge tone="blue">예상값</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="이전 달 실적 계산 모드">
                    <select
                      value={historyMode}
                      onChange={(e) =>
                        setHistoryMode(e.target.value as typeof historyMode)
                      }
                    >
                      <option value="actual">
                        실제 기록된 카드별 이전 실적 유지
                      </option>
                      <option value="reassigned">
                        이전 거래도 해당 카드에 재배분 (가정)
                      </option>
                    </select>
                  </Field>
                  <Field
                    label="선택 월의 전월실적 가정 (원)"
                    hint="빈칸은 실제 계산. 입력하면 모든 후보에 같은 가정을 적용."
                  >
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      value={assumption}
                      onChange={(e) => setAssumption(e.target.value)}
                      placeholder="실제 이전 달 자료 사용"
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAssumption("500000")}
                  >
                    50만원 가정
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAssumption("1000000")}
                  >
                    100만원 가정
                  </Button>
                  <Button variant="ghost" onClick={() => setAssumption("")}>
                    가정 해제
                  </Button>
                </div>
                <p className="fine-print">
                  거래는 나누어 결제하지 않습니다. 검증 필요 카드와 내 데이터
                  모드의 가상 카드는 비교에서 제외합니다. 취소 연결·이용 가능
                  조건이 미확정이면 결과도 미확정입니다.
                </p>
              </Panel>
              <Panel>
                <div className="section-heading">
                  <div>
                    <h2>예상 혜택 비교</h2>
                    <p>연회비·발급비용 제외 · 선택 월 산정기간 기준</p>
                  </div>
                </div>
                {comparisons.length ? (
                  <>
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={comparisons.map((r) => ({
                            name: cards.find((c) => c.id === r.cardId)?.name,
                            value: r.pending ? 0 : r.total,
                          }))}
                          layout="vertical"
                          margin={{ left: 15, right: 25 }}
                        >
                          <CartesianGrid
                            horizontal={false}
                            strokeDasharray="3 5"
                          />
                          <XAxis
                            type="number"
                            tickFormatter={(n) => `${n / 10000}만`}
                          />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={130}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip formatter={(n) => won(Number(n))} />
                          <Bar
                            isAnimationActive={false}
                            dataKey="value"
                            fill="#2a7a60"
                            radius={[0, 6, 6, 0]}
                            maxBarSize={34}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>카드</th>
                            <th>예상 혜택</th>
                            <th>현재 배분 대비</th>
                            <th>전월 / 이번 실적</th>
                            <th>한도 소진</th>
                            <th>상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisons.map((r) => (
                            <tr key={r.cardId}>
                              <td>
                                <strong>
                                  {cards.find((c) => c.id === r.cardId)?.name}
                                </strong>
                                <small>
                                  {r.assumed ? "전월 가정 사용" : "자료 기준"} ·{" "}
                                  {historyMode === "actual"
                                    ? "실제 이전 배분"
                                    : "이전 배분도 가정"}
                                </small>
                              </td>
                              <td>
                                {r.pending
                                  ? "미확정 (부분 " + won(r.total) + ")"
                                  : won(r.total)}
                              </td>
                              <td>
                                {r.pending || incomplete
                                  ? "판정 불가"
                                  : won(r.total - total)}
                              </td>
                              <td>
                                {r.previousPerformance === null
                                  ? "미확인"
                                  : won(r.previousPerformance)}{" "}
                                / {won(r.performance)}
                              </td>
                              <td>
                                {won(r.capUsed)} /{" "}
                                {r.cap === null ? "한도 없음" : won(r.cap)}
                              </td>
                              <td>
                                <Badge tone={r.pending ? "amber" : "green"}>
                                  {labelStatus(r.eligibility)}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="empty-copy">
                    비교 가능한 카드가 없습니다. 카드 관리에서 직접 확인한 혜택
                    규칙을 등록하세요.
                  </p>
                )}
              </Panel>
              <p className="notice mt-5">
                월 혜택을 12배하여 연간 혜택으로 단정하지 않습니다. 신규 카드의
                연회비·발급비용을 반영한 연간 순혜택, 2~3장 조합과 장기 배분은
                아직 지원하지 않습니다.
              </p>
            </>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <Panel>
                <h2>계산 설정</h2>
                <p className="subtitle mb-5">
                  실제 기록과 가정은 분리해서 관리합니다.
                </p>
                <Field label="포인트 1P의 가치 (원)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pointDraft}
                    onChange={(e) => setPointDraft(e.target.value)}
                    onBlur={() =>
                      void run(async () => {
                        const n = Number(pointDraft);
                        if (
                          !pointDraft ||
                          !Number.isFinite(n) ||
                          n < 0 ||
                          n > 100
                        ) {
                          setPointDraft(String(settings.pointValue));
                          throw Error("포인트 가치는 0~100원으로 입력하세요.");
                        }
                        await db.settings.update("main", { pointValue: n });
                      })
                    }
                  />
                </Field>
                <div className="my-5 border-t pt-5 dark:border-slate-700">
                  <h3 className="font-bold">월 자료 확인</h3>
                  <p className="my-2 text-sm text-slate-500">
                    이 달의 모든 카드 이용내역을 등록한 경우에만 표시하세요.
                    다음 달 전월실적 판정에 사용합니다. 거래가 0건인 카드도
                    완전한 0원으로 간주됩니다.
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={(
                        knownMonthsDraft ?? settings.knownMonths
                      ).includes(month)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [
                              ...new Set([
                                ...(knownMonthsDraft ?? settings.knownMonths),
                                month,
                              ]),
                            ]
                          : (knownMonthsDraft ?? settings.knownMonths).filter(
                              (m) => m !== month,
                            );
                        setKnownMonthsDraft(next);
                        void run(async () => {
                          try {
                            await db.settings.update("main", {
                              knownMonths: next,
                            });
                          } catch (error) {
                            setKnownMonthsDraft(settings.knownMonths);
                            throw error;
                          }
                        });
                      }}
                    />
                    {month} 내 실제 자료를 모두 확인함
                  </label>
                  <p className="fine-print">
                    샘플 모드는 샘플 기간만 별도로 확인된 자료로 사용합니다.
                    매입일 기준은 필요한 기간의 승인내역까지 모두 등록하세요.
                  </p>
                  <p className="text-sm">
                    확인한 월: {settings.knownMonths.join(", ") || "없음"}
                  </p>
                </div>
                <p className="notice">
                  계산 결과는 입력한 약관과 자료를 기준으로 한 예상입니다. 실제
                  청구 금액은 카드사 명세서를 확인하세요.
                </p>
              </Panel>
              <Panel>
                <h2>데이터 백업과 복원</h2>
                <p className="my-3 text-sm text-slate-500">
                  백업에는 모든 결제내역과 규칙이 포함됩니다. 안전한 개인
                  저장소에 보관하세요.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(
                        async () =>
                          saveDownload(
                            JSON.stringify(await backup(), null, 2),
                            "cardwise-backup.json",
                            "application/json",
                          ),
                        "백업을 내려받았습니다.",
                      )
                    }
                  >
                    <Download size={16} />
                    전체 JSON 백업
                  </Button>
                  <label className="file-button secondary">
                    <Upload size={16} />
                    JSON 복원
                    <input
                      aria-label="백업 복원 파일"
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void run(async () => {
                            if (file.size > 20 * 1024 * 1024)
                              throw Error("백업은 20MB 이하만 지원합니다.");
                            const raw = JSON.parse(await file.text());
                            backupSchema.parse(raw);
                            if (
                              window.confirm(
                                "백업으로 현재 데이터를 교체할까요? 먼저 기존 데이터를 백업하세요.",
                              )
                            ) {
                              await restore(raw);
                              setNotice("백업을 복원했습니다.");
                            }
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="my-5 text-sm leading-6 text-slate-500">
                  브라우저 데이터를 삭제하면 기록이 사라질 수 있습니다. 공유
                  기기에서는 다른 사용자가 데이터를 볼 수 있습니다. 카드번호와
                  카드사 로그인 정보를 입력하지 마세요.
                </p>
                <details className="advanced">
                  <summary>데이터 전체 삭제</summary>
                  <p className="my-3 text-sm">
                    금융 기록, 사용자 카드·규칙·매핑·설정을 삭제하고 초기 카드
                    목록으로 돌아갑니다.
                  </p>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 기기의 모든 CardWise 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
                        )
                      )
                        void run(async () => {
                          await deleteAll();
                          setSample(false);
                        }, "모든 사용자 데이터를 삭제했습니다. 초기 카드 목록만 남았습니다.");
                    }}
                  >
                    <Trash2 size={16} />
                    전체 데이터 삭제
                  </Button>
                </details>
              </Panel>
              <Panel className="sm:col-span-2">
                <div className="section-heading">
                  <div>
                    <h2>가맹점 분류 사전</h2>
                    <p>
                      위에 있는 키워드가 우선 적용됩니다. 기존 거래는 자동으로
                      덮어쓰지 않습니다.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        window.confirm(
                          "현재 모드의 기존 거래를 사전 기준으로 다시 분류할까요? 수동 분류도 변경됩니다.",
                        )
                      )
                        void run(
                          () =>
                            db.transactions.bulkPut(
                              transactions.map((t) => ({
                                ...t,
                                category: classify(
                                  t.merchant,
                                  data.classifications,
                                ),
                              })),
                            ),
                          "현재 모드의 거래를 다시 분류했습니다.",
                        );
                    }}
                  >
                    현재 거래 다시 분류
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="가맹점 키워드">
                    <input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="예: 스타벅스"
                    />
                  </Field>
                  <Field label="자동 분류">
                    <select
                      value={newCategory}
                      onChange={(e) =>
                        setNewCategory(e.target.value as typeof newCategory)
                      }
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    disabled={!newKeyword.trim()}
                    onClick={() =>
                      void run(async () => {
                        await db.classifications.add({
                          id: crypto.randomUUID(),
                          keyword: newKeyword.trim(),
                          category: newCategory,
                        });
                        setNewKeyword("");
                      }, "분류 규칙을 추가했습니다.")
                    }
                  >
                    규칙 추가
                  </Button>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {data.classifications.map((rule) => (
                    <div className="dictionary-row" key={rule.id}>
                      <input
                        aria-label={`${rule.keyword} 키워드 수정`}
                        defaultValue={rule.keyword}
                        onBlur={(e) => {
                          const keyword = e.target.value.trim();
                          if (keyword)
                            void run(() =>
                              db.classifications.update(rule.id, { keyword }),
                            );
                          else e.target.value = rule.keyword;
                        }}
                      />
                      <select
                        aria-label={`${rule.keyword} 분류 수정`}
                        value={rule.category}
                        onChange={(e) =>
                          void run(() =>
                            db.classifications.update(rule.id, {
                              category: e.target.value as typeof newCategory,
                            }),
                          )
                        }
                      >
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        aria-label={`${rule.keyword} 분류 삭제`}
                        onClick={() =>
                          void run(() => db.classifications.delete(rule.id))
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
          <footer className="app-footer">
            <ShieldCheck size={14} />
            <span>
              CardWise · 기기 내 계산 · 예상 혜택은 카드사 확정 청구액과 다를 수
              있습니다.
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {navigation.map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {importOpen && (
        <ImportDialog
          cards={cards}
          classifications={data.classifications}
          onClose={() => setImportOpen(false)}
          onImported={(s) => {
            setNotice(s);
            setSample(false);
            setPage("transactions");
          }}
        />
      )}
      {editCard && (
        <CardEditor
          card={editCard}
          onClose={() => setEditCard(null)}
          onSave={async (c) => {
            await db.cards.put(c);
            setNotice("카드와 규칙을 저장했습니다.");
          }}
        />
      )}
      {editTx && (
        <TransactionEditor
          transaction={editTx}
          cards={cards}
          transactions={data.transactions}
          onClose={() => setEditTx(null)}
          onSave={async (t) => {
            await db.transaction(
              "rw",
              db.transactions,
              db.settings,
              async () => {
                await db.transactions.put(t);
                if (!t.sample)
                  await db.settings.update("main", {
                    knownMonths: settings.knownMonths.filter(
                      (m) =>
                        m !== t.date.slice(0, 7) &&
                        m !== editTx.date.slice(0, 7),
                    ),
                  });
              },
            );
            setNotice("결제내역을 저장했습니다.");
          }}
        />
      )}
      {detail && (
        <Modal
          open
          onOpenChange={(v) => !v && setDetail(null)}
          title="거래별 계산 근거"
          description="금액은 원화 정수로 계산합니다. 명세서 확인 전에는 예상값입니다."
        >
          <div className="detail-grid">
            {(
              [
                ["승인금액", detail.principal],
                ["청구할인", detail.bill],
                ["현장할인", detail.instant],
                ["캐시백", detail.cashback],
                ["포인트", `${detail.points}P`],
                ["포인트 환산 가치", detail.pointWorth],
                ["예상 실질 부담", detail.net],
                ["실적 인정액", detail.performance],
                ["한도 소진", detail.capUsed],
              ] as const
            ).map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>
                  {name === "승인금액" &&
                  transactions.find((t) => t.id === detail.transactionId)
                    ?.foreign
                    ? transactionAmount(
                        transactions.find(
                          (t) => t.id === detail.transactionId,
                        )!,
                      )
                    : (name === "예상 실질 부담" && detail.pending) ||
                        (name === "실적 인정액" && detail.performancePending)
                      ? "미확정"
                      : typeof value === "number"
                        ? won(value)
                        : value}
                </strong>
              </div>
            ))}
          </div>
          <p className="my-4">
            <Badge tone={detail.pending ? "amber" : "green"}>
              {detail.pending ? "미확정 · 부분 계산" : "입력 규칙 기준 예상"}
            </Badge>
          </p>
          <p className="text-xs text-slate-500">
            규칙 버전 ID: {detail.ruleId ?? "없음"}
          </p>
          <ul className="reason-list">
            {detail.reasons.length ? (
              detail.reasons.map((reason, i) => <li key={i}>{reason}</li>)
            ) : (
              <li>적용 가능한 혜택 조건이 없습니다.</li>
            )}
          </ul>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  foot,
  icon,
  accent = false,
}: {
  title: string;
  value: string;
  foot: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Panel className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="flex items-center justify-between">
        <h2>{title}</h2>
        <span>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <p>{foot}</p>
    </Panel>
  );
}
