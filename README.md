# 카카오 날씨 챗봇 스킬 서버

카카오 i 오픈빌더와 연동되는 날씨 스킬 서버입니다.  
날씨 데이터는 **Open-Meteo API** (무료, API 키 불필요)를 사용합니다.

---

## 지원 발화 & 엔드포인트

| 발화 | 스킬 URL | 설명 |
|------|----------|------|
| 위치 설정 | `POST /skill/set-location` | 위치 파라미터 저장 |
| 오늘 날씨 | `POST /skill/today` | 오늘 상세 날씨 |
| 오늘 날씨 요약 | `POST /skill/today-summary` | 오늘 요약 카드 |
| 내일 날씨 | `POST /skill/tomorrow` | 내일 상세 날씨 |
| 내일 날씨 요약 | `POST /skill/tomorrow-summary` | 내일 요약 카드 |
| 이번주 날씨 | `POST /skill/week` | 7일 캐러셀 |
| 이번주 날씨 요약 | `POST /skill/week-summary` | 7일 캐러셀 |
| 도움말 | `POST /skill/help` | 사용법 안내 |

단일 통합 엔드포인트: `POST /skill` (utterance로 자동 분기)

---

## 설치 & 실행

```bash
npm install
npm start          # 프로덕션
npm run dev        # 개발 (파일 변경 감지)
```

기본 포트: **3000**  
환경변수 `PORT`로 변경 가능

---

## 카카오 i 오픈빌더 연동 방법

### 1. 서버 배포
로컬 개발: [ngrok](https://ngrok.com/) 사용  
```bash
ngrok http 3000
# → https://xxxx.ngrok.io 형태의 주소 획득
```
운영 서버: AWS / GCP / Render / Railway 등 배포

### 2. 스킬 등록
오픈빌더 → **스킬** 탭 → **스킬 추가**  
- 스킬 서버 URL: `https://your-server.com/skill/today` (발화별로 각각 등록)
- 메서드: `POST`

### 3. 블록 생성 및 스킬 연결
각 발화별로 **블록**을 생성하고:
- 발화 패턴 등록 (예: "오늘 날씨", "오늘 날씨 알려줘")
- 스킬 탭에서 해당 스킬 연결

### 4. 위치 설정 블록 파라미터 설정
- 파라미터명: `location`
- 엔티티: `@sys.location` (카카오 제공 시스템 엔티티)
- 필수값으로 설정 → 미입력시 재요청 메시지 표시

---

## 응답 형식

| 발화 | 응답 타입 |
|------|-----------|
| 오늘/내일 날씨 | simpleText + quickReplies |
| 오늘/내일 날씨 요약 | basicCard + quickReplies |
| 이번주 날씨 | carousel (7장) + quickReplies |
| 도움말 | simpleText + quickReplies |

---

## 위치 저장 방식

현재는 **메모리(Map)** 에 저장 → 서버 재시작 시 초기화됨  
운영 환경에서는 **Redis** 또는 **DB** 로 교체 권장:

```js
// Redis 예시
import { createClient } from 'redis';
const redis = createClient();
await redis.set(`loc:${userId}`, JSON.stringify(loc), { EX: 86400 });
const loc = JSON.parse(await redis.get(`loc:${userId}`));
```

---

## 날씨 데이터 출처

[Open-Meteo](https://open-meteo.com/) — 비상업적 무료 사용  
- 갱신 주기: 1시간
- 예보 범위: 7일
- 한국 시간대(Asia/Seoul) 자동 적용
