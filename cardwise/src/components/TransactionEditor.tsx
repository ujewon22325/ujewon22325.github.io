import { useState } from "react";
import {
  categories,
  transactionSchema,
  type Card,
  type Transaction,
} from "../domain/model";
import { Button, Field, Modal } from "./ui";
export function TransactionEditor({
  transaction,
  cards,
  transactions,
  onClose,
  onSave,
}: {
  transaction: Transaction;
  cards: Card[];
  transactions: Transaction[];
  onClose: () => void;
  onSave: (t: Transaction) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...transaction });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function set(changes: Partial<Transaction>) {
    setDraft((d) => ({ ...d, ...changes }));
  }
  async function save() {
    setError("");
    setBusy(true);
    try {
      let review = draft.review;
      if (draft.kind === "purchase") review = undefined;
      else if (draft.originalId) {
        const original = transactions.find((t) => t.id === draft.originalId);
        if (
          !original ||
          original.cardId !== draft.cardId ||
          original.kind !== "purchase" ||
          original.date > draft.date
        )
          throw Error("원거래는 같은 카드의 이전 승인 거래여야 합니다.");
        review = undefined;
      } else review = "원거래 ID를 연결하세요.";
      await onSave(transactionSchema.parse({ ...draft, review }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력 확인 필요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="결제내역 편집">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="승인일">
          <input
            type="date"
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </Field>
        <Field label="매입일">
          <input
            type="date"
            value={draft.postedDate ?? ""}
            onChange={(e) => set({ postedDate: e.target.value || undefined })}
          />
        </Field>
        <Field label="가맹점">
          <input
            value={draft.merchant}
            onChange={(e) => set({ merchant: e.target.value })}
          />
        </Field>
        <Field label="금액 (항상 양수)">
          <input
            type="number"
            min="1"
            value={draft.amount}
            onChange={(e) => set({ amount: Number(e.target.value) })}
          />
        </Field>
        <Field label="사용한 카드">
          <select
            value={draft.cardId}
            onChange={(e) => set({ cardId: e.target.value })}
          >
            {cards.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} {c.pack}
              </option>
            ))}
          </select>
        </Field>
        <Field label="분류">
          <select
            value={draft.category}
            onChange={(e) =>
              set({ category: e.target.value as Transaction["category"] })
            }
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="업종 (원본)">
          <input
            value={draft.industry}
            onChange={(e) => set({ industry: e.target.value })}
          />
        </Field>
        <Field label="승인 / 환불">
          <select
            value={draft.kind}
            onChange={(e) =>
              set({ kind: e.target.value as Transaction["kind"] })
            }
          >
            <option value="purchase">승인</option>
            <option value="refund">취소·환불</option>
          </select>
        </Field>
        {draft.kind === "refund" && (
          <Field label="연결할 원거래">
            <select
              value={draft.originalId ?? ""}
              onChange={(e) => set({ originalId: e.target.value || undefined })}
            >
              <option value="">미확인 · 계산 보류</option>
              {transactions
                .filter(
                  (t) =>
                    t.id !== draft.id &&
                    t.kind === "purchase" &&
                    t.cardId === draft.cardId &&
                    t.date <= draft.date,
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.date} · {t.merchant} · {t.amount.toLocaleString()}원 ·{" "}
                    {t.sourceId || t.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="국내·해외">
          <select
            value={draft.foreign ? "foreign" : "domestic"}
            onChange={(e) => set({ foreign: e.target.value === "foreign" })}
          >
            <option value="domestic">국내</option>
            <option value="foreign">해외</option>
          </select>
        </Field>
        <Field label="통화">
          <input
            value={draft.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="원화 청구금액">
          <input
            type="number"
            min="0"
            value={draft.billingAmount ?? ""}
            onChange={(e) =>
              set({
                billingAmount:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="결제수단">
          <input
            value={draft.paymentMethod}
            onChange={(e) => set({ paymentMethod: e.target.value })}
          />
        </Field>
        <Field label="온라인·오프라인">
          <select
            value={draft.channel}
            onChange={(e) =>
              set({ channel: e.target.value as Transaction["channel"] })
            }
          >
            <option value="unknown">미확인</option>
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
          </select>
        </Field>
        <Field
          label="실제 확정 혜택 (원)"
          hint="명세서에서 확인한 할인·캐시백·포인트 환산액 합계. 없으면 미입력."
        >
          <input
            type="number"
            min="0"
            value={draft.recordedBenefit ?? ""}
            onChange={(e) =>
              set({
                recordedBenefit:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.interestFree}
            onChange={(e) => set({ interestFree: e.target.checked })}
          />
          무이자할부
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.autoPay}
            onChange={(e) => set({ autoPay: e.target.checked })}
          />
          자동납부
        </label>
      </div>
      {error && (
        <p role="alert" className="error mt-4">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          결제 저장
        </Button>
      </div>
    </Modal>
  );
}
