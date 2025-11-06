# 시스템 모니터링 애플리케이션 보안 코드 리뷰

**리뷰 날짜:** 2025-11-06
**프로젝트:** System Resource Monitoring Web Application
**리뷰어:** Security Analysis

---

## 📋 목차

1. [개요](#개요)
2. [치명적 보안 문제 (Critical)](#치명적-보안-문제-critical)
3. [높은 위험도 보안 문제 (High)](#높은-위험도-보안-문제-high)
4. [중간 위험도 보안 문제 (Medium)](#중간-위험도-보안-문제-medium)
5. [낮은 위험도 보안 문제 (Low)](#낮은-위험도-보안-문제-low)
6. [권장사항 요약](#권장사항-요약)
7. [보안 체크리스트](#보안-체크리스트)

---

## 개요

본 애플리케이션은 Node.js 기반의 실시간 시스템 리소스 모니터링 도구로, Express 웹 서버와 Socket.IO를 사용하여 시스템 정보를 실시간으로 제공합니다.

### 분석 파일 목록
- `server.js` - 백엔드 서버 (323 lines)
- `public/app.js` - 프론트엔드 로직 (721 lines)
- `public/pdf-generator.js` - PDF 생성 기능 (407 lines)
- `public/index.html` - UI 구조 (353 lines)
- `package.json` - 의존성 관리

---

## 치명적 보안 문제 (Critical)

### 🔴 1. 인증 및 권한 검증 부재

**위치:** `server.js` (전체)

**문제점:**
- 애플리케이션 전체에 인증 메커니즘이 없음
- 모든 API 엔드포인트와 WebSocket 연결이 무인증 상태로 노출
- 누구나 시스템의 민감한 정보에 접근 가능

**영향:**
- 공격자가 시스템 정보를 자유롭게 조회 가능
- 내부 네트워크 구조, 실행 중인 프로세스, 하드웨어 정보 노출
- 정찰(Reconnaissance) 단계에서 공격자에게 유용한 정보 제공

**해당 코드:**
```javascript
// server.js:224-232
app.get('/api/system-info', async (req, res) => {
  // 인증 검증 없음
  try {
    const systemInfo = await getSystemInfo();
    res.json(systemInfo);
  } catch (error) {
    ...
  }
});

// server.js:242-290
io.on('connection', (socket) => {
  // 인증 검증 없음
  console.log('클라이언트 연결됨:', socket.id);
  ...
});
```

**권장사항:**
- JWT 또는 세션 기반 인증 구현
- API 키 인증 메커니즘 추가
- 역할 기반 접근 제어 (RBAC) 구현
- WebSocket 연결 시 인증 토큰 검증

**심각도:** 🔴 CRITICAL (CVSS 9.1)

---

### 🔴 2. 무제한 CORS 정책

**위치:** `server.js:17-20, 24`

**문제점:**
```javascript
const io = socketIo(server, {
  cors: {
    origin: "*",  // ← 모든 도메인 허용
    methods: ["GET", "POST"]
  }
});

app.use(cors());  // ← 기본 설정 (모든 출처 허용)
```

**영향:**
- 임의의 웹사이트에서 이 API를 호출 가능
- CSRF (Cross-Site Request Forgery) 공격 가능
- 악의적인 웹사이트가 사용자 브라우저를 통해 시스템 정보 수집 가능

**공격 시나리오:**
1. 공격자가 악의적인 웹페이지를 생성
2. 피해자가 해당 페이지를 방문
3. 페이지의 JavaScript가 모니터링 서버에 연결
4. 피해자의 시스템 정보를 공격자 서버로 전송

**권장사항:**
```javascript
// 특정 도메인만 허용
cors: {
  origin: ["https://yourdomain.com"],
  credentials: true,
  methods: ["GET", "POST"]
}
```

**심각도:** 🔴 CRITICAL (CVSS 8.6)

---

### 🔴 3. 민감한 시스템 정보 무제한 노출

**위치:** `server.js:38-219`

**문제점:**
다음 민감 정보가 필터링 없이 노출됨:
- 네트워크 인터페이스 정보 (IP 주소, MAC 주소) - `server.js:127-153`
- 실행 중인 모든 프로세스 정보 (PID, 프로세스명) - `server.js:167-199`
- 하드웨어 상세 정보 (CPU 모델, GPU 모델) - `server.js:66-79, 155-165`
- 디스크 파일시스템 구조 - `server.js:94-117`

**해당 코드:**
```javascript
// server.js:140-151
return {
  iface: iface.iface,
  ip4: iface.ip4,        // ← 내부 IP 노출
  ip6: iface.ip6,        // ← IPv6 주소 노출
  mac: iface.mac,        // ← MAC 주소 노출
  operstate: iface.operstate,
  ...
};

// server.js:171-177
.map(proc => ({
  pid: proc.pid,         // ← 프로세스 ID 노출
  name: proc.name,       // ← 프로세스명 노출 (보안 소프트웨어 등)
  cpu: proc.cpu,
  mem: proc.mem,
  ...
}));
```

**영향:**
- 네트워크 토폴로지 파악 가능
- 실행 중인 보안 소프트웨어 확인 가능
- 시스템 지문(fingerprinting) 수집
- 타겟팅된 공격 준비에 활용 가능

**권장사항:**
- 필요한 정보만 선택적으로 노출
- MAC 주소, 내부 IP는 마스킹 처리
- 민감한 프로세스명 필터링 (예: 보안 소프트웨어)
- 접근 레벨에 따른 정보 제한

**심각도:** 🔴 CRITICAL (CVSS 8.2)

---

## 높은 위험도 보안 문제 (High)

### 🟠 4. Rate Limiting 및 DoS 방어 부재

**위치:** `server.js` (전체)

**문제점:**
- API 요청 속도 제한 없음
- Socket.IO 연결 수 제한 없음
- 단일 클라이언트가 무제한 요청 가능

**영향:**
- DoS (Denial of Service) 공격에 취약
- 서버 리소스 고갈 가능
- 다른 정상 사용자의 서비스 이용 방해

**공격 시나리오:**
```javascript
// 공격 예시
for (let i = 0; i < 10000; i++) {
  fetch('http://target/api/system-info');
  const socket = io('http://target');
  socket.emit('start-monitoring');
}
```

**권장사항:**
```javascript
// express-rate-limit 사용
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100회 요청
  message: 'Too many requests'
});

app.use('/api/', limiter);
```

**심각도:** 🟠 HIGH (CVSS 7.5)

---

### 🟠 5. 에러 정보 노출 (Information Disclosure)

**위치:** `server.js:213-217, 229-230`

**문제점:**
```javascript
// server.js:213-217
} catch (error) {
  console.error('시스템 정보 수집 오류:', error);
  return {
    error: error.message,  // ← 에러 메시지 그대로 노출
    timestamp: Date.now()
  };
}

// server.js:229-230
} catch (error) {
  console.error('API 오류:', error);
  res.status(500).json({ error: error.message });  // ← 스택 트레이스 가능성
}
```

**영향:**
- 시스템 내부 구조 정보 유출
- 파일 경로, 모듈명 노출 가능
- 공격자에게 취약점 분석 정보 제공

**예시 노출 정보:**
```
"error": "Cannot read property 'temperature' of undefined at /app/server.js:78"
```

**권장사항:**
```javascript
// 일반적인 에러 메시지 반환
catch (error) {
  console.error('Error:', error); // 로그에만 상세 기록
  res.status(500).json({
    error: 'Internal server error',
    code: 'SYS_ERR_001'
  });
}
```

**심각도:** 🟠 HIGH (CVSS 6.5)

---

### 🟠 6. 외부 CDN 의존성 및 SRI 부재

**위치:** `public/index.html:12-24`

**문제점:**
```html
<!-- SRI 해시가 없는 외부 스크립트 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
```

**영향:**
- CDN이 손상되면 악성 코드 실행 가능
- Supply Chain Attack 위험
- MITM (Man-in-the-Middle) 공격에 취약
- 외부 서비스 장애 시 애플리케이션 작동 불가

**권장사항:**
```html
<!-- SRI(Subresource Integrity) 추가 -->
<script
  src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>

<!-- 또는 로컬에 라이브러리 포함 -->
<script src="/vendor/chart.js"></script>
```

**심각도:** 🟠 HIGH (CVSS 7.3)

---

### 🟠 7. XSS (Cross-Site Scripting) 취약점

**위치:** `public/app.js:507-510, 599-605, 613-619`

**문제점:**
```javascript
// app.js:507-510
diskInfo.innerHTML = `
  <strong>${mainDisk.fs}</strong><br>
  ${usedGB} GB / ${sizeGB} GB (${mainDisk.usagePercent.toFixed(1)}%)
`;  // ← 데이터 직접 삽입

// app.js:599-605
row.innerHTML = `
  <td>${proc.pid}</td>
  <td>${proc.name}</td>  // ← 프로세스명 직접 삽입
  <td>${proc.cpu.toFixed(1)}%</td>
  <td>${proc.mem.toFixed(1)}%</td>
`;
```

**영향:**
- 프로세스명에 악성 스크립트가 포함된 경우 실행 가능
- 저장된 XSS (Stored XSS) 공격 가능
- 세션 하이재킹, 쿠키 탈취 위험

**공격 시나리오:**
```javascript
// 악의적인 프로세스명
proc.name = "<img src=x onerror='alert(document.cookie)'>"
```

**권장사항:**
```javascript
// DOMPurify 또는 텍스트 노드 사용
const sanitize = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

row.innerHTML = `
  <td>${sanitize(proc.pid)}</td>
  <td>${sanitize(proc.name)}</td>
  ...
`;
```

**심각도:** 🟠 HIGH (CVSS 7.1)

---

## 중간 위험도 보안 문제 (Medium)

### 🟡 8. 클라이언트 측 민감 데이터 저장

**위치:** `public/app.js:690-701`

**문제점:**
```javascript
function saveDataToLocalStorage() {
  try {
    localStorage.setItem('monitoringData', JSON.stringify({
      data: dataHistory,      // ← 시스템 정보 저장
      timestamp: Date.now(),
      duration: elapsedSeconds
    }));
    console.log('데이터 저장 완료');
  } catch (error) {
    console.error('로컬 스토리지 저장 오류:', error);
  }
}
```

**영향:**
- 브라우저 localStorage에 시스템 정보 평문 저장
- 동일 기기의 다른 사용자가 접근 가능
- XSS 공격 시 데이터 탈취 용이
- 브라우저 확장 프로그램의 데이터 수집 가능

**권장사항:**
- 민감 데이터는 서버 측에서만 저장
- 필요 시 암호화하여 저장
- sessionStorage 사용 (탭 종료 시 자동 삭제)
- 저장 기간 제한 설정

**심각도:** 🟡 MEDIUM (CVSS 5.3)

---

### 🟡 9. HTTPS 미사용 (HTTP 통신)

**위치:** `server.js:295-303`

**문제점:**
```javascript
server.listen(PORT, () => {
  console.log(`
  ║   URL: http://localhost:${PORT}     // ← HTTP 사용
  `);
});
```

**영향:**
- 모든 데이터가 평문으로 전송
- 중간자 공격 (MITM) 가능
- 네트워크 스니핑으로 시스템 정보 탈취 가능
- 세션 하이재킹 위험

**권장사항:**
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('server-key.pem'),
  cert: fs.readFileSync('server-cert.pem')
};

const server = https.createServer(options, app);
```

**심각도:** 🟡 MEDIUM (CVSS 5.9)

---

### 🟡 10. 입력 검증 부재

**위치:** `server.js:248-266`

**문제점:**
```javascript
socket.on('start-monitoring', () => {
  // 입력 검증 없음
  console.log('모니터링 시작:', socket.id);

  monitoringInterval = setInterval(async () => {
    // 0.5초마다 무조건 실행
  }, 500);
});
```

**영향:**
- 악의적인 이벤트 데이터 전송 가능
- 서버 로직 오작동 유발 가능
- 리소스 낭비

**권장사항:**
```javascript
socket.on('start-monitoring', (options) => {
  // 입력 검증
  if (typeof options !== 'object') return;
  if (monitoringInterval) return; // 중복 실행 방지

  // 최소/최대 간격 검증
  const interval = Math.max(500, Math.min(5000, options?.interval || 500));
  ...
});
```

**심각도:** 🟡 MEDIUM (CVSS 4.3)

---

### 🟡 11. 로깅 및 모니터링 부족

**위치:** `server.js` (전체)

**문제점:**
- 보안 이벤트 로깅 없음
- 접근 로그 기록 없음
- 비정상적인 활동 감지 메커니즘 없음

**영향:**
- 침해 사고 발생 시 추적 불가
- 공격 패턴 분석 불가
- 포렌식 조사 어려움

**권장사항:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'security.log' })
  ]
});

// 모든 접근 로깅
app.use((req, res, next) => {
  logger.info({
    ip: req.ip,
    method: req.method,
    path: req.path,
    timestamp: new Date()
  });
  next();
});
```

**심각도:** 🟡 MEDIUM (CVSS 4.0)

---

### 🟡 12. 환경 변수 관리 부족

**위치:** `server.js:29`

**문제점:**
```javascript
const PORT = process.env.PORT || 3000;
// 다른 설정값들이 하드코딩됨
```

**영향:**
- 설정 변경 시 코드 수정 필요
- 민감한 설정이 코드에 노출 가능
- 환경별 설정 관리 어려움

**권장사항:**
```javascript
require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost',
  maxConnections: parseInt(process.env.MAX_CONNECTIONS) || 100,
  updateInterval: parseInt(process.env.UPDATE_INTERVAL) || 500
};
```

**심각도:** 🟡 MEDIUM (CVSS 3.9)

---

## 낮은 위험도 보안 문제 (Low)

### 🟢 13. 리소스 정리 누락 가능성

**위치:** `server.js:251-265`

**문제점:**
```javascript
let monitoringInterval = null;

socket.on('start-monitoring', () => {
  // 기존 인터벌 정리
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  monitoringInterval = setInterval(async () => {
    // 리소스 누적 가능성
  }, 500);
});
```

**영향:**
- 메모리 누수 가능성
- 장시간 운영 시 성능 저하

**권장사항:**
- 명시적인 리소스 정리 로직
- 연결 타임아웃 설정
- 메모리 모니터링

**심각도:** 🟢 LOW (CVSS 2.7)

---

### 🟢 14. 콘솔 로그 정보 노출

**위치:** 여러 파일

**문제점:**
```javascript
console.log('클라이언트 연결됨:', socket.id);
console.log('모니터링 시작:', socket.id);
```

**영향:**
- 프로덕션 환경에서 불필요한 정보 출력
- 로그 파일 크기 증가
- 민감 정보 로그 노출 가능성

**권장사항:**
```javascript
if (process.env.NODE_ENV !== 'production') {
  console.log(...);
}
```

**심각도:** 🟢 LOW (CVSS 2.1)

---

### 🟢 15. 의존성 보안 업데이트

**위치:** `package.json:18-23`

**문제점:**
```json
"dependencies": {
  "express": "^4.18.2",
  "systeminformation": "^5.21.0",
  "socket.io": "^4.6.1",
  "cors": "^2.8.5"
}
```

**권장사항:**
- 정기적인 의존성 보안 업데이트
- `npm audit` 정기 실행
- Dependabot 또는 Snyk 사용
- 취약점 알림 설정

**확인 명령:**
```bash
npm audit
npm audit fix
```

**심각도:** 🟢 LOW (CVSS 3.1)

---

## 권장사항 요약

### 즉시 조치 필요 (Critical & High)

1. **인증 시스템 구현**
   - JWT 기반 인증 추가
   - API 키 발급 및 검증
   - Socket.IO 연결 인증

2. **CORS 정책 강화**
   ```javascript
   cors: {
     origin: process.env.ALLOWED_ORIGINS.split(','),
     credentials: true
   }
   ```

3. **민감 정보 필터링**
   - MAC 주소, 내부 IP 마스킹
   - 프로세스 정보 제한
   - 하드웨어 정보 최소화

4. **Rate Limiting 구현**
   ```bash
   npm install express-rate-limit
   ```

5. **에러 핸들링 개선**
   - 일반적인 에러 메시지 반환
   - 상세 로그는 서버에만 기록

6. **SRI 해시 추가**
   - 모든 외부 스크립트에 integrity 속성 추가
   - 가능하면 로컬 호스팅

7. **XSS 방지**
   - DOMPurify 라이브러리 사용
   - Content Security Policy (CSP) 헤더 추가

### 단기 개선 사항 (Medium)

8. **HTTPS 전환**
   - SSL/TLS 인증서 적용
   - HTTP 요청을 HTTPS로 리다이렉트

9. **입력 검증**
   - Socket 이벤트 데이터 검증
   - 파라미터 타입 체크

10. **보안 로깅**
    - Winston 또는 Bunyan 사용
    - 보안 이벤트 기록

11. **환경 변수 관리**
    - `.env` 파일 사용
    - 민감 정보 분리

### 장기 개선 사항 (Low)

12. **모니터링 시스템**
    - 애플리케이션 성능 모니터링 (APM)
    - 침입 탐지 시스템 (IDS)

13. **보안 헤더 추가**
    ```javascript
    app.use(helmet());
    ```

14. **정기 보안 점검**
    - 분기별 코드 리뷰
    - 연간 침투 테스트

---

## 보안 체크리스트

### 인증 & 권한

- [ ] 모든 API 엔드포인트에 인증 필요
- [ ] WebSocket 연결 인증 검증
- [ ] 역할 기반 접근 제어 (RBAC)
- [ ] 세션 타임아웃 설정
- [ ] 비밀번호 정책 수립 (해당 시)

### 네트워크 보안

- [ ] HTTPS 적용
- [ ] CORS 정책 제한
- [ ] CSP 헤더 설정
- [ ] Rate Limiting 구현
- [ ] 방화벽 규칙 설정

### 데이터 보호

- [ ] 민감 정보 암호화
- [ ] 전송 중 데이터 보호 (TLS)
- [ ] 저장 데이터 암호화
- [ ] 개인정보 최소 수집
- [ ] 데이터 보관 기간 설정

### 입력 검증

- [ ] 모든 입력 데이터 검증
- [ ] XSS 방지 처리
- [ ] SQL Injection 방지 (해당 시)
- [ ] 파일 업로드 검증 (해당 시)
- [ ] 출력 인코딩

### 에러 처리

- [ ] 에러 정보 필터링
- [ ] 일반적인 에러 메시지
- [ ] 상세 로그는 서버만
- [ ] 스택 트레이스 숨김

### 로깅 & 모니터링

- [ ] 보안 이벤트 로깅
- [ ] 접근 로그 기록
- [ ] 이상 징후 탐지
- [ ] 로그 보관 정책
- [ ] 로그 무결성 보호

### 의존성 관리

- [ ] 정기적인 보안 업데이트
- [ ] npm audit 정기 실행
- [ ] 취약점 스캐닝
- [ ] SRI 해시 적용
- [ ] 라이선스 검토

### 배포 & 운영

- [ ] 환경 변수 분리
- [ ] 프로덕션 설정 적용
- [ ] 디버그 모드 비활성화
- [ ] 백업 및 복구 계획
- [ ] 인시던트 대응 절차

---

## OWASP Top 10 (2021) 매핑

| OWASP 순위 | 취약점 | 본 애플리케이션 해당 사항 |
|-----------|--------|----------------------|
| A01:2021 | Broken Access Control | ✅ Critical - 인증 부재 (#1) |
| A02:2021 | Cryptographic Failures | ✅ Medium - HTTPS 미사용 (#9) |
| A03:2021 | Injection | ✅ High - XSS (#7) |
| A04:2021 | Insecure Design | ✅ Critical - 전반적인 보안 설계 부족 |
| A05:2021 | Security Misconfiguration | ✅ Critical - CORS (#2), 에러 노출 (#5) |
| A06:2021 | Vulnerable Components | ✅ Low - 의존성 관리 (#15) |
| A07:2021 | Authentication Failures | ✅ Critical - 인증 부재 (#1) |
| A08:2021 | Software and Data Integrity | ✅ High - SRI 부재 (#6) |
| A09:2021 | Security Logging Failures | ✅ Medium - 로깅 부족 (#11) |
| A10:2021 | Server-Side Request Forgery | ⬜ 해당 없음 |

---

## 추가 참고 자료

### 보안 가이드
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

### 유용한 도구
- **SAST:** ESLint Security Plugin, NodeJsScan
- **Dependency Check:** npm audit, Snyk, Dependabot
- **Runtime Protection:** Helmet.js, express-rate-limit
- **Monitoring:** Winston, Morgan, Sentry

### 보안 테스트
```bash
# 의존성 취약점 검사
npm audit

# 보안 린터
npm install -g eslint-plugin-security
eslint --plugin security .

# 동적 분석
npm install -g retire
retire .
```

---

## 결론

본 애플리케이션은 **다수의 중대한 보안 취약점**을 포함하고 있습니다. 특히 **인증 부재, 무제한 CORS, 민감 정보 노출**은 즉시 해결해야 할 치명적인 문제입니다.

**현재 상태로는 프로덕션 환경에 배포하는 것을 권장하지 않으며**, 최소한 Critical 및 High 등급의 취약점을 해결한 후 배포를 고려해야 합니다.

### 위험 점수 요약

| 등급 | 개수 | 비율 |
|------|------|------|
| 🔴 Critical | 3 | 20% |
| 🟠 High | 4 | 27% |
| 🟡 Medium | 5 | 33% |
| 🟢 Low | 3 | 20% |
| **합계** | **15** | **100%** |

**전체 보안 점수: 32/100 (매우 취약)**

---

*본 리뷰는 2025-11-06 기준으로 작성되었으며, 정기적인 재검토가 필요합니다.*
