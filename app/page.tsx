"use client";

import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type TemplatePage = {
  pageNumber: number;
  imageUrl: string;
  width: number;
  height: number;
};

type StageItemType = "mic" | "amp" | "person" | "drums";

type StageItem = {
  id: string;
  type: StageItemType;
  label: string;
  x: number;
  y: number;
};

type EntryField = {
  id: string;
  label: string;
  value: string;
};

type TemplateField = EntryField & {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const stageItemPresets: Array<{
  type: StageItemType;
  label: string;
  mark: string;
  className: string;
}> = [
  { type: "mic", label: "マイク", mark: "○→", className: "stage-item-mic" },
  { type: "amp", label: "アンプ", mark: "AMP", className: "stage-item-amp" },
  { type: "person", label: "人", mark: "人", className: "stage-item-person" },
  { type: "drums", label: "ドラム", mark: "DRM", className: "stage-item-drums" },
];

export default function Home() {
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [templatePages, setTemplatePages] = useState<TemplatePage[]>([]);
  const [useSourceTemplate, setUseSourceTemplate] = useState(false);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [selectedTemplateFieldId, setSelectedTemplateFieldId] = useState<string | null>(null);
  const [activeTemplatePage, setActiveTemplatePage] = useState(1);
  const [stageItems, setStageItems] = useState<StageItem[]>([]);
  const [selectedStageItemId, setSelectedStageItemId] = useState<string | null>(null);
  const [status, setStatus] = useState("PDFをアップロードしてください。");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const stageEditorRef = useRef<HTMLDivElement>(null);

  const hasExtractedText = rawText.trim().length > 0;
  const selectedTemplateField =
    templateFields.find((field) => field.id === selectedTemplateFieldId) ?? null;
  const selectedStageItem =
    stageItems.find((item) => item.id === selectedStageItemId) ?? null;

  useEffect(() => {
    function handleStageDeleteKey(event: KeyboardEvent) {
      if (!selectedStageItemId) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTyping) return;

      event.preventDefault();
      setStageItems((current) => current.filter((item) => item.id !== selectedStageItemId));
      setSelectedStageItemId(null);
    }

    window.addEventListener("keydown", handleStageDeleteKey);
    return () => window.removeEventListener("keydown", handleStageDeleteKey);
  }, [selectedStageItemId]);

  function updateTemplateFieldValue(id: string, value: string) {
    setTemplateFields((current) =>
      current.map((field) => (field.id === id ? { ...field, value } : field)),
    );
  }

  function updateTemplateFieldMeta(id: string, updates: Partial<TemplateField>) {
    setTemplateFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...updates } : field)),
    );
  }

  function addTemplateField() {
    if (!templatePages.length) {
      setStatus("先にPA表PDFをアップロードしてください。");
      return;
    }

    const id = crypto.randomUUID();
    const fieldsOnPage = templateFields.filter(
      (field) => field.pageNumber === activeTemplatePage,
    ).length;

    setTemplateFields((current) => [
      ...current,
      {
        id,
        label: `記入欄${current.length + 1}`,
        value: "",
        pageNumber: activeTemplatePage,
        x: 52,
        y: 12 + (fieldsOnPage % 9) * 8,
        width: 36,
        height: 5.5,
      },
    ]);
    setSelectedTemplateFieldId(id);
    setStatus("元PDF上に記入欄を追加しました。位置とサイズを調整してください。");
  }

  function removeTemplateField(id: string) {
    setTemplateFields((current) => current.filter((field) => field.id !== id));
    setSelectedTemplateFieldId((current) => (current === id ? null : current));
  }

  function clearTemplateFields() {
    setTemplateFields([]);
    setSelectedTemplateFieldId(null);
  }

  function addStageItem(type: StageItemType) {
    const preset = getStagePreset(type);
    const typeCount = stageItems.filter((item) => item.type === type).length + 1;
    const total = stageItems.length;
    const id = crypto.randomUUID();
    const isDrums = type === "drums";

    setStageItems((current) => [
      ...current,
      {
        id,
        type,
        label: `${preset.label}${typeCount}`,
        x: isDrums ? 50 : 20 + (total % 5) * 13,
        y: isDrums ? 18 : 24 + (Math.floor(total / 5) % 4) * 16,
      },
    ]);
    setSelectedStageItemId(id);
  }

  function removeSelectedStageItem() {
    if (!selectedStageItemId) return;

    removeStageItem(selectedStageItemId);
  }

  function removeStageItem(itemId: string) {
    setStageItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedStageItemId((current) => (current === itemId ? null : current));
  }

  function clearStageItems() {
    setStageItems([]);
    setSelectedStageItemId(null);
  }

  function updateStageItemLabel(itemId: string, label: string) {
    setStageItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, label } : item)),
    );
  }

  function handleStagePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    itemId: string,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedStageItemId(itemId);
    updateStageItemPosition(itemId, event.clientX, event.clientY);
  }

  function handleStagePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
    itemId: string,
  ) {
    if (event.buttons !== 1) return;
    updateStageItemPosition(itemId, event.clientX, event.clientY);
  }

  function updateStageItemPosition(itemId: string, clientX: number, clientY: number) {
    const rect = stageEditorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = clamp(((clientX - rect.left) / rect.width) * 100, 5, 95);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 8, 92);

    setStageItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, x, y } : item)),
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("PDFファイルを選択してください。");
      return;
    }

    setFileName(file.name);
    setIsExtracting(true);
    setStatus("PDFからテキストを読み取っています...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { text, pages } = await extractPdfContent(arrayBuffer);
      setRawText(text);
      setTemplatePages(pages);
      setUseSourceTemplate(pages.length > 0);
      setTemplateFields([]);
      setSelectedTemplateFieldId(null);
      setActiveTemplatePage(pages[0]?.pageNumber ?? 1);

      setStatus(
        text.trim()
          ? `${file.name} を読み込みました。元PDF上に必要な記入欄を追加してください。`
          : "テキストを抽出できませんでした。画像PDFは現在のMVPでは未対応です。",
      );
    } catch (error) {
      console.error(error);
      setStatus("PDFの読み取りに失敗しました。別のPDFで試してください。");
    } finally {
      setIsExtracting(false);
    }
  }

  async function extractPdfContent(arrayBuffer: ArrayBuffer) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    const renderedPages: TemplatePage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = buildPageText(content.items as PdfTextItem[]);
      pages.push(`--- ${pageNumber}ページ ---\n${pageText}`);

      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (context) {
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        renderedPages.push({
          pageNumber,
          imageUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
        });
      }
    }

    return {
      text: pages.join("\n\n").trim(),
      pages: renderedPages,
    };
  }

  function buildPageText(items: PdfTextItem[]) {
    const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];

    items.forEach((item) => {
      const text = item.str?.trim();
      if (!text) return;

      const x = item.transform?.[4] ?? 0;
      const y = item.transform?.[5] ?? 0;
      const line = lines.find((entry) => Math.abs(entry.y - y) < 4);

      if (line) {
        line.parts.push({ x, text });
      } else {
        lines.push({ y, parts: [{ x, text }] });
      }
    });

    return lines
      .sort((a, b) => b.y - a.y)
      .map((line) =>
        line.parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
  }

  async function handleDownloadPdf() {
    if (!sheetRef.current) return;

    setIsExporting(true);
    setStatus("PDFを作成しています...");

    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const canvas = await html2canvas(sheetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const imageWidth = pageWidth - margin * 2;
      const pixelsPerMm = canvas.width / imageWidth;
      const pageCanvasHeight = Math.floor((pageHeight - margin * 2) * pixelsPerMm);
      let sourceY = 0;
      let pageIndex = 0;

      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("Canvas context is unavailable.");

        context.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        if (pageIndex > 0) {
          pdf.addPage();
        }

        const imageData = pageCanvas.toDataURL("image/png");
        const imageHeight = sliceHeight / pixelsPerMm;
        pdf.addImage(imageData, "PNG", margin, margin, imageWidth, imageHeight);

        sourceY += sliceHeight;
        pageIndex += 1;
      }

      pdf.save(`${sanitizeFileName(fileName.replace(/\.pdf$/i, "") || "pa-sheet")}.pdf`);
      setStatus("PDFをダウンロードしました。");
    } catch (error) {
      console.error(error);
      setStatus("PDF出力に失敗しました。入力内容を短くして再度試してください。");
    } finally {
      setIsExporting(false);
    }
  }

  function sanitizeFileName(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "pa-sheet";
  }

  return (
    <main className="app-shell">
      <section className="top-panel" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">PA Sheet PDF Editor MVP</p>
          <h1 id="app-title">Make PA</h1>
          <p className="lead">
            PA表PDFからテキストを読み取り、ブラウザ上で編集して、シンプルなPA表PDFとして再出力します。
          </p>
        </div>

        <label className="upload-box">
          <span className="upload-title">PDFアップロード</span>
          <span className="upload-copy">
            テキストを含むPDFを選択してください。画像PDFのOCRは現在のMVPでは未対応です。
          </span>
          <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
        </label>

        <div className="status-row" aria-live="polite">
          <span className={isExtracting ? "dot loading" : "dot"} />
          <span>{status}</span>
        </div>
      </section>

      <section className="editor-layout" aria-label="PA表編集画面">
        <div className="editor-column">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Extracted Text</p>
              <h2>読み取ったPDF内容</h2>
            </div>
            {fileName ? <span className="file-pill">{fileName}</span> : null}
          </div>

          <textarea
            className="raw-textarea"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="PDFをアップロードすると、抽出テキストがここに表示されます。ここで全文を直接編集できます。"
          />

          {!hasExtractedText ? (
            <p className="helper-text">
              PDFから項目を自動入力する前段階として、まず全文を編集できる状態にしています。
            </p>
          ) : null}
        </div>

        <div className="editor-column">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Overlay Fields</p>
              <h2>元PDF上の記入欄</h2>
            </div>
            <div className="field-actions">
              {templatePages.length > 1 ? (
                <label className="page-select">
                  <span>ページ</span>
                  <select
                    value={activeTemplatePage}
                    onChange={(event) => setActiveTemplatePage(Number(event.target.value))}
                  >
                    {templatePages.map((page) => (
                      <option key={page.pageNumber} value={page.pageNumber}>
                        {page.pageNumber}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                className="secondary-button"
                onClick={addTemplateField}
                disabled={!templatePages.length}
                type="button"
              >
                記入欄を追加
              </button>
              <button
                className="secondary-button"
                onClick={clearTemplateFields}
                disabled={!templateFields.length}
                type="button"
              >
                全消去
              </button>
            </div>
          </div>

          <p className="helper-text neutral">
            自動推定は使いません。元PDFの枠を見ながら、必要な記入欄だけを追加して位置とサイズを調整してください。
          </p>

          <div className="template-field-list" aria-label="元PDF上の記入欄一覧">
            {templateFields.length === 0 ? (
              <div className="empty-state">
                PDFをアップロードしてから「記入欄を追加」を押してください。
              </div>
            ) : null}

            {templateFields.map((field) => (
              <section
                className={`template-field-card ${
                  selectedTemplateFieldId === field.id ? "template-field-card-selected" : ""
                }`}
                key={field.id}
                onClick={() => setSelectedTemplateFieldId(field.id)}
              >
                <div className="template-field-card-head">
                  <input
                    aria-label={`${field.label} ラベル`}
                    value={field.label}
                    onChange={(event) =>
                      updateTemplateFieldMeta(field.id, { label: event.target.value })
                    }
                  />
                  <button
                    className="icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeTemplateField(field.id);
                    }}
                    type="button"
                  >
                    削除
                  </button>
                </div>
                <textarea
                  aria-label={`${field.label} 記入内容`}
                  value={field.value}
                  placeholder="元PDF上に重ねる内容"
                  onChange={(event) => updateTemplateFieldValue(field.id, event.target.value)}
                />
                <div className="template-field-controls">
                  <label>
                    <span>ページ</span>
                    <select
                      value={field.pageNumber}
                      onChange={(event) =>
                        updateTemplateFieldMeta(field.id, {
                          pageNumber: Number(event.target.value),
                        })
                      }
                    >
                      {templatePages.map((page) => (
                        <option key={page.pageNumber} value={page.pageNumber}>
                          {page.pageNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="横"
                    max={95}
                    min={0}
                    onChange={(value) => updateTemplateFieldMeta(field.id, { x: value })}
                    value={field.x}
                  />
                  <NumberField
                    label="縦"
                    max={95}
                    min={0}
                    onChange={(value) => updateTemplateFieldMeta(field.id, { y: value })}
                    value={field.y}
                  />
                  <NumberField
                    label="幅"
                    max={90}
                    min={8}
                    onChange={(value) => updateTemplateFieldMeta(field.id, { width: value })}
                    value={field.width}
                  />
                  <NumberField
                    label="高さ"
                    max={35}
                    min={3}
                    onChange={(value) => updateTemplateFieldMeta(field.id, { height: value })}
                    value={field.height}
                  />
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="stage-layout" aria-label="ステージ図編集画面">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Stage Plot</p>
            <h2>ステージ図</h2>
          </div>
          <div className="stage-actions">
            <button
              className="secondary-button"
              onClick={removeSelectedStageItem}
              disabled={!selectedStageItemId}
              type="button"
            >
              選択を削除
            </button>
            <button
              className="secondary-button"
              onClick={clearStageItems}
              disabled={!stageItems.length}
              type="button"
            >
              全消去
            </button>
          </div>
        </div>

        <div className="stage-toolbar" aria-label="ステージ図パーツ追加">
          {stageItemPresets.map((preset) => (
            <button
              className={`tool-button ${preset.className}`}
              key={preset.type}
              onClick={() => addStageItem(preset.type)}
              type="button"
            >
              <span>{preset.mark}</span>
              {preset.label}
            </button>
          ))}
        </div>

        <div className="stage-edit-panel">
          {selectedStageItem ? (
            <>
              <p>
                選択中: {getStagePreset(selectedStageItem.type).label} / {selectedStageItem.label}
              </p>
              {selectedStageItem.type === "amp" ? (
                <label className="stage-label-field">
                  <span>アンプ名</span>
                  <input
                    value={selectedStageItem.label}
                    placeholder="例: Gt Amp / Ba Amp"
                    onChange={(event) =>
                      updateStageItemLabel(selectedStageItem.id, event.target.value)
                    }
                  />
                </label>
              ) : (
                <span className="stage-hint">
                  アンプを選択すると、ここでアンプ名を変更できます。
                </span>
              )}
            </>
          ) : (
            <p>
              パーツを選択して Backspace / Delete またはパーツ上の × で削除できます。アンプは配置後に名前を編集できます。
            </p>
          )}
        </div>

        <StageBoard
          refElement={stageEditorRef}
          items={stageItems}
          selectedId={selectedStageItemId}
          editable
          onSelect={setSelectedStageItemId}
          onRemove={removeStageItem}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
        />
      </section>

      <section className="preview-layout" aria-label="PDF出力プレビュー">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PDF Preview</p>
            <h2>出力プレビュー</h2>
          </div>
          <div className="preview-actions">
            <label className="template-toggle">
              <input
                type="checkbox"
                checked={templatePages.length > 0 && useSourceTemplate}
                disabled={!templatePages.length}
                onChange={(event) => setUseSourceTemplate(event.target.checked)}
              />
              元PDFテンプレを保持
            </label>
            <button className="primary-button" onClick={handleDownloadPdf} disabled={isExporting}>
              {isExporting ? "PDF作成中..." : "PDFとしてダウンロード"}
            </button>
          </div>
        </div>

        <div className="sheet-frame">
          <div
            className={`pa-sheet ${
              templatePages.length > 0 && useSourceTemplate ? "pa-sheet-source" : ""
            } ${isExporting ? "pa-sheet-exporting" : ""}`}
            ref={sheetRef}
          >
            {templatePages.length > 0 && useSourceTemplate ? (
              <>
                <section className="source-template-pages" aria-label="元PDFテンプレート">
                  {templatePages.map((page) => (
                    <TemplatePdfPage
                      fields={templateFields.filter(
                        (field) => field.pageNumber === page.pageNumber,
                      )}
                      key={page.pageNumber}
                      onFieldChange={updateTemplateFieldValue}
                      onFieldSelect={setSelectedTemplateFieldId}
                      page={page}
                      selectedFieldId={selectedTemplateFieldId}
                    />
                  ))}
                </section>

                {stageItems.length ? (
                  <section className="edit-summary-page">
                  <section className="sheet-block">
                    <h3>ステージ図</h3>
                    <StageBoard items={stageItems} printMode />
                  </section>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="simple-sheet-page">
                <header className="sheet-header">
                  <div>
                    <p>PA表</p>
                    <h2>PDF未アップロード</h2>
                  </div>
                </header>
                <div className="sheet-text">PA表PDFをアップロードすると、元PDFの上に記入欄を配置できます。</div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.5"
        type="number"
        value={Number.isFinite(value) ? value : min}
      />
    </label>
  );
}

function TemplatePdfPage({
  page,
  fields,
  onFieldChange,
  onFieldSelect,
  selectedFieldId,
}: {
  page: TemplatePage;
  fields: TemplateField[];
  onFieldChange: (id: string, value: string) => void;
  onFieldSelect: (id: string) => void;
  selectedFieldId: string | null;
}) {
  return (
    <div className="source-template-page template-page-edit">
      <img
        alt={`元PDFテンプレート ${page.pageNumber}ページ`}
        src={page.imageUrl}
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      />
      {fields.length === 0 ? (
        <div className="template-no-fields">
          このページにはまだ記入欄がありません
        </div>
      ) : null}
      {fields.map((field) => (
        <label
          className={`template-field ${
            selectedFieldId === field.id ? "template-field-selected" : ""
          }`}
          key={field.id}
          onClick={() => onFieldSelect(field.id)}
          style={{
            left: `${field.x}%`,
            top: `${field.y}%`,
            width: `${field.width}%`,
            minHeight: `${field.height}%`,
          }}
        >
          <span>{field.label}</span>
          <textarea
            aria-label={`${field.label} 元PDF上の記入欄`}
            value={field.value}
            placeholder={field.label}
            onFocus={() => onFieldSelect(field.id)}
            onChange={(event) => onFieldChange(field.id, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

function SheetBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="sheet-block">
      <h3>{title}</h3>
      <div className="sheet-text">{value.trim() || "-"}</div>
    </section>
  );
}

function StageBoard({
  refElement,
  items,
  selectedId,
  editable = false,
  printMode = false,
  onSelect,
  onRemove,
  onPointerDown,
  onPointerMove,
}: {
  refElement?: React.RefObject<HTMLDivElement | null>;
  items: StageItem[];
  selectedId?: string | null;
  editable?: boolean;
  printMode?: boolean;
  onSelect?: (id: string | null) => void;
  onRemove?: (id: string) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
}) {
  return (
    <div
      className={`stage-board ${printMode ? "stage-board-print" : ""}`}
      ref={refElement}
      onClick={() => {
        if (editable) onSelect?.(null);
      }}
    >
      <div className="stage-depth-label stage-upstage">奥</div>
      <div className="stage-depth-label stage-downstage">客席側</div>

      {items.length === 0 ? <div className="stage-empty">ステージ図未作成</div> : null}

      {items.map((item) => {
        const preset = getStagePreset(item.type);
        const className = `stage-item ${preset.className} ${
          selectedId === item.id ? "stage-item-selected" : ""
        }`;

        if (!editable) {
          return (
            <div
              className={className}
              key={item.id}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
            >
              <span>{preset.mark}</span>
              <small>{item.label}</small>
            </div>
          );
        }

        return (
          <div
            className={`${className} stage-item-editable`}
            key={item.id}
            role="button"
            tabIndex={0}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(item.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(item.id);
              }
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown?.(event, item.id);
            }}
            onPointerMove={(event) => onPointerMove?.(event, item.id)}
          >
            <button
              className="stage-item-remove"
              onClick={(event) => {
                event.stopPropagation();
                onRemove?.(item.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
              aria-label={`${item.label} を削除`}
            >
              ×
            </button>
            <span>{preset.mark}</span>
            <small>{item.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function getStagePreset(type: StageItemType) {
  return stageItemPresets.find((preset) => preset.type === type) ?? stageItemPresets[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
