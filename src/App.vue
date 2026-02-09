<template>
  <div class="container">
    <div class="header">
      <img class="logo" src="/HQT.png" alt="HQT logo" />
      <h1>PDF Tools</h1>
    </div>

    <!-- OCR 處理 -->
    <div v-if="mode === 'ocr'" class="form-box">
      <h2>1. 報告改名</h2>
      <div class="form-row">
        <label>報告類型：</label>
        <select v-model="reportType">
          <option>食品檢驗報告</option>
          <option>環境檢測報告</option>
        </select>
      </div>
      <div class="form-row">
        <label>PDF 來源資料夾：</label>
        <input v-model="ocrFolder" type="text" />
        <button class="btn-blue" @click="chooseFolder('ocr')">選擇資料夾</button>
      </div>
      <button class="btn-green" @click="runOcr">開始處理</button>
      <div class="progress-box">
        <progress :value="processed" :max="total || 1"></progress>
        <span>{{ processed }} / {{ total }} ({{ progress }}%)</span>
      </div>
    </div>

    <!-- 蓋章處理 -->
    <div v-if="mode === 'stamp'" class="form-box">
      <h2>2. 報告蓋章</h2>
      <div class="offset-row">
        <label for="yOffset">Y 方向位移：</label>
        <input id="yOffset" v-model.number="yOffset" type="number" placeholder="-25" class="y-input"/>
        <label for="yOffset" class="hint-label"> (負值向上，正值向下)</label>
      </div>
      <div class="form-row">
        <label>來源資料夾：</label>
        <input v-model="inputFolder" type="text" />
        <button class="btn-blue" @click="chooseFolder('input')">選擇資料夾</button>
      </div>
      <div class="form-row">
        <label>目的資料夾：</label>
        <input v-model="outputFolder" type="text" />
        <button class="btn-blue" @click="chooseFolder('output')">選擇資料夾</button>
      </div>
      <div class="form-row">
        <label>印章圖片：</label>
        <input v-model="stampImg" type="text" />
        <button class="btn-blue" @click="chooseFile">選擇檔案</button>
      </div>
      <button class="btn-green" @click="runStamp">開始處理</button>
      <div class="progress-box">
        <progress :value="processed" :max="total || 1"></progress>
        <span>{{ processed }} / {{ total }} ({{ progress }}%)</span>
      </div>
    </div>

    <!-- 處理結果 -->
    <div v-if="showResult" class="modal-overlay">
      <div class="modal">
        <h3>處理結果</h3>
        <p><b>成功數量：</b><span>{{ result.success }} 筆</span></p>
        <p class="error-text"><b>失敗數量：</b>{{ result.fail }} 筆</p>
        <button class="btn-green" @click="showResult=false">關閉</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const mode = ref(""); // ocr | stamp
const progress = ref(0);
const total = ref(0);
const processed = ref(0);
const isProcessing = ref(false);

// 顯示結果 Modal
const showResult = ref(false);
const result = ref({ success: 0, fail: 0 });

// OCR 相關設定
const reportType = ref("食品檢驗報告");
const ocrFolder = ref("");

// 蓋章相關設定
const inputFolder = ref("");
const outputFolder = ref("");
const stampImg = ref("");

// 初始化：從 localStorage 讀取
onMounted(() => {
  if (window.electronAPI) {
    window.electronAPI.onMenuAction((_event, action) => {
      if (action === "ocr") mode.value = "ocr";
      else if (action === "stamp") mode.value = "stamp";
    });

    window.electronAPI.onTaskStart((_event, payload) => {
      const expectedJob = mode.value;
      if (expectedJob !== "ocr" && expectedJob !== "stamp") return;
      if (payload?.job !== expectedJob) return;
      total.value = payload.total || 0;
      processed.value = 0;
      progress.value = 0;
      isProcessing.value = true;
    });

    window.electronAPI.onTaskProgress((_event, payload) => {
      const expectedJob = mode.value;
      if (expectedJob !== "ocr" && expectedJob !== "stamp") return;
      if (payload?.job !== expectedJob) return;
      const totalCount = payload.total || total.value || 0;
      const currentCount = payload.current || 0;
      total.value = totalCount;
      processed.value = currentCount;
      progress.value = totalCount > 0 ? Math.floor((currentCount / totalCount) * 100) : 0;
    });

    window.electronAPI.onTaskDone((_event, payload) => {
      const expectedJob = mode.value;
      if (expectedJob !== "ocr" && expectedJob !== "stamp") return;
      if (payload?.job !== expectedJob) return;
      const totalCount = payload.total || total.value || 0;
      total.value = totalCount;
      processed.value = totalCount;
      progress.value = 100;
      isProcessing.value = false;
    });
  }

  ocrFolder.value = localStorage.getItem("ocrFolder") || "";
  inputFolder.value = localStorage.getItem("inputFolder") || "";
  outputFolder.value = localStorage.getItem("outputFolder") || "";
  stampImg.value = localStorage.getItem("stampImg") || "";
});

// OCR 處理
async function runOcr() {
  if (!ocrFolder.value) {
    alert("請先選擇 PDF 來源資料夾");
    return;
  }

  progress.value = 0;
  total.value = 0;
  processed.value = 0;
  isProcessing.value = true;

  try {
    const data = await window.electronAPI.invoke(
      "ocr-rename",
      reportType.value,
      ocrFolder.value
    );

    result.value = { success: data.success || 0, fail: data.fail || 0 };
    showResult.value = true;
  } catch (err) {
    isProcessing.value = false;
    alert("OCR 執行失敗，請確認 ocr_rename.exe 是否存在");
    console.error(err);
  }
}

// 蓋章處理

const yOffset = ref(-25)  // 預設 -25

// 蓋章處理
async function runStamp() {
  if (!inputFolder.value || !outputFolder.value || !stampImg.value) {
    alert("請先選擇輸入資料夾、輸出資料夾與印章圖片");
    return;
  }

  progress.value = 0;
  total.value = 0;
  processed.value = 0;
  isProcessing.value = true;

  try {
    const data = await window.electronAPI.invoke(
      "pdf-stamp",
      inputFolder.value,
      outputFolder.value,
      stampImg.value,
      yOffset.value    // 傳入位移
    );

    result.value = { success: data.success || 0, fail: data.fail || 0 };
    showResult.value = true;
  } catch (err) {
    isProcessing.value = false;
    alert("蓋章處理失敗，請確認 pdf_stamp.exe 是否存在");
    console.error(err);
  }
}


// 選擇資料夾
async function chooseFolder(type) {
  const folder = await window.electronAPI.selectFolder();
  if (!folder) return;

  if (type === "ocr") {
    ocrFolder.value = folder;
    localStorage.setItem("ocrFolder", folder);
  }
  if (type === "input") {
    inputFolder.value = folder;
    localStorage.setItem("inputFolder", folder);
  }
  if (type === "output") {
    outputFolder.value = folder;
    localStorage.setItem("outputFolder", folder);
  }
}

// 選擇檔案
async function chooseFile() {
  const file = await window.electronAPI.selectFile();
  if (!file) return;
  stampImg.value = file;
  localStorage.setItem("stampImg", file);
}
</script>

<style>
/* === 標題樣式 === */
h1 {
  font-family: 'Roboto', sans-serif;
  font-size: 45px;
  font-weight: 900;
  color: #0c497a; /* 標題主色 */
  letter-spacing: 0.5px; /* 字距微調提升可讀性 */
  margin: 20px 0;
}
.header {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  position: fixed;
  top: 12px;
  left: 12px;
  width: 180px;      /* 840 / 2.5 = 336，整數比例縮放 */
  height: auto;     /* 一定要 auto */
  image-rendering: -webkit-optimize-contrast;
}

h2 {
  font-family: 'Roboto', sans-serif;
  font-weight: 600;
  font-size: 26px;
  text-align: center;

  margin-top: -6px;
  margin-bottom: 18px;

  color: #2f6fa3;

  display: inline-block;          /* 讓底線只跟著文字寬度 */
  padding-bottom: 6px;
  border-bottom: 2px solid #cce4fa;
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 10px 10px 10px;
}
.form-box {
  border: 1px solid #ccc;
  background: #f9f9f9;
  padding: 30px;
  margin-top: 10px;
  border-radius: 8px;
  width: 600px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}
.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  white-space: nowrap;
}
.offset-row {
  margin-bottom: 12px;
}
.form-row label {
  flex: 0 0 140px;
}
.form-row input{
  flex: 1;
  margin-right: 10px;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.y-input {
  width: 50px;
  text-align: center;
}

.form-row select {
  flex: unset;
  width: auto;
  height: 25px;
  border: #bbb4b4 solid 1px;
  min-width: 200px;   /* 避免選單過窄造成擠壓 */
}

.btn-blue {
  background-color: #125993;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 6px #00000033;
  transition: all 0.2s ease;
}
.btn-blue:hover {
  background-color: #0056b3;
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.3); /* hover 陰影 */
}
.btn-green {
  background-color: #00763E;
  color: #fff;
  border: none;
  padding: 6px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: block;
  margin: 10px auto 10px auto;
  width: auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}
.btn-green:hover {
  background-color: #1e7e34;
  box-shadow: 0 6px 10px rgba(0, 0, 0, 0.3); /* hover 陰影 */
}

/* === 結果視窗 === */
.modal-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal {
  background: #fff;
  border: 1px solid #333;
  padding: 20px;
  border-radius: 6px;
  text-align: center;
  width: 300px;
}
.modal h3 {
  margin-bottom: 15px;
}
.modal p {
  font-size: 18px;
  margin: 10px 0;
}
.modal .error-text {
  color: red;
  font-weight: bold;
}

progress {
  width: 100%;
  height: 20px;
  -webkit-appearance: none; /* Chromium/Electron 相容 */
  appearance: none;
  border-radius: 10px;
  overflow: hidden; /* 超出範圍時隱藏 */
  background-color: #eee; /* 進度條底色 */
}

progress::-webkit-progress-value {
  background-color: #28a745; 
  border-radius: 10px;
}

progress::-webkit-progress-bar {
  background-color: #eee; 
  border-radius: 10px;
}

.progress-box {
  margin-top: 20px;
  text-align: center;
}

.progress-box span {
  color: #f8304b;
  display: block;        /* 讓百分比文字獨立一行 */
  margin-top: 6px;       /* 與進度條保持間距 */
  font-weight: bold;     /* 強調文字 */
  font-size: 20px;       /* 放大字體 */
}

</style>
