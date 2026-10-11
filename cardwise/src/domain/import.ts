import Papa from "papaparse";
import {
  categories,
  transactionSchema,
  type ClassificationRule,
  type Transaction,
  type Card,
} from "./model";
export type RawRow = Record<string, string>;
export const fields = [
  ["sourceId", "거래 고유 ID"],
  ["date", "승인일 *"],
  ["postedDate", "매입일"],
  ["merchant", "가맹점 *"],
  ["amount", "승인금액 *"],
  ["billingAmount", "원화 청구금액"],
  ["kind", "취소·환불 여부"],
  ["originalId", "원거래 ID"],
  ["cardId", "카드 이름/ID"],
  ["category", "분류"],
  ["industry", "업종"],
  ["foreign", "국내·해외"],
  ["currency", "통화"],
  ["paymentMethod", "결제수단"],
  ["channel", "온라인·오프라인"],
  ["interestFree", "무이자할부"],
  ["autoPay", "자동납부"],
  ["recordedBenefit", "확정 혜택 (원)"],
] as const;
const aliases: Record<string, string[]> = {
  sourceId: ["거래ID", "승인번호", "transactionid", "id"],
  date: ["승인일", "이용일자", "거래일", "date"],
  postedDate: ["매입일", "posteddate"],
  merchant: ["가맹점", "가맹점명", "이용가맹점", "merchant"],
  amount: ["승인금액", "이용금액", "금액", "amount"],
  billingAmount: ["원화청구금액", "청구금액"],
  kind: ["취소여부", "거래구분", "kind"],
  originalId: ["원거래ID", "원승인번호"],
  cardId: ["카드", "카드명", "card"],
  category: ["분류", "category"],
  industry: ["업종"],
  foreign: ["국내해외", "해외여부"],
  currency: ["통화", "currency"],
  paymentMethod: ["결제수단", "간편결제"],
  channel: ["온라인오프라인", "channel"],
  interestFree: ["무이자할부"],
  autoPay: ["자동납부"],
  recordedBenefit: ["확정혜택", "할인금액"],
};
const norm = (s: string) => s.replace(/[\s_*()-]/g, "").toLowerCase();
export function suggestMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, names] of Object.entries(aliases)) {
    const h = headers.find((h) => names.map(norm).includes(norm(h)));
    if (h) result[key] = h;
  }
  return result;
}
export function classify(
  merchant: string,
  rules: ClassificationRule[],
): Transaction["category"] {
  return (
    rules.find((r) => merchant.toLowerCase().includes(r.keyword.toLowerCase()))
      ?.category ?? "기타"
  );
}
export async function readFile(
  file: File,
): Promise<{ rows: RawRow[]; hash: string; headers: string[] }> {
  if (file.size > 20 * 1024 * 1024) throw Error("파일은 20MB 이하여야 합니다.");
  const bytes = await file.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  let rows: RawRow[];
  if (/\.xlsx$/i.test(file.name)) {
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    const sheet = book.worksheets[0];
    if (!sheet) throw Error("첫 시트가 없습니다.");
    const cellText = (value: unknown): string => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (value && typeof value === "object") {
        const v = value as {
          result?: unknown;
          text?: string;
          richText?: { text: string }[];
        };
        if ("result" in v) return cellText(v.result);
        if (v.text) return v.text;
        if (v.richText) return v.richText.map((x) => x.text).join("");
        return "";
      }
      return String(value ?? "");
    };
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, i) => {
      headers[i - 1] = cellText(cell.value).trim();
    });
    if (
      new Set(headers).size !== headers.length ||
      Array.from(headers).some((h) => !h)
    )
      throw Error("빈 열 제목 또는 중복 열 제목을 수정하세요.");
    rows = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const r: RawRow = {};
      headers.forEach((h, i) => (r[h] = cellText(row.getCell(i + 1).value)));
      if (Object.values(r).some(Boolean)) rows.push(r);
    });
  } else if (/\.csv$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("\uFFFD")) text = new TextDecoder("euc-kr").decode(bytes);
    const parsed = Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    });
    if (parsed.errors.length)
      throw Error(
        `CSV ${parsed.errors[0].row ?? ""}행: ${parsed.errors[0].message}`,
      );
    if (
      parsed.meta.renamedHeaders &&
      Object.keys(parsed.meta.renamedHeaders).length
    )
      throw Error("중복 열 제목을 수정하세요.");
    rows = parsed.data;
  } else throw Error("CSV 또는 XLSX 파일을 선택하세요.");
  if (!rows.length) throw Error("읽을 거래가 없습니다.");
  if (rows.length > 50000) throw Error("한 번에 50,000행까지 지원합니다.");
  return { rows, hash, headers: Object.keys(rows[0]) };
}
const number = (s: string, optional = false): number | undefined => {
  if (!s.trim() && optional) return undefined;
  const normalized = s.replace(/[,₩원\s]/g, "");
  if (!/^-?\d+$/.test(normalized))
    throw Error("금액은 원화 정수로 입력하세요.");
  return Number(normalized);
};
function date(s: string): string {
  const cleaned = s.trim().replace(/[./]/g, "-").replace(/\s.*/, "");
  const m = cleaned.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})$/);
  if (!m) throw Error("날짜 형식을 확인하세요.");
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
const yes = (s: string) =>
  /^(1|true|y|yes|예|해외|무이자|자동납부)$/i.test(s.trim());
export function mapRows(
  rows: RawRow[],
  columns: Record<string, string>,
  hash: string,
  defaultCard: string,
  cards: Card[],
  rules: ClassificationRule[],
): { transactions: Transaction[]; errors: string[] } {
  const transactions: Transaction[] = [],
    errors: string[] = [];
  for (const key of ["date", "merchant", "amount"])
    if (!columns[key])
      return {
        transactions: [],
        errors: ["승인일, 가맹점, 승인금액 열을 모두 연결하세요."],
      };
  rows.forEach((row, index) => {
    try {
      const get = (key: string) => String(row[columns[key]] ?? "").trim();
      const cardValue = get("cardId");
      let cardId = defaultCard;
      if (cardValue) {
        const matches = cards.filter(
          (c) =>
            c.id === cardValue ||
            c.name === cardValue ||
            `${c.name} ${c.pack}`.trim() === cardValue,
        );
        if (matches.length !== 1)
          throw Error(
            `카드 "${cardValue}"를 고유하게 찾을 수 없습니다. 카드 열 연결을 해제하고 기본 카드를 선택하세요.`,
          );
        cardId = matches[0].id;
      }
      const signed = number(get("amount"))!;
      const sourceId = get("sourceId");
      const merchant = get("merchant");
      const kind =
        signed < 0 || /취소|환불|refund|cancel/i.test(get("kind"))
          ? "refund"
          : "purchase";
      const category = get("category");
      if (category && !categories.includes(category as Transaction["category"]))
        throw Error(
          `분류 "${category}"는 지원하지 않습니다. 분류 열 연결을 해제하면 자동 분류합니다.`,
        );
      const originalId = get("originalId");
      const currency = get("currency") || "KRW";
      const transaction = transactionSchema.parse({
        id: sourceId ? `${cardId}:${sourceId}` : `file:${hash}:${index}`,
        sourceId,
        source: "import",
        date: date(get("date")),
        postedDate: get("postedDate") ? date(get("postedDate")) : undefined,
        merchant,
        amount: Math.abs(signed),
        billingAmount: get("billingAmount")
          ? Math.abs(number(get("billingAmount"))!)
          : undefined,
        cardId,
        kind,
        originalId: originalId ? `${cardId}:${originalId}` : undefined,
        category: category || classify(merchant, rules),
        industry: get("industry"),
        currency,
        foreign: yes(get("foreign")) || currency !== "KRW",
        paymentMethod: get("paymentMethod") || "일반",
        channel: /온라인|online/i.test(get("channel"))
          ? "online"
          : /오프라인|offline/i.test(get("channel"))
            ? "offline"
            : "unknown",
        interestFree: yes(get("interestFree")),
        autoPay: yes(get("autoPay")),
        recordedBenefit: number(get("recordedBenefit"), true),
        review:
          kind === "refund" && !originalId
            ? "원거래 ID를 연결하세요."
            : undefined,
      });
      transactions.push(transaction);
    } catch (e) {
      errors.push(
        `${index + 2}행: ${e instanceof Error ? e.message : "값 검증 실패"}`,
      );
    }
  });
  return { transactions, errors };
}
export function deduplicate(
  incoming: Transaction[],
  existing: Transaction[],
): { added: Transaction[]; duplicates: number; conflicts: string[] } {
  const seen = new Map(existing.map((t) => [t.id, t]));
  const added: Transaction[] = [],
    conflicts: string[] = [];
  let duplicates = 0;
  for (const t of incoming) {
    const old = seen.get(t.id);
    if (old) {
      const keys = [
        "date",
        "merchant",
        "amount",
        "billingAmount",
        "kind",
        "originalId",
        "cardId",
      ] as const;
      if (keys.some((k) => old[k] !== t[k]))
        conflicts.push(
          `${t.sourceId || t.id}: 같은 ID의 거래 내용이 다릅니다.`,
        );
      else duplicates++;
    } else {
      seen.set(t.id, t);
      added.push(t);
    }
  }
  return { added, duplicates, conflicts };
}
