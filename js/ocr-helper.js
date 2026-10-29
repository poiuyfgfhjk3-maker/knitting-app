/**
 * OCR (PDF / JPG / PNG 텍스트 추출) 및 미리보기 썸네일 이미지 저용량 최적화 모듈
 */

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const OcrHelper = {
  /**
   * 이미지를 저해상도·저용량(최대 420x300, JPEG 품질 0.68) DataURL로 최적화합니다.
   * (요구사항 13: 미리보기 그림은 고화질이 아니라 최적화해서 저장)
   */
  async optimizeImageFromElement(imgOrCanvas, originalByteSize = 0) {
    const MAX_W = 420;
    const MAX_H = 300;
    const srcW = imgOrCanvas.naturalWidth || imgOrCanvas.width || 400;
    const srcH = imgOrCanvas.naturalHeight || imgOrCanvas.height || 300;

    let targetW = srcW;
    let targetH = srcH;

    if (targetW > MAX_W) {
      targetH = Math.round((targetH * MAX_W) / targetW);
      targetW = MAX_W;
    }
    if (targetH > MAX_H) {
      targetW = Math.round((targetW * MAX_H) / targetH);
      targetH = MAX_H;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, targetW);
    canvas.height = Math.max(1, targetH);

    const ctx = canvas.getContext("2d");
    // 투명 PNG 배경을 따뜻한 크림색으로 채움
    ctx.fillStyle = "#faf6f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgOrCanvas, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.68);
    const optimizedBytes = Math.round((dataUrl.length * 3) / 4);

    return {
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      originalKB: originalByteSize ? Math.max(1, Math.round(originalByteSize / 1024)) : null,
      optimizedKB: Math.max(1, Math.round(optimizedBytes / 1024))
    };
  },

  /**
   * 이미지 파일(JPG, PNG)을 읽어서 최적화된 썸네일 DataURL을 반환합니다.
   */
  async createOptimizedThumbFromImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            const res = await this.optimizeImageFromElement(img, file.size);
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * PDF 파일의 첫 페이지를 렌더링하여 저용량 최적화 썸네일 DataURL로 반환합니다.
   */
  async createOptimizedThumbFromPdfFile(file) {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js 라이브러리가 로드되지 않았습니다.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    return await this.optimizeImageFromElement(canvas, file.size);
  },

  /**
   * 업로드된 파일이 없거나 기본 썸네일이 필요할 때
   * 도안 제목과 테마 색상을 넣어 가벼운 일러스트 썸네일(약 10KB)을 자동 생성합니다.
   */
  generateDefaultKnittingThumb(title = "뜨개질 도안", subtitle = "핸드메이드 노트", themeIndex = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 280;
    const ctx = canvas.getContext("2d");

    const palettes = [
      { bg1: "#fbeae4", bg2: "#f5d4c8", accent: "#c86446", sub: "#7a4434" },
      { bg1: "#e6f0e9", bg2: "#cfe2d5", accent: "#5c7c67", sub: "#3b5243" },
      { bg1: "#fbf2e1", bg2: "#f3e0bc", accent: "#c78628", sub: "#6e4b16" },
      { bg1: "#eee8f6", bg2: "#dcd0ec", accent: "#785c9e", sub: "#483561" }
    ];
    const pal = palettes[Math.abs(themeIndex) % palettes.length];

    const grad = ctx.createLinearGradient(0, 0, 400, 280);
    grad.addColorStop(0, pal.bg1);
    grad.addColorStop(1, pal.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 280);

    // 장식 털실 원형 패턴
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(330, 65, 58, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(65, 225, 45, 0, Math.PI * 2);
    ctx.stroke();

    // 뜨개 아이콘 배지
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(28, 28, 54, 54, 14);
    ctx.fill();

    ctx.font = "28px sans-serif";
    ctx.fillText("🧶", 41, 65);

    // 카테고리 태그
    ctx.fillStyle = pal.accent;
    ctx.font = "bold 13px Pretendard, sans-serif";
    const safeSub = (subtitle || "뜨개질 도안").slice(0, 22);
    ctx.fillText(safeSub, 30, 128);

    // 도안 제목 (줄바꿈 처리)
    ctx.fillStyle = "#2d2621";
    ctx.font = "bold 22px Pretendard, sans-serif";
    const cleanTitle = (title || "새 뜨개질 도안").trim();
    const line1 = cleanTitle.slice(0, 14);
    const line2 = cleanTitle.slice(14, 28);
    ctx.fillText(line1, 30, 162);
    if (line2) {
      ctx.fillText(line2 + (cleanTitle.length > 28 ? "…" : ""), 30, 192);
    }

    // 하단 안내
    ctx.fillStyle = pal.sub;
    ctx.font = "600 12px Pretendard, sans-serif";
    ctx.fillText("코코아뜰리에 · 최적화된 미리보기", 30, 246);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    const optimizedKB = Math.max(1, Math.round((dataUrl.length * 3) / 4 / 1024));
    return {
      dataUrl,
      optimizedKB,
      originalKB: null
    };
  },

  /**
   * 단일 파일(PDF, JPG, PNG)에서 텍스트를 읽어옵니다.
   */
  async extractTextFromSingleFile(file, onProgress) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || ext === "pdf";

    if (isPdf) {
      return await this.extractTextFromPdf(file, onProgress);
    } else {
      return await this.extractTextFromImage(file, onProgress);
    }
  },

  /**
   * PDF에서 페이지 순서대로 텍스트 추출
   * - 디지털 텍스트가 포함된 PDF는 즉시 정밀 추출
   * - 스캔된 이미지형 PDF 페이지는 자동으로 Canvas 렌더링 후 Tesseract OCR 수행
   */
  async extractTextFromPdf(file, onProgress) {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js 라이브러리를 불러올 수 없습니다.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress(`PDF 페이지 읽는 중 (${pageNum} / ${totalPages} 페이지)`, Math.round(((pageNum - 1) / totalPages) * 100));
      }
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Y좌표 변화에 따라 줄바꿈을 보존하여 텍스트 조합
      let lastY = null;
      let pageStr = "";
      for (const item of textContent.items) {
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
          pageStr += "\n";
        } else if (pageStr && !pageStr.endsWith("\n") && !pageStr.endsWith(" ")) {
          pageStr += " ";
        }
        pageStr += item.str;
        if (y !== null) lastY = y;
      }

      const trimmed = pageStr.trim();
      if (trimmed.length >= 8) {
        pageTexts.push(trimmed);
      } else {
        // 텍스트 레이어가 없는 스캔 PDF인 경우 -> 이미지를 렌더링해 OCR 수행
        if (onProgress) {
          onProgress(`스캔된 PDF ${pageNum}페이지 이미지 문자 인식(OCR) 중...`, Math.round(((pageNum - 0.5) / totalPages) * 100));
        }
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        const ocrText = await this.runTesseractOnSource(canvas, (pct) => {
          if (onProgress) {
            onProgress(`PDF ${pageNum}페이지 OCR 진행 중 (${pct}%)`, pct);
          }
        });
        if (ocrText.trim()) {
          pageTexts.push(ocrText.trim());
        }
      }
    }

    return pageTexts.join("\n");
  },

  /**
   * JPG / PNG 이미지 파일에서 한국어+영어 OCR로 도안 텍스트 추출
   */
  async extractTextFromImage(file, onProgress) {
    return await this.runTesseractOnSource(file, (pct) => {
      if (onProgress) {
        onProgress(`이미지 텍스트 인식(OCR) 중... (${pct}%)`, pct);
      }
    });
  },

  async runTesseractOnSource(source, onPct) {
    if (!window.Tesseract) {
      throw new Error("Tesseract OCR 라이브러리를 불러올 수 없습니다.");
    }
    const result = await window.Tesseract.recognize(source, "kor+eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number" && onPct) {
          onPct(Math.round(m.progress * 100));
        }
      }
    });
    return (result && result.data && result.data.text) ? result.data.text : "";
  },

  /**
   * 읽어온 원시 텍스트를 뜨개질 도안 체크리스트 형식에 맞게 깔끔하게 정돈합니다.
   * (요구사항 10: 텍스트로 읽어와서 형식에 맞춰 앱에서 바꿔줘야 해)
   */
  formatRawTextToPatternLines(rawText, splitByRowKeywords = true) {
    if (!rawText) return [];

    let text = rawText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // 흔한 OCR 노이즈 정리
      .replace(/[|¦]/g, " ")
      .replace(/[ \t]{2,}/g, " ");

    if (splitByRowKeywords) {
      // 한 줄 안에 "1단 ... 2단 ... 3단" 혹은 "Row 1 ... Row 2"가 이어져 있으면 줄바꿈 분리
      text = text.replace(/([^\n])\s+(\d+\s*(?:단|줄|행|코)\s*[:：.-])/g, "$1\n$2");
      text = text.replace(/([^\n])\s+((?:Row|Rnd|Round)\s*\d+\s*[:：.-]?)/gi, "$1\n$2");
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines;
  }
};

window.OcrHelper = OcrHelper;
