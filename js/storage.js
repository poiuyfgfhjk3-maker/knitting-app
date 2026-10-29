/**
 * 데이터 저장소 엔진 (Firebase Firestore + LocalStorage 완벽 호환)
 *
 * 컬렉션 구조:
 * 1. users: { name (아이디), pin (숫자 비밀번호), createdAt }
 * 2. patterns: { id, title, category, authorName, isPublic, lines[], thumbnailDataUrl, createdAt }
 * 3. userProgress: { id: `${userName}__${patternId}`, userName, patternId, checkedLines: {}, currentRow, currentStitch, memo, updatedAt }
 * 4. userLinks: { id, userName, url, title, siteName, createdAt }
 */

const STORAGE_KEYS = {
  USERS: "knitting_users_v1",
  PATTERNS: "knitting_patterns_v1",
  PROGRESS: "knitting_progress_v1",
  LINKS: "knitting_links_v1",
  SESSION: "knitting_current_user_v1",
  FIREBASE_CFG: "knitting_firebase_config_v1"
};

const StorageService = {
  db: null,
  isFirebaseConnected: false,

  init() {
    this.ensureSeedData();
    this.tryConnectFirebase();
  },

  getEffectiveFirebaseConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FIREBASE_CFG);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("저장된 Firebase 설정 파싱 오류:", e);
    }

    if (
      window.DEFAULT_FIREBASE_CONFIG &&
      window.DEFAULT_FIREBASE_CONFIG.apiKey &&
      window.DEFAULT_FIREBASE_CONFIG.projectId
    ) {
      return window.DEFAULT_FIREBASE_CONFIG;
    }
    return null;
  },

  tryConnectFirebase() {
    const cfg = this.getEffectiveFirebaseConfig();
    if (!cfg || !window.firebase) {
      this.isFirebaseConnected = false;
      this.db = null;
      return false;
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(cfg);
      }
      this.db = window.firebase.firestore();
      this.isFirebaseConnected = true;
      return true;
    } catch (err) {
      console.error("Firebase 연결 실패 (로컬 모드로 작동합니다):", err);
      this.isFirebaseConnected = false;
      this.db = null;
      return false;
    }
  },

  /**
   * 초기 실행 시 바로 테스트해볼 수 있도록 샘플 계정 및 공용/개인 도안 시드 데이터를 생성합니다.
   */
  ensureSeedData() {
    const existingPatterns = this.getLocal(STORAGE_KEYS.PATTERNS, null);
    if (existingPatterns && existingPatterns.length > 0) {
      return;
    }

    const seedUsers = [
      { name: "김뜨개", pin: "1234", createdAt: "2026-10-28T10:00:00Z" },
      { name: "박코바늘", pin: "0000", createdAt: "2026-10-28T11:00:00Z" }
    ];
    this.setLocal(STORAGE_KEYS.USERS, seedUsers);

    const thumb1 = window.OcrHelper
      ? window.OcrHelper.generateDefaultKnittingThumb("포근 데일리 꽈배기 머플러", "대바늘 5.0mm · 메리노울", 0).dataUrl
      : "";
    const thumb2 = window.OcrHelper
      ? window.OcrHelper.generateDefaultKnittingThumb("복주머니 호빵 수세미", "코바늘 5호 · 수세미실", 1).dataUrl
      : "";
    const thumb3 = window.OcrHelper
      ? window.OcrHelper.generateDefaultKnittingThumb("구름 퐁당 카드지갑", "코바늘 6호 · 코튼실", 2).dataUrl
      : "";

    const seedPatterns = [
      {
        id: "pat_sample_1",
        title: "포근 데일리 꽈배기 머플러",
        category: "대바늘 5.0mm · 소프트 메리노울 3볼",
        authorName: "김뜨개",
        isPublic: true,
        thumbnailDataUrl: thumb1,
        lines: [
          "준비: 일반 코잡기로 36코를 잡아주세요.",
          "1단 (겉면): 고무뜨기 (겉뜨기 2코, 안뜨기 2코) 끝까지 반복",
          "2단 (안면): 보이는 대로 뜨기 (겉2, 안2 반복) - 총 8단까지 고무단 완성",
          "3단 (무늬 1단): 안뜨기 4코, 겉뜨기 8코, 안뜨기 12코, 겉뜨기 8코, 안뜨기 4코",
          "4단 (무늬 2단): 겉뜨기 4코, 안뜨기 8코, 겉뜨기 12코, 안뜨기 8코, 겉뜨기 4코",
          "5단 (꽈배기 교차단): 안4, [앞걸어 4코 교차뜨기], 안12, [앞걸어 4코 교차뜨기], 안4",
          "6단 ~ 10단: 무늬 1단과 2단을 번갈아 평단으로 떠주세요.",
          "마무리: 원하는 길이(약 160cm)까지 뜬 후 고무뜨기 8단 후 덮어씌워 코막음합니다."
        ],
        createdAt: "2026-10-28T12:30:00Z"
      },
      {
        id: "pat_sample_2",
        title: "복주머니 호빵 수세미 (공용 인기 도안)",
        category: "코바늘 5호 · 친환경 수세미실",
        authorName: "박코바늘",
        isPublic: true,
        thumbnailDataUrl: thumb2,
        lines: [
          "1단: 매직링 안에 기둥코 사슬 3코(한길긴뜨기 1코로 간주) + 한길긴뜨기 11코 = 총 12코, 빼뜨기",
          "2단: 사슬 3코, 각 코마다 한길긴뜨기 2코씩 코늘리기 = 총 24코, 빼뜨기",
          "3단: [한길긴뜨기 1코, 한길긴뜨기 코늘리기] 12번 반복 = 총 36코",
          "4단: [한길긴뜨기 2코, 한길긴뜨기 코늘리기] 12번 반복 = 총 48코",
          "5단 ~ 8단: 증감 없이 한 코에 한길긴뜨기 1코씩 평단 48코 뜨기",
          "9단: [한길긴뜨기 2코, 한길긴뜨기 2코 모아뜨기] 12번 반복 = 총 36코",
          "10단: [한길긴뜨기 1코, 한길긴뜨기 2코 모아뜨기] 12번 반복 = 총 24코",
          "11단: 전 구간 2코 모아뜨기 후 고리 사슬 12코 만들고 실 정리"
        ],
        createdAt: "2026-10-28T15:20:00Z"
      },
      {
        id: "pat_sample_3",
        title: "구름 퐁당 카드지갑 (나만 보는 도안 예시)",
        category: "코바늘 6호 · 벨벳 튜브사",
        authorName: "김뜨개",
        isPublic: false,
        thumbnailDataUrl: thumb3,
        lines: [
          "기초코: 사슬 15코 잡고 기둥코 사슬 1코 세우기",
          "1단: 두 번째 코부터 짧은뜨기 14코, 마지막 코에 짧은뜨기 3코, 반대편 13코, 첫 코에 2코 추가 (원형 바닥)",
          "2단 ~ 9단: 이랑짧은뜨기로 한 코에 하나씩 총 32코 원통형으로 올리기",
          "10단: 덮개 부분 왕복 짧은뜨기 14코씩 6단 뜨기",
          "마무리: 단추 구멍 사슬 4코 만들고 빼뜨기로 테두리 정리"
        ],
        createdAt: "2026-10-29T09:10:00Z"
      }
    ];
    this.setLocal(STORAGE_KEYS.PATTERNS, seedPatterns);

    // 김뜨개님의 개인 체크 및 메모 예시 (박코바늘 계정으로 로그인하면 전혀 보이지 않음!)
    const seedProgress = {
      "김뜨개__pat_sample_1": {
        id: "김뜨개__pat_sample_1",
        userName: "김뜨개",
        patternId: "pat_sample_1",
        checkedLines: { 0: true, 1: true, 2: true },
        currentRow: 3,
        currentStitch: 16,
        memo: "고무단 8단까지 완료! 무늬 1단 16코까지 뜨고 마커 걸어둠.",
        updatedAt: "2026-10-29T10:00:00Z"
      },
      "김뜨개__pat_sample_2": {
        id: "김뜨개__pat_sample_2",
        userName: "김뜨개",
        patternId: "pat_sample_2",
        checkedLines: { 0: true, 1: true },
        currentRow: 2,
        currentStitch: 24,
        memo: "박코바늘님이 올려주신 공용 도안 보고 뜨는 중! 딸기우유색 실 사용.",
        updatedAt: "2026-10-29T11:00:00Z"
      }
    };
    this.setLocal(STORAGE_KEYS.PROGRESS, seedProgress);

    const seedLinks = [
      {
        id: "link_sample_1",
        userName: "김뜨개",
        url: "https://www.youtube.com/results?search_query=%EB%8C%80%EB%B0%94%EB%8A%98+%EA%BD%88%EB%B0%B0%EA%B8%B0+%EB%9C%A8%EA%B8%B0",
        title: "대바늘 꽈배기 교차뜨기 기초 영상 모음",
        siteName: "YouTube",
        createdAt: "2026-10-28T18:00:00Z"
      },
      {
        id: "link_sample_2",
        userName: "김뜨개",
        url: "https://www.ravelry.com/",
        title: "Ravelry 글로벌 뜨개질 도안 사이트",
        siteName: "Ravelry",
        createdAt: "2026-10-29T09:30:00Z"
      }
    ];
    this.setLocal(STORAGE_KEYS.LINKS, seedLinks);
  },

  getLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  setLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error("LocalStorage 저장 오류:", e);
    }
  },

  // ==================== 1. 사용자 인증 (아이디: 이름, 비밀번호: 숫자) ====================
  getCurrentUser() {
    return this.getLocal(STORAGE_KEYS.SESSION, null);
  },

  setCurrentUser(userObj) {
    if (!userObj) {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    } else {
      this.setLocal(STORAGE_KEYS.SESSION, userObj);
    }
  },

  async loginOrRegister(name, pin) {
    const cleanName = (name || "").trim();
    const cleanPin = (pin || "").trim();

    if (!cleanName) {
      throw new Error("아이디(이름)를 입력해 주세요.");
    }
    if (!/^[0-9]+$/.test(cleanPin)) {
      throw new Error("비밀번호는 숫자로만 입력해 주세요.");
    }

    // Firebase 연동 시 Firestore에서도 사용자 조회/저장
    if (this.isFirebaseConnected && this.db) {
      try {
        const docRef = this.db.collection("users").doc(cleanName);
        const snap = await docRef.get();
        if (snap.exists) {
          const data = snap.data();
          if (String(data.pin) !== cleanPin) {
            throw new Error(`'${cleanName}' 계정의 숫자 비밀번호가 일치하지 않습니다.`);
          }
          const user = { name: cleanName, pin: cleanPin, isNew: false };
          this.setCurrentUser(user);
          return user;
        } else {
          const newUser = {
            name: cleanName,
            pin: cleanPin,
            createdAt: new Date().toISOString()
          };
          await docRef.set(newUser);
          this.setCurrentUser({ ...newUser, isNew: true });
          return { ...newUser, isNew: true };
        }
      } catch (err) {
        if (err.message.includes("비밀번호가 일치하지")) throw err;
        console.warn("Firestore 로그인 중 오류 발생, 로컬 모드로 진행:", err);
      }
    }

    // 로컬 저장소 처리
    const users = this.getLocal(STORAGE_KEYS.USERS, []);
    const existing = users.find((u) => u.name === cleanName);

    if (existing) {
      if (String(existing.pin) !== cleanPin) {
        throw new Error(`'${cleanName}' 계정의 숫자 비밀번호가 일치하지 않습니다.`);
      }
      const sessionUser = { name: existing.name, pin: existing.pin, isNew: false };
      this.setCurrentUser(sessionUser);
      return sessionUser;
    } else {
      const newUser = {
        name: cleanName,
        pin: cleanPin,
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      this.setLocal(STORAGE_KEYS.USERS, users);
      const sessionUser = { ...newUser, isNew: true };
      this.setCurrentUser(sessionUser);
      return sessionUser;
    }
  },

  // ==================== 2. 도안 목록 & 등록 ====================
  async getAccessiblePatterns(userName) {
    let allPatterns = this.getLocal(STORAGE_KEYS.PATTERNS, []);

    if (this.isFirebaseConnected && this.db) {
      try {
        const snap = await this.db.collection("patterns").orderBy("createdAt", "desc").get();
        const remoteList = [];
        snap.forEach((doc) => remoteList.push({ id: doc.id, ...doc.data() }));
        if (remoteList.length > 0) {
          allPatterns = remoteList;
          this.setLocal(STORAGE_KEYS.PATTERNS, allPatterns);
        }
      } catch (err) {
        console.warn("Firestore 도안 조회 실패, 로컬 캐시 사용:", err);
      }
    }

    // 내가 올린 도안이거나(authorName === userName) 타인이 공용으로 올린 도안(isPublic === true)만 표시
    return allPatterns
      .filter((p) => p.authorName === userName || p.isPublic === true)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addPattern(patternData) {
    const newPattern = {
      id: "pat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      title: patternData.title,
      category: patternData.category || "자유 뜨개 도안",
      authorName: patternData.authorName,
      isPublic: Boolean(patternData.isPublic),
      thumbnailDataUrl: patternData.thumbnailDataUrl || "",
      lines: Array.isArray(patternData.lines) ? patternData.lines : [],
      createdAt: new Date().toISOString()
    };

    const patterns = this.getLocal(STORAGE_KEYS.PATTERNS, []);
    patterns.unshift(newPattern);
    this.setLocal(STORAGE_KEYS.PATTERNS, patterns);

    if (this.isFirebaseConnected && this.db) {
      try {
        await this.db.collection("patterns").doc(newPattern.id).set(newPattern);
      } catch (err) {
        console.warn("Firestore 도안 저장 실패 (로컬에는 저장됨):", err);
      }
    }

    return newPattern;
  },

  async deletePattern(patternId, currentUserName) {
    const patterns = this.getLocal(STORAGE_KEYS.PATTERNS, []);
    const target = patterns.find((p) => p.id === patternId);
    if (!target || target.authorName !== currentUserName) {
      throw new Error("본인이 등록한 도안만 삭제할 수 있습니다.");
    }

    const updated = patterns.filter((p) => p.id !== patternId);
    this.setLocal(STORAGE_KEYS.PATTERNS, updated);

    if (this.isFirebaseConnected && this.db) {
      try {
        await this.db.collection("patterns").doc(patternId).delete();
      } catch (err) {
        console.warn("Firestore 도안 삭제 실패:", err);
      }
    }
  },

  // ==================== 3. 개인별 체크 표시 & 메모 (본인만 볼 수 있음) ====================
  getProgressKey(userName, patternId) {
    return `${userName}__${patternId}`;
  },

  async getUserProgressForPattern(userName, patternId) {
    const key = this.getProgressKey(userName, patternId);
    const allProgress = this.getLocal(STORAGE_KEYS.PROGRESS, {});

    if (this.isFirebaseConnected && this.db) {
      try {
        const snap = await this.db.collection("userProgress").doc(key).get();
        if (snap.exists) {
          const data = snap.data();
          allProgress[key] = data;
          this.setLocal(STORAGE_KEYS.PROGRESS, allProgress);
          return data;
        }
      } catch (err) {
        console.warn("Firestore 진행도 조회 오류:", err);
      }
    }

    return (
      allProgress[key] || {
        id: key,
        userName,
        patternId,
        checkedLines: {},
        currentRow: 0,
        currentStitch: 0,
        memo: "",
        updatedAt: null
      }
    );
  },

  getAllLocalProgressForUser(userName) {
    const allProgress = this.getLocal(STORAGE_KEYS.PROGRESS, {});
    const userMap = {};
    Object.values(allProgress).forEach((item) => {
      if (item && item.userName === userName) {
        userMap[item.patternId] = item;
      }
    });
    return userMap;
  },

  async saveUserProgress(userName, patternId, progressPatch) {
    const key = this.getProgressKey(userName, patternId);
    const allProgress = this.getLocal(STORAGE_KEYS.PROGRESS, {});
    const current = allProgress[key] || {
      id: key,
      userName,
      patternId,
      checkedLines: {},
      currentRow: 0,
      currentStitch: 0,
      memo: ""
    };

    const updated = {
      ...current,
      ...progressPatch,
      id: key,
      userName,
      patternId,
      updatedAt: new Date().toISOString()
    };

    allProgress[key] = updated;
    this.setLocal(STORAGE_KEYS.PROGRESS, allProgress);

    if (this.isFirebaseConnected && this.db) {
      try {
        await this.db.collection("userProgress").doc(key).set(updated);
      } catch (err) {
        console.warn("Firestore 진행도 저장 오류:", err);
      }
    }

    return updated;
  },

  // ==================== 4. 뜨개질 첨부파일 (링크 그대로 저장 & 목록) ====================
  async getUserLinks(userName) {
    let allLinks = this.getLocal(STORAGE_KEYS.LINKS, []);

    if (this.isFirebaseConnected && this.db) {
      try {
        const snap = await this.db
          .collection("userLinks")
          .where("userName", "==", userName)
          .get();
        const remoteLinks = [];
        snap.forEach((doc) => remoteLinks.push({ id: doc.id, ...doc.data() }));
        if (remoteLinks.length > 0) {
          // 병합 업데이트
          const others = allLinks.filter((l) => l.userName !== userName);
          allLinks = [...remoteLinks, ...others];
          this.setLocal(STORAGE_KEYS.LINKS, allLinks);
        }
      } catch (err) {
        console.warn("Firestore 링크 조회 오류:", err);
      }
    }

    return allLinks
      .filter((l) => l.userName === userName)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async addUserLink(userName, rawUrl, customTitle) {
    const trimmedUrl = (rawUrl || "").trim();
    if (!trimmedUrl) {
      throw new Error("링크 주소를 입력해 주세요.");
    }

    // 클릭 이동용 URL (원본 문자열도 보존하고 href용 프로토콜도 보장)
    const hrefUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    const siteName = this.detectSiteName(hrefUrl);

    const newLink = {
      id: "link_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      userName,
      url: trimmedUrl,
      hrefUrl,
      title: (customTitle || "").trim() || trimmedUrl,
      siteName,
      createdAt: new Date().toISOString()
    };

    const allLinks = this.getLocal(STORAGE_KEYS.LINKS, []);
    allLinks.unshift(newLink);
    this.setLocal(STORAGE_KEYS.LINKS, allLinks);

    if (this.isFirebaseConnected && this.db) {
      try {
        await this.db.collection("userLinks").doc(newLink.id).set(newLink);
      } catch (err) {
        console.warn("Firestore 링크 저장 오류:", err);
      }
    }

    return newLink;
  },

  async deleteUserLink(linkId, userName) {
    const allLinks = this.getLocal(STORAGE_KEYS.LINKS, []);
    const updated = allLinks.filter((l) => !(l.id === linkId && l.userName === userName));
    this.setLocal(STORAGE_KEYS.LINKS, updated);

    if (this.isFirebaseConnected && this.db) {
      try {
        await this.db.collection("userLinks").doc(linkId).delete();
      } catch (err) {
        console.warn("Firestore 링크 삭제 오류:", err);
      }
    }
  },

  detectSiteName(url) {
    const lower = url.toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "▶️ YouTube";
    if (lower.includes("blog.naver.com") || lower.includes("naver.com")) return "📗 네이버";
    if (lower.includes("ravelry.com")) return "🧶 Ravelry";
    if (lower.includes("instagram.com")) return "📷 Instagram";
    if (lower.includes("pinterest.com") || lower.includes("pin.it")) return "📌 Pinterest";
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return "🔗 " + host;
    } catch (e) {
      return "🔗 웹 링크";
    }
  }
};

window.StorageService = StorageService;
window.STORAGE_KEYS = STORAGE_KEYS;
