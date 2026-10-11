import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Upload, FileSpreadsheet } from "lucide-react";
import { db } from "../data/db";
import {
  fields,
  mapRows,
  readFile,
  suggestMapping,
  deduplicate,
  type RawRow,
} from "../domain/import";
import type { Card, ClassificationRule } from "../domain/model";
import { Modal, Button, Field, saveDownload } from "./ui";
export function ImportDialog({
  cards,
  classifications,
  onClose,
  onImported,
}: {
  cards: Card[];
  classifications: ClassificationRule[];
  onClose: () => void;
  onImported: (s: string) => void;
}) {
  const mappings = useLiveQuery(() => db.mappings.toArray(), []) ?? [];
  const [file, setFile] = useState<{
    rows: RawRow[];
    hash: string;
    headers: string[];
    name: string;
  } | null>(null);
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [defaultCard, setDefaultCard] = useState(cards[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mappingName, setMappingName] = useState("");
  const [mappingNotice, setMappingNotice] = useState("");
  const parsed = useMemo(
    () =>
      file
        ? mapRows(
            file.rows,
            columns,
            file.hash,
            defaultCard,
            cards,
            classifications,
          )
        : null,
    [file, columns, defaultCard, cards, classifications],
  );
  async function pick(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const data = await readFile(selected);
      setFile({ ...data, name: selected.name });
      setColumns(suggestMapping(data.headers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 읽기 실패");
    } finally {
      setBusy(false);
    }
  }
  async function importNow() {
    if (!parsed || parsed.errors.length) return;
    setBusy(true);
    setError("");
    try {
      let duplicates = 0,
        added = 0;
      await db.transaction("rw", db.transactions, db.settings, async () => {
        const result = deduplicate(
          parsed.transactions,
          await db.transactions.toArray(),
        );
        if (result.conflicts.length)
          throw Error(result.conflicts.slice(0, 3).join(" · "));
        await db.transactions.bulkAdd(result.added);
        duplicates = result.duplicates;
        added = result.added.length;
        if (result.added.length) {
          const settings = (await db.settings.get("main"))!;
          const changed = new Set(result.added.map((t) => t.date.slice(0, 7)));
          await db.settings.update("main", {
            knownMonths: settings.knownMonths.filter((m) => !changed.has(m)),
          });
        }
      });
      onImported(`${added}건 저장 · 동일 거래 ${duplicates}건 제외`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    } finally {
      setBusy(false);
    }
  }
  async function saveMapping() {
    setError("");
    try {
      if (!mappingName.trim()) throw Error("매핑 이름을 입력하세요.");
      const old = mappings.find((m) => m.name === mappingName.trim());
      await db.mappings.put({
        id: old?.id ?? crypto.randomUUID(),
        name: mappingName.trim(),
        columns,
      });
      setMappingNotice("매핑이 저장되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "매핑 저장 실패");
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="결제내역 가져오기"
      description="파일은 이 브라우저에서만 처리합니다. 카드번호나 계정 비밀번호는 필요하지 않습니다."
    >
      <div className="upload-area">
        <FileSpreadsheet size={32} />
        <strong>CSV 또는 XLSX 파일 선택</strong>
        <p>UTF-8 / EUC-KR CSV · XLSX 첫 시트 · 최대 20MB</p>
        <label className="file-button">
          <Upload size={16} />
          파일 선택
          <input
            aria-label="결제 파일"
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        <Button
          variant="ghost"
          onClick={() =>
            saveDownload(
              "\uFEFF거래ID,승인일,가맹점,승인금액,분류,온라인오프라인\nexample-1,2026-09-03,샘플 마트,350000,마트,오프라인\nexample-2,2026-10-04,샘플 카페,10000,카페,오프라인\nexample-3,2026-10-05,샘플 온라인몰,100000,온라인쇼핑,온라인\n",
              "cardwise-example.csv",
              "text/csv;charset=utf-8",
            )
          }
        >
          개인정보 없는 예제 CSV 다운로드
        </Button>
      </div>
      {busy && (
        <p role="status" className="my-3">
          파일 처리 중…
        </p>
      )}
      {file && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <strong>{file.name}</strong>
            <span className="text-sm text-slate-500">
              {file.rows.length.toLocaleString("ko-KR")}행
            </span>
          </div>
          <p className="my-3 text-sm text-slate-500">
            각 열을 연결한 뒤 미리보기를 확인하세요. 잘못된 행이 있으면 전체
            가져오기를 보류합니다.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="기본 카드 (카드 열이 없을 때)">
              <select
                value={defaultCard}
                onChange={(e) => setDefaultCard(e.target.value)}
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.pack}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="저장한 매핑 불러오기">
              <select
                defaultValue=""
                onChange={(e) => {
                  const m = mappings.find((m) => m.id === e.target.value);
                  if (m) {
                    setColumns(m.columns);
                    setMappingName(m.name);
                  }
                }}
              >
                <option value="">매핑 선택</option>
                {mappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {fields.map(([key, label]) => (
              <Field label={label} key={key}>
                <select
                  value={columns[key] ?? ""}
                  onChange={(e) =>
                    setColumns((c) => ({ ...c, [key]: e.target.value }))
                  }
                >
                  <option value="">연결하지 않음</option>
                  {file.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="my-4 flex flex-wrap items-end gap-2">
            <Field label="매핑 이름">
              <input
                value={mappingName}
                onChange={(e) => setMappingName(e.target.value)}
                placeholder="예: 우리카드 월별 내역"
              />
            </Field>
            <Button variant="outline" onClick={() => void saveMapping()}>
              매핑 저장
            </Button>
            {mappingNotice && <p role="status">{mappingNotice}</p>}
          </div>
          {parsed && parsed.errors.length > 0 && (
            <p role="alert" className="error">
              {parsed.errors.slice(0, 5).join("\n")}
              {parsed.errors.length > 5
                ? `\n외 ${parsed.errors.length - 5}행`
                : ""}
            </p>
          )}
          <div className="table-wrap my-4">
            <table>
              <caption className="sr-only">가져오기 미리보기</caption>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>가맹점</th>
                  <th>금액</th>
                  <th>분류</th>
                  <th>구분</th>
                </tr>
              </thead>
              <tbody>
                {parsed?.transactions.slice(0, 5).map((t, i) => (
                  <tr key={i}>
                    <td>{t.date}</td>
                    <td>{t.merchant}</td>
                    <td>{t.amount.toLocaleString("ko-KR")}원</td>
                    <td>{t.category}</td>
                    <td>{t.kind === "refund" ? "취소" : "승인"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="notice">
            환불은 원거래 ID로 연결합니다. 연결되지 않은 환불은 확인 대상으로
            남깁니다. 전월 자료의 완전성은 가져온 뒤 설정 화면에서 직접
            확인하세요.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="error mt-4">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          닫기
        </Button>
        <Button
          disabled={
            busy ||
            !parsed ||
            parsed.errors.length > 0 ||
            !parsed.transactions.length
          }
          onClick={() => void importNow()}
        >
          검증 후 가져오기
        </Button>
      </div>
    </Modal>
  );
}
