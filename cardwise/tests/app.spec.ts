import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import fs from "node:fs/promises";
const csv =
  "거래ID,승인일,가맹점,승인금액,분류\npast,2026-09-03,샘플 마트,350000,마트\none,2026-10-04,샘플 카페,10000,카페\ntwo,2026-10-05,샘플 온라인몰,100000,온라인쇼핑\n";
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: /주 메뉴/ })
    .getByRole("button", { name, exact: true })
    .click();
}
async function sample(page: Page) {
  await page.getByRole("button", { name: "6개월 샘플 둘러보기" }).click();
  await expect(page.getByRole("status")).toContainText("6개월 샘플");
}
async function createCard(page: Page) {
  await nav(page, "카드 관리");
  await page.getByRole("button", { name: "카드 직접 등록" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("카드 이름", { exact: true })
    .fill("검증용 사용자 카드");
  await dialog.getByLabel("검증 상태", { exact: false }).selectOption("user");
  await dialog.getByLabel("전월실적 기준 (원)", { exact: true }).fill("300000");
  await dialog.getByRole("button", { name: "혜택 추가" }).click();
  await dialog.getByLabel("할인 / 적립률 (%)").fill("5");
  await dialog.getByRole("button", { name: "카드 저장" }).click();
  await expect(dialog).not.toBeVisible();
}
async function importFile(
  page: Page,
  buffer = Buffer.from(csv),
  name = "sample.csv",
) {
  await page
    .getByRole("button", { name: "내역 가져오기", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByLabel("결제 파일")
    .setInputFiles({
      name,
      mimeType: name.endsWith("xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
      buffer,
    });
  await d
    .getByLabel("기본 카드 (카드 열이 없을 때)")
    .selectOption({ label: "검증용 사용자 카드" });
  await d.getByRole("button", { name: "검증 후 가져오기" }).click();
  await expect(d).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "내 소비, 더 현명하게." }),
  ).toBeVisible();
});
test("샘플 대시보드·근거·새로고침·다크모드·모바일 레이아웃", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      outbound.push(r.url());
  });
  await sample(page);
  await expect(page.locator(".metric").nth(1)).toContainText("13,260원");
  await page.reload();
  await page.getByRole("button", { name: "샘플 모드", exact: true }).click();
  await page.getByLabel("분석 월").fill("2026-10");
  await expect(page.locator(".metric").nth(1)).toContainText("13,260원");
  await nav(page, "결제내역");
  await expect(
    page.getByRole("heading", { name: "결제내역 9건" }),
  ).toBeVisible();
  await page.locator(".amount-link").first().click();
  await expect(page.getByRole("dialog")).toContainText("거래별 계산 근거");
  await expect(page.getByRole("dialog")).toContainText("가상 기본 혜택");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "다크 모드", exact: true }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await nav(page, "대시보드");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("dashboard.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(outbound).toEqual([]);
});
test("카드 생성·CSV 매핑 저장·중복 방지·자료 확인·혜택 계산", async ({
  page,
}) => {
  await createCard(page);
  await page.getByLabel("분석 월").fill("2026-10");
  await page
    .getByRole("button", { name: "내역 가져오기", exact: true })
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("결제 파일")
    .setInputFiles({
      name: "sample.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await d
    .getByLabel("기본 카드 (카드 열이 없을 때)")
    .selectOption({ label: "검증용 사용자 카드" });
  await d.getByLabel("매핑 이름").fill("테스트 매핑");
  await d.getByRole("button", { name: "매핑 저장", exact: true }).click();
  await expect(d.getByRole("status")).toContainText("매핑이 저장");
  await d.getByRole("button", { name: "검증 후 가져오기" }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("3건 저장");
  await importFile(page);
  await expect(page.getByRole("status")).toContainText(
    "0건 저장 · 동일 거래 3건 제외",
  );
  await nav(page, "설정");
  await page.getByLabel("분석 월").fill("2026-09");
  await page.getByLabel("2026-09 내 실제 자료를 모두 확인함").check();
  await page.getByLabel("분석 월").fill("2026-10");
  await nav(page, "대시보드");
  await expect(page.locator(".metric").nth(1)).toContainText("5,500원");
  await page.reload();
  await expect(page.locator(".metric").nth(1)).toContainText("5,500원");
  await nav(page, "카드 비교");
  await expect(
    page.getByRole("row").filter({ hasText: "검증용 사용자 카드" }),
  ).toContainText("실적 충족");
});
test("XLSX 첫 시트와 동일 금액의 별도 거래 유지", async ({ page }) => {
  await createCard(page);
  await page.getByLabel("분석 월").fill("2026-10");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("내역");
  sheet.addRow(["승인일", "가맹점", "승인금액"]);
  sheet.addRow(["2026-10-02", "동일 가게", 10000]);
  sheet.addRow(["2026-10-02", "동일 가게", 10000]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  await importFile(page, buffer, "test.xlsx");
  await expect(page.getByRole("status")).toContainText("2건 저장");
  await expect(
    page.getByRole("heading", { name: "결제내역 2건" }),
  ).toBeVisible();
  await importFile(page, buffer, "test.xlsx");
  await expect(page.getByRole("status")).toContainText("동일 거래 2건 제외");
});
test("유효하지 않은 업로드는 보류, JSON 백업·복원은 저장 데이터를 검증", async ({
  page,
}) => {
  await sample(page);
  await nav(page, "설정");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 JSON 백업" }).click();
  const download = await downloadPromise;
  const json = await fs.readFile((await download.path())!);
  expect(JSON.parse(json.toString()).transactions).toHaveLength(54);
  await page
    .getByLabel("백업 복원 파일")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":9}'),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("백업 복원 파일")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: json,
    });
  await expect(page.getByRole("status")).toContainText("백업을 복원");
  await page.reload();
  await page.getByRole("button", { name: "샘플 모드", exact: true }).click();
  await nav(page, "결제내역");
  await expect(
    page.getByRole("heading", { name: "결제내역 9건" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "내역 가져오기", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByLabel("결제 파일")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("승인일,가맹점,승인금액\n2026-02-30,가게,10000"),
    });
  await expect(d.getByRole("alert")).toBeVisible();
  await expect(
    d.getByRole("button", { name: "검증 후 가져오기" }),
  ).toBeDisabled();
});
