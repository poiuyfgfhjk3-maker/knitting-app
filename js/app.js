/**
 * 메인 애플리케이션 컨트롤러 (js/app.js)
 */

const App = {
  currentUser: null,
  currentView: "login",
  listFilter: "all", // 'all' | 'mine' | 'public'
  cachedPatterns: [],
  currentPattern: null,
  currentProgress: null,
  memoSaveTimer: null,
  largeFontMode: false,

  // 뜨개질 등록 화면 상태
  ocrFileQueue: [], // [{ id, file, name, ext }]
  thumbMode: "auto", // 'auto' | 'custom'
  currentThumbDataUrl: "",
  themeSeedCounter: 0,

  async init() {
    window.StorageService.init();
    this.updateDbStatusUI();
    this.setupDragAndDrop();

    // 도안 이름/카테고리 입력 시 자동 썸네일 업데이트 이벤트
    const titleInput = document.getElementById("regTitle");
    const catInput = document.getElementById("regCategory");
    if (titleInput) {
      titleInput.addEventListener("input", () => {
        if (this.thumbMode === "auto" && this.ocrFileQueue.length === 0) {
          this.regenerateAutoThumbnail(false);
        }
      });
    }
    if (catInput) {
      catInput.addEventListener("input", () => {
        if (this.thumbMode === "auto" && this.ocrFileQueue.length === 0) {
          this.regenerateAutoThumbnail(false);
        }
      });
    }

    // 기존 로그인 세션 확인
    const savedUser = window.StorageService.getCurrentUser();
    if (savedUser && savedUser.name) {
      this.currentUser = savedUser;
      this.applyLoggedInUI();
      await this.navigate("home");
    } else {
      this.showLoginView();
    }
  },

  updateDbStatusUI() {
    const dot = document.getElementById("dbStatusDot");
    const txt = document.getElementById("dbStatusText");
    if (!dot || !txt) return;

    if (window.StorageService.isFirebaseConnected) {
      dot.classList.add("connected");
      txt.textContent = "Firebase 실시간 연동중";
    } else {
      dot.classList.remove("connected");
      txt.textContent = "로컬 저장소 (Firebase 설정 가능)";
    }
  },

  showToast(message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  },

  // ==================== 로그인 / 로그아웃 (5. 아이디=이름, 비밀번호=숫자) ====================
  showLoginView() {
    this.currentView = "login";
    document.getElementById("appHeader").style.display = "none";
    document.querySelectorAll(".view-section").forEach((el) => {
      el.style.display = "none";
    });
    document.getElementById("view-login").style.display = "block";
  },

  applyLoggedInUI() {
    document.getElementById("appHeader").style.display = "block";
    document.getElementById("headerUserName").textContent = this.currentUser.name;
    document.getElementById("homeUserName").textContent = this.currentUser.name;
    document.querySelectorAll(".current-user-label").forEach((el) => {
      el.textContent = this.currentUser.name;
    });
  },

  async handleLogin(event) {
    event.preventDefault();
    const nameInput = document.getElementById("loginName");
    const pinInput = document.getElementById("loginPin");
    const errBox = document.getElementById("loginErrorMsg");
    errBox.style.display = "none";

    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();

    if (!/^[0-9]+$/.test(pin)) {
      errBox.textContent = "비밀번호는 숫자만 입력할 수 있습니다.";
      errBox.style.display = "block";
      return;
    }

    try {
      const user = await window.StorageService.loginOrRegister(name, pin);
      this.currentUser = user;
      this.applyLoggedInUI();
      if (user.isNew) {
        this.showToast(`환영합니다, ${user.name}님! 새 계정이 등록되었습니다.`);
      } else {
        this.showToast(`반갑습니다, ${user.name}님!`);
      }
      await this.navigate("home");
    } catch (err) {
      errBox.textContent = err.message || "로그인 중 오류가 발생했습니다.";
      errBox.style.display = "block";
    }
  },

  async quickLogin(name, pin) {
    document.getElementById("loginName").value = name;
    document.getElementById("loginPin").value = pin;
    const fakeEvent = { preventDefault() {} };
    await this.handleLogin(fakeEvent);
  },

  logout() {
    window.StorageService.setCurrentUser(null);
    this.currentUser = null;
    document.getElementById("loginName").value = "";
    document.getElementById("loginPin").value = "";
    this.showToast("로그아웃 되었습니다.");
    this.showLoginView();
  },

  // ==================== 화면 네비게이션 ====================
  async navigate(viewName, patternId = null) {
    if (!this.currentUser) {
      this.showLoginView();
      return;
    }

    this.currentView = viewName;
    document.querySelectorAll(".view-section").forEach((el) => {
      el.style.display = "none";
    });

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      const navTarget = btn.getAttribute("data-nav");
      btn.classList.toggle("active", navTarget === viewName || (viewName === "detail" && navTarget === "list"));
    });

    if (viewName === "home") {
      document.getElementById("view-home").style.display = "block";
      await this.renderHomeDashboard();
    } else if (viewName === "list") {
      document.getElementById("view-list").style.display = "block";
      await this.loadAndRenderPatternList();
    } else if (viewName === "detail" && patternId) {
      document.getElementById("view-detail").style.display = "block";
      await this.openPatternDetail(patternId);
    } else if (viewName === "register") {
      document.getElementById("view-register").style.display = "block";
      this.prepareRegisterView();
    } else if (viewName === "links") {
      document.getElementById("view-links").style.display = "block";
      await this.loadAndRenderLinks();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ==================== 홈 대시보드 (4. 처음 화면 3대 메뉴) ====================
  async renderHomeDashboard() {
    const patterns = await window.StorageService.getAccessiblePatterns(this.currentUser.name);
    const links = await window.StorageService.getUserLinks(this.currentUser.name);
    const myCount = patterns.filter((p) => p.authorName === this.currentUser.name).length;
    const pubCount = patterns.filter((p) => p.isPublic).length;

    const statsEl = document.getElementById("homeQuickStats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-pill">
          <strong>${myCount}개</strong>
          <span>내가 올린 도안</span>
        </div>
        <div class="stat-pill">
          <strong>${pubCount}개</strong>
          <span>공용 도안</span>
        </div>
        <div class="stat-pill">
          <strong>${links.length}개</strong>
          <span>저장한 링크</span>
        </div>
      `;
    }
  },

  // ==================== 뜨개질 목록 (6. 내 목록 & 타인 공용 목록) ====================
  async loadAndRenderPatternList() {
    this.cachedPatterns = await window.StorageService.getAccessiblePatterns(this.currentUser.name);
    this.renderPatternList();
  },

  setListFilter(filterType) {
    this.listFilter = filterType;
    document.querySelectorAll(".filter-tabs .tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-filter") === filterType);
    });
    this.renderPatternList();
  },

  renderPatternList() {
    const userName = this.currentUser.name;
    const allAccessible = this.cachedPatterns || [];
    const mineList = allAccessible.filter((p) => p.authorName === userName);
    const othersPublicList = allAccessible.filter((p) => p.authorName !== userName && p.isPublic);

    document.getElementById("countAll").textContent = allAccessible.length;
    document.getElementById("countMine").textContent = mineList.length;
    document.getElementById("countPublic").textContent = othersPublicList.length;

    let filtered = allAccessible;
    if (this.listFilter === "mine") {
      filtered = mineList;
    } else if (this.listFilter === "public") {
      filtered = othersPublicList;
    }

    const searchInput = document.getElementById("patternSearchInput");
    const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (q) {
      filtered = filtered.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q) ||
          (p.authorName || "").toLowerCase().includes(q)
      );
    }

    const grid = document.getElementById("patternListGrid");
    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🧶</div>
          <h3>표시할 뜨개질 도안이 없습니다.</h3>
          <p style="margin: 6px 0 16px;">새 뜨개질 도안을 등록하고 한 줄씩 체크해 보세요!</p>
          <button class="btn-primary" onclick="App.navigate('register')">+ 뜨개질 도안 등록하기</button>
        </div>
      `;
      return;
    }

    const progressMap = window.StorageService.getAllLocalProgressForUser(userName);

    grid.innerHTML = filtered
      .map((p, idx) => {
        const isMine = p.authorName === userName;
        const totalLines = Array.isArray(p.lines) ? p.lines.length : 0;
        const myProg = progressMap[p.id] || { checkedLines: {}, memo: "", currentRow: 0, currentStitch: 0 };
        const checkedCount = Object.values(myProg.checkedLines || {}).filter(Boolean).length;
        const pct = totalLines > 0 ? Math.min(100, Math.round((checkedCount / totalLines) * 100)) : 0;

        const thumbSrc =
          p.thumbnailDataUrl ||
          window.OcrHelper.generateDefaultKnittingThumb(p.title, p.category, idx).dataUrl;

        const scopeBadge = p.isPublic
          ? `<span class="badge public">🌐 공용 도안</span>`
          : `<span class="badge private">🔒 나만 보기</span>`;
        const ownerBadge = isMine
          ? `<span class="badge mine">내가 등록함</span>`
          : `<span class="badge">작성자: ${this.escapeHtml(p.authorName)}</span>`;

        let personalMemoHint = "";
        if (myProg.memo || myProg.currentRow > 0 || myProg.currentStitch > 0) {
          const counterTxt =
            myProg.currentRow || myProg.currentStitch
              ? `[${myProg.currentRow || 0}줄 ${myProg.currentStitch || 0}코] `
              : "";
          personalMemoHint = `<div class="card-memo-preview">📝 내 메모: ${this.escapeHtml(
            counterTxt + (myProg.memo || "")
          )}</div>`;
        }

        return `
          <article class="pattern-card" onclick="App.navigate('detail', '${p.id}')">
            <div class="pattern-thumb-box">
              <img src="${thumbSrc}" alt="${this.escapeHtml(p.title)}" loading="lazy" />
              <div class="card-badge-group">
                ${ownerBadge}
                ${scopeBadge}
              </div>
            </div>
            <div class="pattern-card-body">
              <div>
                <h3 class="pattern-card-title">${this.escapeHtml(p.title)}</h3>
                <p class="pattern-card-meta">${this.escapeHtml(p.category || "자유 도안")} · 총 ${totalLines}줄</p>
                ${personalMemoHint}
              </div>
              <div class="card-progress-wrap">
                <div class="card-progress-top">
                  <span>내 진행률 (${checkedCount}/${totalLines}줄)</span>
                  <span>${pct}%</span>
                </div>
                <div class="progress-bar-track sm">
                  <div class="progress-bar-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  },

  // ==================== 도안 상세: 한 줄씩 체크 + 체크 초기화 + 개인 메모 (7, 8번) ====================
  async openPatternDetail(patternId) {
    if (!this.cachedPatterns || this.cachedPatterns.length === 0) {
      this.cachedPatterns = await window.StorageService.getAccessiblePatterns(this.currentUser.name);
    }
    const pattern = this.cachedPatterns.find((p) => p.id === patternId);
    if (!pattern) {
      this.showToast("도안을 찾을 수 없습니다.");
      await this.navigate("list");
      return;
    }

    this.currentPattern = pattern;
    this.currentProgress = await window.StorageService.getUserProgressForPattern(
      this.currentUser.name,
      pattern.id
    );

    // 상단 메타 렌더링
    const thumbImg = document.getElementById("detailThumbnail");
    thumbImg.src =
      pattern.thumbnailDataUrl ||
      window.OcrHelper.generateDefaultKnittingThumb(pattern.title, pattern.category, 0).dataUrl;

    const scopeBadge = document.getElementById("detailScopeBadge");
    if (pattern.isPublic) {
      scopeBadge.className = "badge public";
      scopeBadge.textContent = "🌐 공용 도안";
    } else {
      scopeBadge.className = "badge private";
      scopeBadge.textContent = "🔒 나만 보기";
    }

    document.getElementById("detailCategoryBadge").textContent = pattern.category || "뜨개질 도안";
    document.getElementById("detailTitle").textContent = pattern.title;
    document.getElementById("detailAuthor").textContent = pattern.authorName;
    document.getElementById("detailYarnInfo").textContent = pattern.category || "-";
    document.getElementById("detailDate").textContent = this.formatDate(pattern.createdAt);

    // 본인 도안인 경우 삭제 버튼 제공
    const ownerActions = document.getElementById("detailOwnerActions");
    if (pattern.authorName === this.currentUser.name) {
      ownerActions.innerHTML = `
        <button class="btn-danger-outline btn-sm" onclick="App.handleDeleteCurrentPattern()">
          🗑️ 내 도안 삭제
        </button>
      `;
    } else {
      ownerActions.innerHTML = "";
    }

    // 우측 개인 전용 카운터 & 메모란 세팅
    document.getElementById("memoRowInput").value = this.currentProgress.currentRow || 0;
    document.getElementById("memoStitchInput").value = this.currentProgress.currentStitch || 0;
    document.getElementById("personalMemoTextarea").value = this.currentProgress.memo || "";
    document.getElementById("memoSaveStatus").textContent = "개인 보관함에 안전하게 저장됨";

    this.renderChecklistLines();
  },

  renderChecklistLines() {
    if (!this.currentPattern) return;
    const lines = Array.isArray(this.currentPattern.lines) ? this.currentPattern.lines : [];
    const checkedMap = (this.currentProgress && this.currentProgress.checkedLines) || {};

    let completedCount = 0;
    let firstUncheckedIndex = -1;

    lines.forEach((_, idx) => {
      if (checkedMap[idx]) {
        completedCount++;
      } else if (firstUncheckedIndex === -1) {
        firstUncheckedIndex = idx;
      }
    });

    const total = lines.length;
    const pct = total > 0 ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;

    document.getElementById("detailProgressText").textContent = `${completedCount} / ${total}줄 완료 (${pct}%)`;
    document.getElementById("detailProgressBar").style.width = `${pct}%`;

    const container = document.getElementById("patternLinesContainer");
    container.classList.toggle("large-font", this.largeFontMode);

    if (lines.length === 0) {
      container.innerHTML = `<div class="empty-state">등록된 도안 줄 내용이 없습니다.</div>`;
      return;
    }

    container.innerHTML = lines
      .map((lineText, idx) => {
        const isChecked = Boolean(checkedMap[idx]);
        const isNextUp = idx === firstUncheckedIndex;
        const itemClasses = [
          "pattern-line-item",
          isChecked ? "checked" : "",
          isNextUp ? "next-up" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div class="${itemClasses}" onclick="App.toggleLineCheck(${idx})">
            <div class="line-checkbox">${isChecked ? "✓" : ""}</div>
            <span class="line-num-badge">${idx + 1}줄</span>
            <div class="pattern-line-text">${this.escapeHtml(lineText)}</div>
            ${isNextUp ? `<span class="next-indicator">지금 뜰 차례</span>` : ""}
          </div>
        `;
      })
      .join("");
  },

  async toggleLineCheck(lineIndex) {
    if (!this.currentPattern || !this.currentProgress) return;
    const checkedLines = { ...(this.currentProgress.checkedLines || {}) };

    if (checkedLines[lineIndex]) {
      delete checkedLines[lineIndex];
    } else {
      checkedLines[lineIndex] = true;
    }

    this.currentProgress.checkedLines = checkedLines;
    this.renderChecklistLines();

    await window.StorageService.saveUserProgress(this.currentUser.name, this.currentPattern.id, {
      checkedLines
    });
  },

  async resetPatternChecks() {
    if (!this.currentPattern || !this.currentProgress) return;
    const checkedCount = Object.values(this.currentProgress.checkedLines || {}).filter(Boolean).length;
    if (checkedCount === 0) {
      this.showToast("이미 모든 체크가 초기화되어 있습니다.");
      return;
    }

    if (!confirm("이 도안의 체크 표시를 모두 초기화하시겠습니까? (작성한 개인 메모는 유지됩니다)")) {
      return;
    }

    this.currentProgress.checkedLines = {};
    this.renderChecklistLines();

    await window.StorageService.saveUserProgress(this.currentUser.name, this.currentPattern.id, {
      checkedLines: {}
    });
    this.showToast("체크 표시가 모두 초기화되었습니다.");
  },

  toggleFontSize() {
    this.largeFontMode = !this.largeFontMode;
    this.renderChecklistLines();
    this.showToast(this.largeFontMode ? "큰 글씨 모드로 전환되었습니다." : "기본 글씨 크기로 전환되었습니다.");
  },

  adjustCounter(type, delta) {
    const inputId = type === "row" ? "memoRowInput" : "memoStitchInput";
    const el = document.getElementById(inputId);
    if (!el) return;
    const nextVal = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
    el.value = nextVal;
    this.savePersonalMemo(false);
  },

  scheduleMemoSave() {
    const statusEl = document.getElementById("memoSaveStatus");
    if (statusEl) statusEl.textContent = "입력 중...";
    if (this.memoSaveTimer) clearTimeout(this.memoSaveTimer);
    this.memoSaveTimer = setTimeout(() => {
      this.savePersonalMemo(false);
    }, 550);
  },

  async savePersonalMemo(showToastNotice = false) {
    if (!this.currentPattern || !this.currentUser) return;
    const currentRow = Math.max(0, parseInt(document.getElementById("memoRowInput").value, 10) || 0);
    const currentStitch = Math.max(0, parseInt(document.getElementById("memoStitchInput").value, 10) || 0);
    const memo = document.getElementById("personalMemoTextarea").value;

    this.currentProgress = await window.StorageService.saveUserProgress(
      this.currentUser.name,
      this.currentPattern.id,
      {
        currentRow,
        currentStitch,
        memo
      }
    );

    const statusEl = document.getElementById("memoSaveStatus");
    if (statusEl) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      statusEl.textContent = `✓ 저장됨 (${timeStr})`;
    }

    if (showToastNotice) {
      this.showToast("나만의 단수·코수 및 메모가 저장되었습니다.");
    }
  },

  async handleDeleteCurrentPattern() {
    if (!this.currentPattern) return;
    if (!confirm(`'${this.currentPattern.title}' 도안을 삭제하시겠습니까?`)) return;

    try {
      await window.StorageService.deletePattern(this.currentPattern.id, this.currentUser.name);
      this.showToast("도안이 삭제되었습니다.");
      await this.navigate("list");
    } catch (err) {
      alert(err.message);
    }
  },

  // ==================== 뜨개질 등록 (9~13. 파일 다중 업로드 순서정렬 OCR + 수동 복붙 + 썸네일 최적화) ====================
  prepareRegisterView() {
    document.getElementById("registerPatternForm").reset();
    this.ocrFileQueue = [];
    this.renderOcrQueue();
    document.getElementById("ocrProgressBox").style.display = "none";
    this.setThumbMode("auto");
    this.regenerateAutoThumbnail(false);
    this.updateLiveChecklistPreview();
  },

  setupDragAndDrop() {
    const dropzone = document.getElementById("ocrDropzone");
    if (!dropzone) return;

    ["dragenter", "dragover"].forEach((evtName) => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((evtName) => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        this.addFilesToOcrQueue(Array.from(e.dataTransfer.files));
      }
    });
  },

  handleOcrFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    this.addFilesToOcrQueue(files);
    event.target.value = "";
  },

  addFilesToOcrQueue(files) {
    const allowedExts = ["pdf", "jpg", "jpeg", "png"];
    let addedCount = 0;

    files.forEach((file) => {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!allowedExts.includes(ext)) {
        this.showToast(`지원하지 않는 파일 형식입니다: ${file.name} (PDF, JPG, PNG만 가능)`);
        return;
      }
      this.ocrFileQueue.push({
        id: "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        file,
        name: file.name,
        ext: ext === "jpeg" ? "jpg" : ext
      });
      addedCount++;
    });

    if (addedCount > 0) {
      this.renderOcrQueue();
      // 도안 제목이 비어있다면 첫 파일 이름으로 자동 제안
      const titleInput = document.getElementById("regTitle");
      if (titleInput && !titleInput.value.trim() && this.ocrFileQueue.length > 0) {
        titleInput.value = this.ocrFileQueue[0].name.replace(/\.[^/.]+$/, "");
      }
      // 자동 미리보기 모드라면 첫 번째 파일로 최적화된 썸네일 자동 생성
      if (this.thumbMode === "auto") {
        this.updateAutoThumbFromFirstQueueFile();
      }
    }
  },

  renderOcrQueue() {
    const wrap = document.getElementById("ocrFileQueueWrap");
    const listEl = document.getElementById("ocrFileQueueList");
    const countEl = document.getElementById("ocrQueueCount");

    if (this.ocrFileQueue.length === 0) {
      wrap.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    wrap.style.display = "block";
    countEl.textContent = this.ocrFileQueue.length;

    listEl.innerHTML = this.ocrFileQueue
      .map((item, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === this.ocrFileQueue.length - 1;
        return `
          <li class="file-queue-item">
            <div class="file-item-left">
              <span class="file-order-badge">${idx + 1}순서</span>
              <span class="file-type-tag">${item.ext}</span>
              <span class="file-name-text" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</span>
            </div>
            <div class="file-item-controls">
              <button
                type="button"
                class="btn-order"
                onclick="App.moveQueueItem(${idx}, -1)"
                ${isFirst ? "disabled" : ""}
                title="순서 위로 올리기"
              >▲ 위로</button>
              <button
                type="button"
                class="btn-order"
                onclick="App.moveQueueItem(${idx}, 1)"
                ${isLast ? "disabled" : ""}
                title="순서 아래로 내리기"
              >▼ 아래로</button>
              <button
                type="button"
                class="btn-order"
                onclick="App.removeQueueItem(${idx})"
                title="목록에서 제거"
              >✕</button>
            </div>
          </li>
        `;
      })
      .join("");
  },

  moveQueueItem(index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= this.ocrFileQueue.length) return;
    const temp = this.ocrFileQueue[index];
    this.ocrFileQueue[index] = this.ocrFileQueue[targetIdx];
    this.ocrFileQueue[targetIdx] = temp;
    this.renderOcrQueue();

    if (this.thumbMode === "auto") {
      this.updateAutoThumbFromFirstQueueFile();
    }
  },

  removeQueueItem(index) {
    this.ocrFileQueue.splice(index, 1);
    this.renderOcrQueue();
    if (this.thumbMode === "auto") {
      this.updateAutoThumbFromFirstQueueFile();
    }
  },

  clearOcrQueue() {
    this.ocrFileQueue = [];
    this.renderOcrQueue();
    if (this.thumbMode === "auto") {
      this.regenerateAutoThumbnail(false);
    }
  },

  /**
   * 큐에 등록된 파일들을 1번 순서부터 차례대로 읽어와 도안 텍스트로 변환합니다.
   * (요구사항 10, 12: pdf, jpg, png를 순서에 맞춰 텍스트로 읽어와 형식에 맞게 변환)
   */
  async extractTextFromQueue() {
    if (this.ocrFileQueue.length === 0) {
      this.showToast("먼저 PDF, JPG, PNG 파일을 추가해 주세요.");
      return;
    }

    const progressBox = document.getElementById("ocrProgressBox");
    const statusTitle = document.getElementById("ocrStatusTitle");
    const statusDetail = document.getElementById("ocrStatusDetail");
    const progressBar = document.getElementById("ocrProgressBar");
    const btnRun = document.getElementById("btnRunOcr");

    progressBox.style.display = "flex";
    btnRun.disabled = true;

    const extractedSections = [];
    const totalFiles = this.ocrFileQueue.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const item = this.ocrFileQueue[i];
        statusTitle.textContent = `[${i + 1}/${totalFiles}번째 파일] '${item.name}' 텍스트 변환 중...`;
        statusDetail.textContent = "파일을 분석하고 있습니다...";

        const rawText = await window.OcrHelper.extractTextFromSingleFile(
          item.file,
          (msg, innerPct) => {
            statusDetail.textContent = msg;
            const overallPct = Math.round(((i + (innerPct || 0) / 100) / totalFiles) * 100);
            progressBar.style.width = `${Math.max(8, overallPct)}%`;
          }
        );

        const formattedLines = window.OcrHelper.formatRawTextToPatternLines(rawText, true);
        if (formattedLines.length > 0) {
          if (totalFiles > 1) {
            extractedSections.push(`[파일 ${i + 1}: ${item.name}]`);
          }
          extractedSections.push(...formattedLines);
        } else {
          extractedSections.push(`[파일 ${i + 1}: ${item.name} - 인식된 텍스트가 없어 직접 입력해 주세요]`);
        }
      }

      const textarea = document.getElementById("regPatternText");
      const existing = textarea.value.trim();
      const combined = existing
        ? existing + "\n" + extractedSections.join("\n")
        : extractedSections.join("\n");

      textarea.value = combined;
      this.updateLiveChecklistPreview();
      this.showToast(`총 ${totalFiles}개 파일에서 순서대로 도안 텍스트를 읽어왔습니다!`);
    } catch (err) {
      console.error("OCR 추출 오류:", err);
      alert("파일에서 텍스트를 읽어오는 중 오류가 발생했습니다: " + (err.message || err));
    } finally {
      progressBox.style.display = "none";
      btnRun.disabled = false;
    }
  },

  formatPatternText(mode) {
    const textarea = document.getElementById("regPatternText");
    if (!textarea || !textarea.value.trim()) {
      this.showToast(" 먼저 도안 텍스트를 입력하거나 붙여넣어 주세요.");
      return;
    }

    const lines = window.OcrHelper.formatRawTextToPatternLines(
      textarea.value,
      mode === "splitRows"
    );
    textarea.value = lines.join("\n");
    this.updateLiveChecklistPreview();
    this.showToast("도안 줄 형식이 깔끔하게 정리되었습니다!");
  },

  insertSamplePatternText() {
    const sample = [
      "준비: 대바늘 4.5mm, 코튼 울 혼방사 2볼 준비",
      "기초코: 일반 코잡기로 42코 잡기",
      "1단 ~ 6단: 1코 고무뜨기 (겉뜨기 1코, 안뜨기 1코 반복)",
      "7단 (몸판 시작): 메리야스 겉뜨기 42코",
      "8단 (안면): 안뜨기 42코",
      "9단 (무늬단): 겉뜨기 6코, [바늘비우기, 2코 모아뜨기] 끝까지 반복",
      "10단 ~ 20단: 메리야스 뜨기로 평단 10단 올리기",
      "마무리: 1코 고무뜨기 4단 후 느슨하게 코막음하고 실 정리"
    ].join("\n");

    document.getElementById("regPatternText").value = sample;
    const titleEl = document.getElementById("regTitle");
    if (!titleEl.value.trim()) {
      titleEl.value = "포근한 봄날 니트 코스터 & 미니매트";
      this.regenerateAutoThumbnail(false);
    }
    this.updateLiveChecklistPreview();
    this.showToast("예시 도안 텍스트가 입력되었습니다.");
  },

  updateLiveChecklistPreview() {
    const textarea = document.getElementById("regPatternText");
    const countEl = document.getElementById("previewLineCount");
    const container = document.getElementById("liveChecklistPreview");
    if (!textarea || !container) return;

    const lines = window.OcrHelper.formatRawTextToPatternLines(textarea.value, false);
    countEl.textContent = lines.length;

    if (lines.length === 0) {
      container.innerHTML = `<div style="font-size: 12.5px; color: var(--text-muted); padding: 8px;">위 입력란에 텍스트를 붙여넣거나 파일을 변환하면 줄별 체크 미리보기가 여기에 표시됩니다.</div>`;
      return;
    }

    container.innerHTML = lines
      .map(
        (line, idx) => `
        <div class="live-preview-row">
          <span class="num">${idx + 1}줄</span>
          <span>${this.escapeHtml(line)}</span>
        </div>
      `
      )
      .join("");
  },

  // ==================== 미리보기 그림 자동/직접 등록 & 최적화 (13번) ====================
  setThumbMode(mode) {
    this.thumbMode = mode;
    document.getElementById("thumbTabAuto").classList.toggle("active", mode === "auto");
    document.getElementById("thumbTabCustom").classList.toggle("active", mode === "custom");
    document.getElementById("customThumbUploadBox").style.display = mode === "custom" ? "block" : "none";

    if (mode === "auto") {
      if (this.ocrFileQueue.length > 0) {
        this.updateAutoThumbFromFirstQueueFile();
      } else {
        this.regenerateAutoThumbnail(false);
      }
    }
  },

  async updateAutoThumbFromFirstQueueFile() {
    if (this.ocrFileQueue.length === 0) {
      this.regenerateAutoThumbnail(false);
      return;
    }
    const first = this.ocrFileQueue[0];
    try {
      let opt;
      if (first.ext === "pdf") {
        opt = await window.OcrHelper.createOptimizedThumbFromPdfFile(first.file);
      } else {
        opt = await window.OcrHelper.createOptimizedThumbFromImageFile(first.file);
      }
      this.applyThumbPreview(opt, "첫 번째 파일에서 자동 최적화됨");
    } catch (err) {
      console.warn("첫 파일 썸네일 자동 생성 실패, 기본 일러스트로 대체:", err);
      this.regenerateAutoThumbnail(false);
    }
  },

  regenerateAutoThumbnail(incrementTheme = true) {
    if (incrementTheme) this.themeSeedCounter++;
    const title = document.getElementById("regTitle").value.trim() || "나만의 뜨개질 도안";
    const category = document.getElementById("regCategory").value.trim() || "핸드메이드 체크북";
    const opt = window.OcrHelper.generateDefaultKnittingThumb(title, category, this.themeSeedCounter);
    this.applyThumbPreview(opt, "자동 일러스트 최적화 완료");
  },

  async handleCustomThumbSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const opt = await window.OcrHelper.createOptimizedThumbFromImageFile(file);
      this.applyThumbPreview(opt, "직접 올린 사진 저용량 최적화 완료");
      this.showToast(`이미지가 ${opt.originalKB}KB → ${opt.optimizedKB}KB로 가볍게 최적화되었습니다!`);
    } catch (err) {
      alert("이미지를 최적화하는 중 오류가 발생했습니다.");
    }
  },

  applyThumbPreview(optResult, labelPrefix) {
    this.currentThumbDataUrl = optResult.dataUrl;
    const imgEl = document.getElementById("regThumbPreviewImg");
    const infoEl = document.getElementById("thumbOptimizationInfo");
    if (imgEl) imgEl.src = optResult.dataUrl;
    if (infoEl) {
      if (optResult.originalKB) {
        infoEl.textContent = `⚡ ${labelPrefix} (${optResult.originalKB}KB → ${optResult.optimizedKB}KB)`;
      } else {
        infoEl.textContent = `⚡ ${labelPrefix} (${optResult.optimizedKB}KB 저용량)`;
      }
    }
  },

  async handlePatternSubmit(event) {
    event.preventDefault();
    const title = document.getElementById("regTitle").value.trim();
    const category = document.getElementById("regCategory").value.trim();
    const rawText = document.getElementById("regPatternText").value;
    const scopeRadio = document.querySelector('input[name="regScope"]:checked');
    const isPublic = scopeRadio ? scopeRadio.value === "public" : true;

    const lines = window.OcrHelper.formatRawTextToPatternLines(rawText, false);
    if (!title) {
      alert("도안 이름을 입력해 주세요.");
      return;
    }
    if (lines.length === 0) {
      alert("도안 내용을 최소 한 줄 이상 입력하거나 파일에서 변환해 주세요.");
      return;
    }

    if (!this.currentThumbDataUrl) {
      this.regenerateAutoThumbnail(false);
    }

    const created = await window.StorageService.addPattern({
      title,
      category,
      authorName: this.currentUser.name,
      isPublic,
      thumbnailDataUrl: this.currentThumbDataUrl,
      lines
    });

    this.showToast(`'${created.title}' 도안이 등록되었습니다!`);
    this.cachedPatterns = await window.StorageService.getAccessiblePatterns(this.currentUser.name);
    await this.navigate("detail", created.id);
  },

  // ==================== 뜨개질 첨부파일: 링크 저장 및 목록 (13, 14번) ====================
  async loadAndRenderLinks() {
    const links = await window.StorageService.getUserLinks(this.currentUser.name);
    document.getElementById("savedLinkCount").textContent = links.length;

    const container = document.getElementById("savedLinksList");
    if (!container) return;

    if (links.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📎</div>
          <h3>아직 저장된 뜨개질 링크가 없습니다.</h3>
          <p style="margin-top: 6px;">위 입력칸에 유튜브 영상이나 도안 블로그 링크를 붙여넣어 저장해 보세요.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = links
      .map((item) => {
        const safeHref = this.escapeHtml(item.hrefUrl || item.url);
        return `
          <div class="link-item-card">
            <div class="link-info">
              <span class="link-site-badge">${this.escapeHtml(item.siteName || "🔗 링크")}</span>
              <div class="link-texts">
                <a class="link-title-anchor" href="${safeHref}" target="_blank" rel="noopener noreferrer">
                  ${this.escapeHtml(item.title)}
                </a>
                <span class="link-raw-url">${this.escapeHtml(item.url)}</span>
                <span class="link-date">저장일: ${this.formatDate(item.createdAt)}</span>
              </div>
            </div>
            <div class="link-actions">
              <a class="btn-outline btn-sm" href="${safeHref}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
                ↗ 열기
              </a>
              <button type="button" class="btn-secondary btn-sm" onclick="App.copyLinkToClipboard('${this.escapeJsStr(item.url)}')">
                📋 주소 복사
              </button>
              <button type="button" class="btn-danger-outline btn-sm" onclick="App.handleDeleteLink('${item.id}')">
                삭제
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  },

  async handleAddLink(event) {
    event.preventDefault();
    const urlInput = document.getElementById("linkUrlInput");
    const titleInput = document.getElementById("linkTitleInput");

    try {
      await window.StorageService.addUserLink(
        this.currentUser.name,
        urlInput.value,
        titleInput.value
      );
      urlInput.value = "";
      titleInput.value = "";
      this.showToast("링크가 그대로 저장되었습니다!");
      await this.loadAndRenderLinks();
    } catch (err) {
      alert(err.message);
    }
  },

  async handleDeleteLink(linkId) {
    if (!confirm("이 링크를 목록에서 삭제하시겠습니까?")) return;
    await window.StorageService.deleteUserLink(linkId, this.currentUser.name);
    this.showToast("링크가 삭제되었습니다.");
    await this.loadAndRenderLinks();
  },

  copyLinkToClipboard(url) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast("링크 주소가 클립보드에 복사되었습니다!");
      });
    } else {
      prompt("아래 링크 주소를 복사하세요:", url);
    }
  },

  // ==================== Firebase 연결 모달 제어 ====================
  openFirebaseModal() {
    const modal = document.getElementById("firebaseModal");
    const textarea = document.getElementById("firebaseConfigTextarea");
    const msg = document.getElementById("firebaseModalMsg");
    msg.textContent = "";

    const cfg = window.StorageService.getEffectiveFirebaseConfig();
    textarea.value = cfg ? JSON.stringify(cfg, null, 2) : "";
    modal.style.display = "flex";
  },

  closeFirebaseModal() {
    document.getElementById("firebaseModal").style.display = "none";
  },

  saveRuntimeFirebaseConfig() {
    const raw = document.getElementById("firebaseConfigTextarea").value.trim();
    const msg = document.getElementById("firebaseModalMsg");

    if (!raw) {
      msg.textContent = "Firebase 설정 JSON을 입력해 주세요.";
      return;
    }

    try {
      // 사용자가 const firebaseConfig = { ... } 형태로 붙여넣어도 파싱 가능하게 처리
      const jsonPart = raw.includes("{") ? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1) : raw;
      const parsed = Function('"use strict"; return (' + jsonPart + ")")();

      if (!parsed.apiKey || !parsed.projectId) {
        msg.textContent = "apiKey와 projectId 항목이 포함된 올바른 Firebase 설정이어야 합니다.";
        return;
      }

      localStorage.setItem(window.STORAGE_KEYS.FIREBASE_CFG, JSON.stringify(parsed));
      const ok = window.StorageService.tryConnectFirebase();
      this.updateDbStatusUI();

      if (ok) {
        this.showToast("Firebase 실시간 데이터베이스가 연결되었습니다!");
        this.closeFirebaseModal();
      } else {
        msg.textContent = "연결에 실패했습니다. 설정값을 다시 확인해 주세요.";
      }
    } catch (e) {
      msg.textContent = "JSON 형식이 올바르지 않습니다: " + e.message;
    }
  },

  clearRuntimeFirebaseConfig() {
    localStorage.removeItem(window.STORAGE_KEYS.FIREBASE_CFG);
    window.StorageService.isFirebaseConnected = false;
    window.StorageService.db = null;
    this.updateDbStatusUI();
    this.closeFirebaseModal();
    this.showToast("로컬 저장소 모드로 전환되었습니다.");
  },

  // ==================== 유틸리티 ====================
  formatDate(isoStr) {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
        d.getDate()
      ).padStart(2, "0")}`;
    } catch (e) {
      return "-";
    }
  },

  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  escapeJsStr(str) {
    return String(str ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
};

window.App = App;
window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
