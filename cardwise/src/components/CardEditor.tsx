import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  cardSchema,
  categories,
  emptyCondition,
  emptyRule,
  type Card,
  type Benefit,
  type RuleVersion,
} from "../domain/model";
import { Button, Field, Modal, Badge, labelStatus } from "./ui";
export function CardEditor({
  card,
  onClose,
  onSave,
}: {
  card: Card;
  onClose: () => void;
  onSave: (card: Card) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Card>(structuredClone(card));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const rule = draft.rules[version];
  function update(changes: Partial<Card>) {
    setDraft((d) => ({ ...d, ...changes }));
  }
  function updateRule(changes: Partial<RuleVersion>) {
    setDraft((d) => ({
      ...d,
      rules: d.rules.map((r, i) => (i === version ? { ...r, ...changes } : r)),
    }));
  }
  function updateBenefit(index: number, changes: Partial<Benefit>) {
    updateRule({
      benefits: rule.benefits.map((b, i) =>
        i === index ? { ...b, ...changes } : b,
      ),
    });
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const parsed = cardSchema.safeParse(draft);
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(" · "));
        return;
      }
      await onSave(parsed.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }
  const num = (n: string) => Number(n) || 0;
  const cap = (n: string) => (n === "" ? null : Number(n));
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="카드와 혜택 규칙 편집"
      description="약관에서 확인한 조건을 입력하세요. 가상 예제는 실제 카드 상품의 혜택이 아닙니다."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="카드 이름">
          <input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label="카드사">
          <input
            value={draft.issuer}
            onChange={(e) => update({ issuer: e.target.value })}
          />
        </Field>
        <Field label="종류">
          <select
            value={draft.type}
            onChange={(e) => update({ type: e.target.value as Card["type"] })}
          >
            <option value="credit">신용카드</option>
            <option value="debit">체크카드</option>
          </select>
        </Field>
        <Field label="팩 / 옵션">
          <input
            value={draft.pack}
            onChange={(e) => update({ pack: e.target.value })}
            placeholder="예: A팩"
          />
        </Field>
        <Field label="연회비 (원)">
          <input
            type="number"
            min="0"
            value={draft.annualFee}
            onChange={(e) => update({ annualFee: num(e.target.value) })}
          />
        </Field>
        <Field label="신규 발급 비용 (원)">
          <input
            type="number"
            min="0"
            value={draft.issueFee}
            onChange={(e) => update({ issueFee: num(e.target.value) })}
          />
        </Field>
        <Field label="발급일 (유예기간에 필요)">
          <input
            type="date"
            value={draft.issuedDate ?? ""}
            onChange={(e) =>
              update({ issuedDate: e.target.value || undefined })
            }
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.owned}
            onChange={(e) => update({ owned: e.target.checked })}
          />
          이미 보유한 카드
        </label>
      </div>
      <div className="my-6 border-t border-slate-200 pt-5 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">기간별 규칙 버전</h3>
          <Button
            variant="outline"
            onClick={() => {
              const next = {
                ...(rule ?? emptyRule()),
                id: crypto.randomUUID(),
                start: new Date().toISOString().slice(0, 10),
                end: null,
                status: "unverified" as const,
              };
              update({ rules: [...draft.rules, next] });
              setVersion(draft.rules.length);
            }}
          >
            <Plus size={16} />새 버전
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.rules.map((r, i) => (
            <Button
              key={r.id}
              variant={i === version ? "default" : "outline"}
              onClick={() => setVersion(i)}
            >
              v{i + 1} · {r.start}
            </Button>
          ))}
        </div>
      </div>
      {rule ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="적용 시작일">
              <input
                type="date"
                value={rule.start}
                onChange={(e) => updateRule({ start: e.target.value })}
              />
            </Field>
            <Field label="적용 종료일 (없으면 계속)">
              <input
                type="date"
                value={rule.end ?? ""}
                onChange={(e) => updateRule({ end: e.target.value || null })}
              />
            </Field>
            <Field
              label="검증 상태"
              hint="사용자 확인은 공식 인증이 아닙니다. 입력한 조건을 신뢰한 예상값입니다."
            >
              <select
                value={rule.status}
                onChange={(e) =>
                  updateRule({
                    status: e.target.value as RuleVersion["status"],
                  })
                }
              >
                <option value="unverified">검증 필요 · 계산 제외</option>
                <option value="user">사용자 확인 · 예상 계산</option>
                <option value="official">
                  공식 문서 근거 등록 · 예상 계산
                </option>
                <option value="demo">가상 예제 · 실제 상품 아님</option>
              </select>
            </Field>
            <Field label="근거 URL">
              <input
                type="url"
                value={rule.sourceUrl}
                onChange={(e) => updateRule({ sourceUrl: e.target.value })}
                placeholder="https://카드사/상품설명서"
              />
            </Field>
            <Field label="확인 날짜">
              <input
                type="date"
                value={rule.checkedDate ?? ""}
                onChange={(e) =>
                  updateRule({ checkedDate: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="전월실적 기준 (원)">
              <input
                type="number"
                min="0"
                value={rule.performanceMinimum}
                onChange={(e) =>
                  updateRule({ performanceMinimum: num(e.target.value) })
                }
              />
            </Field>
            <Field
              label="통합 월 한도 (원)"
              hint="빈칸은 한도 없음 · 포인트는 설정된 원화 가치로 차감"
            >
              <input
                type="number"
                min="0"
                value={rule.monthlyCap ?? ""}
                onChange={(e) =>
                  updateRule({ monthlyCap: cap(e.target.value) })
                }
              />
            </Field>
            <Field label="혜택·실적 날짜 기준">
              <select
                value={rule.dateBasis}
                onChange={(e) =>
                  updateRule({
                    dateBasis: e.target.value as RuleVersion["dateBasis"],
                  })
                }
              >
                <option value="approval">승인일</option>
                <option value="posting">매입일</option>
              </select>
            </Field>
            <Field label="월 산정 시작일 (1~28)">
              <input
                type="number"
                min="1"
                max="28"
                value={rule.periodStartDay}
                onChange={(e) =>
                  updateRule({ periodStartDay: num(e.target.value) })
                }
              />
            </Field>
            <Field label="원화 정수 처리">
              <select
                value={rule.rounding}
                onChange={(e) =>
                  updateRule({
                    rounding: e.target.value as RuleVersion["rounding"],
                  })
                }
              >
                <option value="floor">절사</option>
                <option value="round">반올림</option>
                <option value="ceil">올림</option>
              </select>
            </Field>
            <Field label="취소 반영 시점">
              <select
                value={rule.refundTiming}
                onChange={(e) =>
                  updateRule({
                    refundTiming: e.target.value as RuleVersion["refundTiming"],
                  })
                }
              >
                <option value="refund-month">취소월 혜택·실적 차감</option>
                <option value="original-month">원거래월 재계산</option>
              </select>
            </Field>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-semibold">
              전월실적 제외 업종
            </legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label className="chip-check" key={c}>
                  <input
                    type="checkbox"
                    checked={rule.performanceExcludeCategories.includes(c)}
                    onChange={(e) =>
                      updateRule({
                        performanceExcludeCategories: e.target.checked
                          ? [...rule.performanceExcludeCategories, c]
                          : rule.performanceExcludeCategories.filter(
                              (x) => x !== c,
                            ),
                      })
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="my-4 flex flex-wrap gap-4">
            <label className="check">
              <input
                type="checkbox"
                checked={rule.performanceExcludeInterestFree}
                onChange={(e) =>
                  updateRule({
                    performanceExcludeInterestFree: e.target.checked,
                  })
                }
              />
              무이자할부 실적 제외
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.performanceExcludeDiscounted}
                onChange={(e) =>
                  updateRule({ performanceExcludeDiscounted: e.target.checked })
                }
              />
              혜택 받은 거래 실적 제외
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.refundRestoresCap}
                onChange={(e) =>
                  updateRule({ refundRestoresCap: e.target.checked })
                }
              />
              취소 시 통합한도 복원
            </label>
          </div>
          <details className="advanced">
            <summary>실적 구간과 신규 발급 유예 조건</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="유예 개월">
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={rule.graceMonths}
                  onChange={(e) =>
                    updateRule({ graceMonths: num(e.target.value) })
                  }
                />
              </Field>
              <Field label="유예기간 간주 실적 (원)">
                <input
                  type="number"
                  min="0"
                  value={rule.gracePerformance}
                  onChange={(e) =>
                    updateRule({ gracePerformance: num(e.target.value) })
                  }
                />
              </Field>
            </div>
            {rule.tiers.map((tier, i) => (
              <div className="my-2 flex items-end gap-2" key={i}>
                <Field label="최소 실적">
                  <input
                    type="number"
                    min="0"
                    value={tier.minimum}
                    onChange={(e) =>
                      updateRule({
                        tiers: rule.tiers.map((t, n) =>
                          n === i ? { ...t, minimum: num(e.target.value) } : t,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="해당 통합 한도">
                  <input
                    type="number"
                    min="0"
                    value={tier.monthlyCap ?? ""}
                    onChange={(e) =>
                      updateRule({
                        tiers: rule.tiers.map((t, n) =>
                          n === i
                            ? { ...t, monthlyCap: cap(e.target.value) }
                            : t,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  aria-label="실적 구간 삭제"
                  onClick={() =>
                    updateRule({ tiers: rule.tiers.filter((_, n) => n !== i) })
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                updateRule({
                  tiers: [...rule.tiers, { minimum: 0, monthlyCap: null }],
                })
              }
            >
              실적 구간 추가
            </Button>
          </details>
          <div className="my-5 flex items-center justify-between">
            <h3 className="font-bold">
              혜택 조건 <Badge>{rule.benefits.length}개</Badge>
            </h3>
            <Button
              variant="outline"
              onClick={() =>
                updateRule({
                  benefits: [
                    ...rule.benefits,
                    {
                      id: crypto.randomUUID(),
                      name: "새 혜택",
                      condition: emptyCondition(),
                      type: "bill",
                      rateBps: 100,
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
                  ],
                })
              }
            >
              <Plus size={16} />
              혜택 추가
            </Button>
          </div>
          {!rule.benefits.length && (
            <p className="notice mb-4">
              혜택 조건이 없습니다. 이 버전의 혜택은 0원으로 계산됩니다.
            </p>
          )}
          {rule.benefits.map((b, i) => (
            <div className="benefit-editor" key={b.id}>
              <div className="mb-3 flex items-center justify-between">
                <strong>혜택 {i + 1}</strong>
                <Button
                  variant="ghost"
                  aria-label={`혜택 ${i + 1} 삭제`}
                  onClick={() =>
                    updateRule({
                      benefits: rule.benefits.filter((_, n) => n !== i),
                    })
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="혜택 이름">
                  <input
                    value={b.name}
                    onChange={(e) => updateBenefit(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="혜택 종류">
                  <select
                    value={b.type}
                    onChange={(e) =>
                      updateBenefit(i, {
                        type: e.target.value as Benefit["type"],
                      })
                    }
                  >
                    <option value="bill">청구할인</option>
                    <option value="instant">현장할인</option>
                    <option value="cashback">캐시백</option>
                    <option value="points">포인트 적립</option>
                  </select>
                </Field>
                <Field label="할인 / 적립률 (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={b.rateBps / 100}
                    onChange={(e) =>
                      updateBenefit(i, {
                        rateBps: Math.round(num(e.target.value) * 100),
                      })
                    }
                  />
                </Field>
                <Field
                  label={
                    b.type === "points" ? "고정 적립 (P)" : "고정 할인 (원)"
                  }
                >
                  <input
                    type="number"
                    min="0"
                    value={b.fixed}
                    onChange={(e) =>
                      updateBenefit(i, { fixed: num(e.target.value) })
                    }
                  />
                </Field>
                <Field label="최소 결제금액 (원)">
                  <input
                    type="number"
                    min="0"
                    value={b.condition.minimum}
                    onChange={(e) =>
                      updateBenefit(i, {
                        condition: {
                          ...b.condition,
                          minimum: num(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="필요 실적 구간 (원)">
                  <input
                    type="number"
                    min="0"
                    value={b.minimumPerformance}
                    onChange={(e) =>
                      updateBenefit(i, {
                        minimumPerformance: num(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <fieldset className="my-4">
                <legend className="mb-2 text-sm font-semibold">
                  적용 업종 (미선택 시 전체)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <label key={c} className="chip-check">
                      <input
                        type="checkbox"
                        checked={b.condition.categories.includes(c)}
                        onChange={(e) =>
                          updateBenefit(i, {
                            condition: {
                              ...b.condition,
                              categories: e.target.checked
                                ? [...b.condition.categories, c]
                                : b.condition.categories.filter((x) => x !== c),
                            },
                          })
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="advanced">
                <summary>한도·가맹점·결제 조건</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["perTransactionCap", "건별 한도"],
                      ["dailyCap", "일별 한도"],
                      ["monthlyCap", "이 혜택 월 한도"],
                      ["merchantMonthlyCap", "가맹점별 월 한도"],
                      ["categoryMonthlyCap", "업종별 월 한도"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field label={`${label} (원)`} key={key}>
                      <input
                        type="number"
                        min="0"
                        value={b[key] ?? ""}
                        onChange={(e) =>
                          updateBenefit(i, { [key]: cap(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                  <Field label="우선순위 (높을수록 먼저)">
                    <input
                      type="number"
                      value={b.priority}
                      onChange={(e) =>
                        updateBenefit(i, { priority: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="가맹점 키워드 (쉼표로 구분)">
                    <input
                      value={b.condition.merchants.join(",")}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            merchants: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="결제수단 (빈칸: 전체)">
                    <input
                      placeholder="일반,삼성페이,네이버페이"
                      value={b.condition.paymentMethods.join(",")}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            paymentMethods: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="온라인·오프라인">
                    <select
                      value={b.condition.channel}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            channel: e.target
                              .value as Benefit["condition"]["channel"],
                          },
                        })
                      }
                    >
                      <option value="any">모두</option>
                      <option value="online">온라인</option>
                      <option value="offline">오프라인</option>
                    </select>
                  </Field>
                  <Field label="국내·해외">
                    <select
                      value={b.condition.region}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            region: e.target
                              .value as Benefit["condition"]["region"],
                          },
                        })
                      }
                    >
                      <option value="any">모두</option>
                      <option value="domestic">국내</option>
                      <option value="foreign">해외</option>
                    </select>
                  </Field>
                </div>
                <fieldset className="my-4">
                  <legend className="mb-2 text-sm font-semibold">
                    혜택 제외 업종
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <label key={c} className="chip-check">
                        <input
                          type="checkbox"
                          checked={b.condition.excludeCategories.includes(c)}
                          onChange={(e) =>
                            updateBenefit(i, {
                              condition: {
                                ...b.condition,
                                excludeCategories: e.target.checked
                                  ? [...b.condition.excludeCategories, c]
                                  : b.condition.excludeCategories.filter(
                                      (x) => x !== c,
                                    ),
                              },
                            })
                          }
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-wrap gap-4">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={b.condition.autoPayOnly}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            autoPayOnly: e.target.checked,
                          },
                        })
                      }
                    />
                    자동납부 전용
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={b.condition.excludeInterestFree}
                      onChange={(e) =>
                        updateBenefit(i, {
                          condition: {
                            ...b.condition,
                            excludeInterestFree: e.target.checked,
                          },
                        })
                      }
                    />
                    무이자할부 제외
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={b.stackable}
                      onChange={(e) =>
                        updateBenefit(i, { stackable: e.target.checked })
                      }
                    />
                    선행 혜택과 중복 가능
                  </label>
                </div>
              </details>
            </div>
          ))}
          <details className="advanced">
            <summary>이 규칙 버전 삭제</summary>
            <p className="my-3 text-sm">
              과거 거래 계산이 미확정으로 바뀔 수 있습니다.
            </p>
            <Button
              variant="danger"
              onClick={() => {
                update({ rules: draft.rules.filter((_, i) => i !== version) });
                setVersion(0);
              }}
            >
              버전 삭제
            </Button>
          </details>
          <p className="mt-4 text-sm text-slate-500">
            현재 버전: {labelStatus(rule.status)}. 실제 약관과 다르면 결과도
            달라집니다. 중복 가능한 혜택은 각 혜택의 우선순위대로 적용됩니다.
          </p>
        </>
      ) : (
        <p className="notice">규칙 버전이 없습니다. 새 버전을 추가하세요.</p>
      )}
      {error && (
        <p role="alert" className="error mt-4">
          {error}
        </p>
      )}
      <div className="sticky -bottom-6 mt-6 flex justify-end gap-2 border-t bg-white py-4 dark:bg-slate-900">
        <Button variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button disabled={saving} onClick={save}>
          {saving ? "저장 중…" : "카드 저장"}
        </Button>
      </div>
    </Modal>
  );
}
