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

type StageItemType = "mic" | "amp" | "person" | "di" | "monitor" | "drums";

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
  { type: "mic", label: "マイク", mark: "MIC", className: "stage-item-mic" },
  { type: "amp", label: "アンプ", mark: "AMP", className: "stage-item-amp" },
  { type: "person", label: "人", mark: "人", className: "stage-item-person" },
  { type: "di", label: "DI", mark: "DI", className: "stage-item-di" },
  { type: "monitor", label: "モニター", mark: "MON", className: "stage-item-monitor" },
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

    setStageItems((current) => [
      ...current,
      {
        id,
        type,
        label: `${preset.label}${typeCount}`,
        x: 20 + (total % 5) * 13,
        y: 24 + (Math.floor(total / 5) % 4) * 16,
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
              <h2>Excel風入力表</h2>
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
                行追加
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
            自動推定は使いません。表に打ち込んだ内容を、元PDF上の対応する記入欄へ重ねて表示します。
          </p>

          <div className="field-table-wrap" aria-label="元PDF上の記入欄一覧">
            {templateFields.length === 0 ? (
              <div className="empty-state">
                PDFをアップロードしてから「行追加」を押してください。
              </div>
            ) : (
              <table className="field-table">
                <thead>
                  <tr>
                    <th>項目名</th>
                    <th>記入内容</th>
                    <th>ページ</th>
                    <th>横</th>
                    <th>縦</th>
                    <th>幅</th>
                    <th>高さ</th>
                    <th>削除</th>
                  </tr>
                </thead>
                <tbody>
                  {templateFields.map((field) => (
                    <tr
                      className={
                        selectedTemplateFieldId === field.id ? "field-row-selected" : undefined
                      }
                      key={field.id}
                      onClick={() => setSelectedTemplateFieldId(field.id)}
                    >
                      <td>
                        <input
                          aria-label={`${field.label} 項目名`}
                          value={field.label}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, { label: event.target.value })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                        />
                      </td>
                      <td>
                        <textarea
                          aria-label={`${field.label} 記入内容`}
                          value={field.value}
                          placeholder="元PDF上に重ねる内容"
                          onChange={(event) =>
                            updateTemplateFieldValue(field.id, event.target.value)
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${field.label} ページ`}
                          value={field.pageNumber}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, {
                              pageNumber: Number(event.target.value),
                            })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                        >
                          {templatePages.map((page) => (
                            <option key={page.pageNumber} value={page.pageNumber}>
                              {page.pageNumber}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`${field.label} 横`}
                          max={95}
                          min={0}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, { x: Number(event.target.value) })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                          step="0.5"
                          type="number"
                          value={Number.isFinite(field.x) ? field.x : 0}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${field.label} 縦`}
                          max={95}
                          min={0}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, { y: Number(event.target.value) })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                          step="0.5"
                          type="number"
                          value={Number.isFinite(field.y) ? field.y : 0}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${field.label} 幅`}
                          max={90}
                          min={8}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, {
                              width: Number(event.target.value),
                            })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                          step="0.5"
                          type="number"
                          value={Number.isFinite(field.width) ? field.width : 8}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${field.label} 高さ`}
                          max={35}
                          min={3}
                          onChange={(event) =>
                            updateTemplateFieldMeta(field.id, {
                              height: Number(event.target.value),
                            })
                          }
                          onFocus={() => setSelectedTemplateFieldId(field.id)}
                          step="0.5"
                          type="number"
                          value={Number.isFinite(field.height) ? field.height : 3}
                        />
                      </td>
                      <td>
                        <button
                          className="icon-button field-delete-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeTemplateField(field.id);
                          }}
                          type="button"
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                      onFieldMetaChange={updateTemplateFieldMeta}
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

function TemplatePdfPage({
  page,
  fields,
  onFieldChange,
  onFieldMetaChange,
  onFieldSelect,
  selectedFieldId,
}: {
  page: TemplatePage;
  fields: TemplateField[];
  onFieldChange: (id: string, value: string) => void;
  onFieldMetaChange: (id: string, updates: Partial<TemplateField>) => void;
  onFieldSelect: (id: string) => void;
  selectedFieldId: string | null;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const fieldPointerActionRef = useRef<{
    fieldId: string;
    mode: "move" | "resize";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    pageWidth: number;
    pageHeight: number;
  } | null>(null);

  function beginFieldPointerAction(
    event: ReactPointerEvent<HTMLButtonElement>,
    field: TemplateField,
    mode: "move" | "resize",
  ) {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onFieldSelect(field.id);
    fieldPointerActionRef.current = {
      fieldId: field.id,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: field.x,
      startY: field.y,
      startWidth: field.width,
      startHeight: field.height,
      pageWidth: rect.width,
      pageHeight: rect.height,
    };
  }

  function handleFieldPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const action = fieldPointerActionRef.current;
    if (!action || action.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const deltaX = ((event.clientX - action.startClientX) / action.pageWidth) * 100;
    const deltaY = ((event.clientY - action.startClientY) / action.pageHeight) * 100;

    if (action.mode === "move") {
      const maxX = Math.max(0, 100 - action.startWidth);
      const maxY = Math.max(0, 100 - action.startHeight);
      onFieldMetaChange(action.fieldId, {
        x: roundPercent(clamp(action.startX + deltaX, 0, maxX)),
        y: roundPercent(clamp(action.startY + deltaY, 0, maxY)),
      });
      return;
    }

    onFieldMetaChange(action.fieldId, {
      width: roundPercent(clamp(action.startWidth + deltaX, 8, 100 - action.startX)),
      height: roundPercent(clamp(action.startHeight + deltaY, 3, 100 - action.startY)),
    });
  }

  function endFieldPointerAction(event: ReactPointerEvent<HTMLButtonElement>) {
    const action = fieldPointerActionRef.current;
    if (!action || action.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    fieldPointerActionRef.current = null;
  }

  return (
    <div className="source-template-page template-page-edit" ref={pageRef}>
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
        <div
          aria-label={`${field.label} 元PDF上の記入欄`}
          className={`template-field ${
            selectedFieldId === field.id ? "template-field-selected" : ""
          }`}
          key={field.id}
          onClick={() => onFieldSelect(field.id)}
          role="group"
          style={{
            left: `${field.x}%`,
            top: `${field.y}%`,
            width: `${field.width}%`,
            height: `${field.height}%`,
          }}
        >
          <span>{field.label}</span>
          <button
            aria-label={`${field.label} を移動`}
            className="template-field-move-handle"
            onPointerCancel={endFieldPointerAction}
            onPointerDown={(event) => beginFieldPointerAction(event, field, "move")}
            onPointerMove={handleFieldPointerMove}
            onPointerUp={endFieldPointerAction}
            title="ドラッグで移動"
            type="button"
          >
            移動
          </button>
          <textarea
            aria-label={`${field.label} 元PDF上の記入欄`}
            value={field.value}
            placeholder={field.label}
            onFocus={() => onFieldSelect(field.id)}
            onChange={(event) => onFieldChange(field.id, event.target.value)}
          />
          <button
            aria-label={`${field.label} をリサイズ`}
            className="template-field-resize-handle"
            onPointerCancel={endFieldPointerAction}
            onPointerDown={(event) => beginFieldPointerAction(event, field, "resize")}
            onPointerMove={handleFieldPointerMove}
            onPointerUp={endFieldPointerAction}
            title="ドラッグでリサイズ"
            type="button"
          />
        </div>
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
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}
