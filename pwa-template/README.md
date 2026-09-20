# Independent PWA template

이 저장소에서 새 웹앱을 만들 때는 항상 각 앱을 독립 경로로 분리한다.

## 필수 규칙

- 앱 URL: `https://ujewon22325.github.io/<app-slug>/`
- Manifest `id`: `/<app-slug>/`
- Manifest `start_url`: `/<app-slug>/`
- Manifest `scope`: `/<app-slug>/`
- Service worker 등록: `./sw.js` + `scope: './'`
- Cache prefix는 앱마다 고유하게 지정
- Service worker activate 단계에서 **자기 cache prefix만** 삭제
- 다른 경로의 요청은 service worker가 처리하지 않음
- 192x192 / 512x512 PNG 아이콘을 기본 제공

## 금지

- 루트 `/` 범위의 PWA 신규 생성
- `scope: '/'`
- 모든 cache를 일괄 삭제하는 코드
- 여러 앱이 같은 manifest `id`를 공유하는 구조

## 현재 앱

- 운동노트: `/workout/`
- 간사이여행: `/japan-trip-2026/`

새 앱은 아래 템플릿 파일의 `__APP_SLUG__`, `__APP_NAME__`, `__CACHE_PREFIX__`를 바꿔 사용한다.
