"use client";

import React, { useState, useRef, useMemo } from "react";
import {
  Microscope,
  UploadCloud,
  Table,
  Printer,
  Sparkles,
  FileText,
  X,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Search,
  Pencil,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { translations, Language } from "./translations";

// Definitions for steps in workflow
type WorkflowStep = "upload" | "review" | "print";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  previewUrl: string;
  type: string;
  sampleId: string;       // AI recognized or user edited sample ID
  run: "Run 1" | "Run 2"; // selected measurement run
  confidence: number;     // AI recognition confidence
  status: "Recognized" | "Edited" | "Scanning" | "Error";
  file?: File;            // Keep original File reference for API uploading
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("upload");
  const [lang, setLang] = useState<Language>("vi"); // Language state (EN/VI)
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string>(""); // Selected card focused reference
  const [zoomedFile, setZoomedFile] = useState<UploadedFile | null>(null); // For detail zoom overlay modal
  const [scale, setScale] = useState(1); // A4 preview zoom scale for mobile layout
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Retrieve localization strings based on selected language state
  const t = useMemo(() => translations[lang], [lang]);

  // Initial file list (starts empty for production use)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Auto-grouping algorithm: aggregate images by Sample ID (trimmed, case-insensitive)
  const groupedSamples = useMemo(() => {
    const groups: { [key: string]: UploadedFile[] } = {};
    uploadedFiles.forEach((file) => {
      // Only group fully processed files
      if (file.status === "Scanning" || file.status === "Error") return;
      const key = file.sampleId.trim().toLowerCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(file);
    });
    return groups;
  }, [uploadedFiles]);

  // Localized Anomalies Detection Logic
  const anomalies = useMemo(() => {
    const warnings: string[] = [];
    Object.keys(groupedSamples).forEach((key) => {
      const files = groupedSamples[key];
      const sampleIdLabel = files[0].sampleId; // Display name
      
      const missingRunLabel = files[0].run === "Run 1" ? t.step2.run2 : t.step2.run1;

      if (files.length === 1) {
        if (lang === "vi") {
          warnings.push(
            `Mã số mẫu "${sampleIdLabel}" bị thiếu một lần đo. Chỉ có ${missingRunLabel} trong cơ sở dữ liệu.`
          );
        } else {
          warnings.push(
            `Sample ID "${sampleIdLabel}" is missing a run. Only ${files[0].run} is present in the database.`
          );
        }
      } else {
        const runs = files.map((f) => f.run);
        const run1Count = runs.filter((r) => r === "Run 1").length;
        const run2Count = runs.filter((r) => r === "Run 2").length;

        if (run1Count > 1 || run2Count > 1) {
          if (lang === "vi") {
            warnings.push(
              `Mã số mẫu "${sampleIdLabel}" chứa các lần đo trùng lặp (nhiều tệp đang cùng ánh xạ tới một Lần đo).`
            );
          } else {
            warnings.push(
              `Sample ID "${sampleIdLabel}" contains duplicate runs (multiple files are mapped to the same Run number).`
            );
          }
        }
        if (files.length > 2) {
          if (lang === "vi") {
            warnings.push(
              `Mã số mẫu "${sampleIdLabel}" có ${files.length} lần đo (tiêu chuẩn lâm sàng cho phép tối đa 2 lần đo cho mỗi tờ báo cáo).`
            );
          } else {
            warnings.push(
              `Sample ID "${sampleIdLabel}" has ${files.length} runs (clinical standards allow max. 2 runs per specimen sheet).`
            );
          }
        }
      }
    });
    return warnings;
  }, [groupedSamples, lang, t]);

  // Calculate A4 preview zoom scale dynamically to fit screen width (mobile zoom)
  React.useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.getBoundingClientRect().width;
        const targetWidth = 794; // 210mm in pixels at standard 96dpi is ~794px
        // If container is smaller than A4 page width, scale it down to fit
        if (containerWidth < targetWidth) {
          setScale(containerWidth / targetWidth);
        } else {
          setScale(1);
        }
      }
    };

    // Run on mount, resize, and when currentStep changes
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentStep]);

  // Handle drag and drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const previewUrl = URL.createObjectURL(file);
      const generatedNumber = 3881 + uploadedFiles.length + i;
      
      newFiles.push({
        id: `file-${Date.now()}-${i}`,
        name: file.name,
        size: `${sizeMB} MB`,
        previewUrl,
        type: file.type,
        sampleId: `${generatedNumber}/16`,
        run: "Run 1",
        confidence: 0,
        status: "Recognized",
        file, // Keep the file reference for API uploading
      });
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove && !fileToRemove.id.startsWith("mock-")) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  // State modification logic for Step 2 Cards
  const handleSampleIdChange = (id: string, val: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, sampleId: val, status: "Edited" } : f
      )
    );
  };

  const handleRunToggle = (id: string, val: "Run 1" | "Run 2") => {
    setUploadedFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, run: val, status: "Edited" } : f
      )
    );
  };

  // Start Real AI Gemini Recognition loop
  const handleStartRecognition = async () => {
    // Transition to Step 2 view
    setCurrentStep("review");

    // Map files to "Scanning" status
    setUploadedFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: "Scanning",
      }))
    );

    // Call API for each file in parallel
    uploadedFiles.forEach((file) => {
      analyzeFile(file);
    });
  };

  // Asynchronous fetch calling the FastAPI endpoint (includes dynamic ?lang parameter)
  const analyzeFile = async (file: UploadedFile) => {
    try {
      let fileToUpload: File;

      if (file.file) {
        fileToUpload = file.file;
      } else {
        // For mock files, fetch the asset blob and construct a File object
        const response = await fetch(file.previewUrl);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: file.type || "image/jpeg" });
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);

      // Call API (Proxied automatically with lang parameter appended)
      const res = await fetch(`/api/analyze-image?lang=${lang}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Analysis server error");
      }

      // Successful analysis structure: { sample_id, measurement_run, confidence }
      const data = await res.json();
      
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? {
                ...f,
                sampleId: data.sample_id,
                run: data.measurement_run === 2 ? "Run 2" : "Run 1",
                confidence: Math.round(data.confidence * 100),
                previewUrl: data.enhanced_image, // Replace original with enhanced base64 image!
                status: "Recognized",
              }
            : f
        )
      );
    } catch (err) {
      console.error(`Gemini OCR failed for file ${file.name}:`, err);
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? {
                ...f,
                status: "Error",
              }
            : f
        )
      );
    }
  };

  // Format current date for Clinical Report Page
  const currentDate = useMemo(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  // Print execution handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      
      {/* Print CSS optimization style tag */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          header, aside, footer, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .print-area {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-wrapper {
            height: auto !important;
            width: auto !important;
            display: block !important;
            transform: none !important;
          }
          .print-page {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 20mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            page-break-after: always !important;
            display: flex !important;
            flex-direction: column !important;
            transform: none !important;
            transform-origin: initial !important;
          }
        }
      `}} />

      {/* 1. TOP BAR */}
      <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-6 bg-white border-b border-slate-200 shadow-sm no-print">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 text-blue-900">
            <Microscope className="w-5 h-5 stroke-[2.2]" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-blue-900">
            LabPrint
          </span>
          <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-500 uppercase tracking-wider">
            Clinical Suite
          </span>
        </div>

        {/* Top Right Layout Options */}
        <div className="flex items-center gap-3">
          
          {/* Language Switcher EN/VI */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setLang("en")}
              className={`px-2 py-1 rounded text-[10px] font-extrabold transition-all duration-200 ${
                lang === "en" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("vi")}
              className={`px-2 py-1 rounded text-[10px] font-extrabold transition-all duration-200 ${
                lang === "vi" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              VI
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200"></div>

          {/* User profile avatar */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end hidden md:block">
              <span className="text-xs font-bold text-slate-800">{t.common.avatarLabel}</span>
              <span className="text-[10px] text-slate-500 font-mono">ID: CLIN-7890</span>
            </div>
            <div className="relative group cursor-pointer">
              <div className="w-10 h-10 overflow-hidden rounded-full ring-2 ring-blue-100 transition-all duration-300 group-hover:ring-blue-300 bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                DL
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
          </div>

        </div>
      </header>

      {/* BODY MAIN CONTAINER */}
      <div className="flex flex-1">
        
        {/* 2. SIDEBAR (Workflow Steps) */}
        <aside className="w-64 shrink-0 bg-white border-r border-slate-200 p-6 flex flex-col justify-between hidden md:flex no-print">
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-blue-950 mb-3">
                {t.sidebar.workflowSteps}
              </h2>
              <nav className="space-y-1.5">
                {/* Step 1: Upload & Preview */}
                <button
                  onClick={() => setCurrentStep("upload")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    currentStep === "upload"
                      ? "bg-blue-50 text-blue-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <UploadCloud className={`w-4 h-4 ${currentStep === "upload" ? "text-blue-900" : "text-slate-400"}`} />
                  <span>{t.sidebar.upload}</span>
                </button>

                {/* Step 2: Review & Edit */}
                <button
                  onClick={() => setCurrentStep("review")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    currentStep === "review"
                      ? "bg-blue-50 text-blue-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Table className={`w-4 h-4 ${currentStep === "review" ? "text-blue-900" : "text-slate-400"}`} />
                  <span>{t.sidebar.review}</span>
                </button>

                {/* Step 3: Grouping & Print */}
                <button
                  onClick={() => setCurrentStep("print")}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    currentStep === "print"
                      ? "bg-blue-50 text-blue-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Printer className={`w-4 h-4 ${currentStep === "print" ? "text-blue-900" : "text-slate-400"}`} />
                  <span>{t.sidebar.print}</span>
                </button>
              </nav>
            </div>
            
            {/* Quick stats panel */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                <span>{t.sidebar.sessionStats}</span>
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.sidebar.totalSamples}</span>
                  <span className="font-semibold text-slate-700">{uploadedFiles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t.sidebar.totalGroups}</span>
                  <span className="font-semibold text-blue-600">{Object.keys(groupedSamples).length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            System Node: LN-082
          </div>
        </aside>

        {/* 4. MAIN CONTENT AREA */}
        <main className="flex-1 bg-slate-50 p-6 md:p-10 flex flex-col justify-between overflow-x-hidden">
          
          {/* STEP 1: UPLOAD SAMPLE DATA */}
          {currentStep === "upload" && (
            <div className="max-w-5xl w-full mx-auto space-y-8 animate-fadeIn no-print">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {t.step1.title}
                </h1>
                <p className="text-sm text-slate-500 mt-1.5">
                  {t.step1.subtitle}
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group flex flex-col items-center justify-center min-h-[220px] p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 bg-white shadow-sm hover:shadow-md ${
                  isDragOver
                    ? "border-blue-500 bg-blue-50/50 scale-[0.99]"
                    : "border-slate-300 hover:border-blue-400"
                }`}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*"
                />
                
                <div className="p-4 rounded-full bg-blue-50 text-blue-600 transition-all duration-300 group-hover:scale-110 mb-4">
                  <UploadCloud className="w-8 h-8 stroke-[1.8]" />
                </div>
                
                <p className="text-sm font-semibold text-slate-700">
                  {t.step1.clickUpload}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t.step1.fileFormats}
                </p>
              </div>

              {/* Recent Uploads Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    {t.step1.recentUploads}
                  </h3>
                  
                  {uploadedFiles.length > 0 && (
                    <button
                      onClick={handleStartRecognition}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white rounded-xl bg-blue-900 hover:bg-blue-800 transition-colors shadow-sm active:scale-95"
                    >
                      <Sparkles className="w-4 h-4 fill-white/20" />
                      <span>{t.step1.startAI}</span>
                    </button>
                  )}
                </div>

                {uploadedFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
                    <FileText className="w-10 h-10 text-slate-300 mb-3" />
                    <p className="text-sm font-semibold">{t.step1.noFiles}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="group relative flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(file.id);
                          }}
                          className="absolute top-2 right-2 z-10 p-1.5 bg-black/40 hover:bg-rose-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>

                        <div className="relative aspect-video w-full overflow-hidden bg-slate-100 border-b border-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file.previewUrl}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="p-3.5">
                          <span className="font-mono text-xs font-semibold text-slate-700 truncate block">
                            {file.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium mt-1">
                            {file.size}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW & EDIT RECOGNIZED DATA */}
          {currentStep === "review" && (
            <div className="max-w-6xl w-full mx-auto space-y-8 animate-fadeIn no-print">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {t.step2.title}
                </h1>
                <p className="text-sm text-slate-500 mt-1.5">
                  {t.step2.subtitle}
                </p>
              </div>

              {/* Data Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {uploadedFiles.map((file) => {
                  const isFocused = selectedCardId === file.id;

                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedCardId(file.id)}
                      className={`group relative flex flex-col bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md cursor-pointer ${
                        isFocused
                          ? "border-l-4 border-l-blue-900 border-slate-300 scale-[1.01]"
                          : "border-slate-200"
                      }`}
                    >
                      {/* Top Image Container */}
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-100 border-b border-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={file.previewUrl}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <div className={`absolute inset-0 bg-slate-950/20 flex items-center justify-center transition-opacity duration-205 ${
                          file.id !== "mock-1" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedFile(file);
                            }}
                            className="w-10 h-10 bg-white hover:bg-slate-50 text-blue-900 rounded-lg flex items-center justify-center shadow-md active:scale-90 transition-transform"
                          >
                            <Search className="w-5 h-5 stroke-[2.2]" />
                          </button>
                        </div>
                      </div>

                      {/* Content Panel */}
                      <div className="relative p-5 space-y-4 min-h-[220px]">
                        
                        {/* Scanning Loader Overlay */}
                        {file.status === "Scanning" && (
                          <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center space-y-2 rounded-b-xl">
                            <RefreshCw className="w-7 h-7 text-blue-900 animate-spin" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest animate-pulse">
                              {t.step2.extracting}
                            </span>
                          </div>
                        )}

                        {/* Status Row */}
                        <div className="flex items-center justify-between">
                          {/* Badge Dynamic Rendering */}
                          {file.status === "Recognized" && (
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {t.step2.recognized}
                            </span>
                          )}
                          {file.status === "Edited" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-100">
                              <Pencil className="w-3 h-3" />
                              {t.step2.edited}
                            </span>
                          )}
                          {file.status === "Scanning" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-amber-50 text-amber-700 border border-amber-100">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              {t.step2.scanning}
                            </span>
                          )}
                          {file.status === "Error" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-700 border border-rose-100">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {t.step2.ocrError}
                            </span>
                          )}

                          <span className="font-mono text-xs text-slate-400">
                            Conf: {file.confidence}%
                          </span>
                        </div>

                        {/* Sample ID Input Field */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {t.step2.sampleId}
                          </label>
                          <input
                            type="text"
                            value={file.sampleId}
                            disabled={file.status === "Scanning"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleSampleIdChange(file.id, e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-blue-900 focus:border-blue-900 transition-shadow disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </div>

                        {/* Measurement Run Selector */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {t.step2.measurementRun}
                          </label>
                          <div className="bg-slate-100 p-0.5 rounded-lg flex gap-0.5 border border-slate-200/50">
                            <button
                              type="button"
                              disabled={file.status === "Scanning"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunToggle(file.id, "Run 1");
                              }}
                              className={`flex-1 py-1 rounded-md text-xs transition-all duration-200 ${
                                file.run === "Run 1"
                                  ? "bg-white shadow-sm font-bold text-slate-900"
                                  : "text-slate-500 hover:text-slate-900"
                              } disabled:opacity-50`}
                            >
                              {t.step2.run1}
                            </button>
                            <button
                              type="button"
                              disabled={file.status === "Scanning"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunToggle(file.id, "Run 2");
                              }}
                              className={`flex-1 py-1 rounded-md text-xs transition-all duration-200 ${
                                file.run === "Run 2"
                                  ? "bg-white shadow-sm font-bold text-slate-900"
                                  : "text-slate-500 hover:text-slate-900"
                              } disabled:opacity-50`}
                            >
                              {t.step2.run2}
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Action Area */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setCurrentStep("print")}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold tracking-wider text-white rounded-xl bg-blue-900 hover:bg-blue-800 transition-all shadow-md active:scale-[0.98]"
                >
                  <span>{t.step2.btnProceed}</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: FINAL REVIEW & GROUPING */}
          {currentStep === "print" && (
            <div className="max-w-5xl w-full mx-auto space-y-8 animate-fadeIn">
              
              {/* Header Title Block */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5 no-print">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {t.step3.title}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1.5">
                    {t.step3.subtitle}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentStep("review")}
                    className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95"
                  >
                    {t.step3.btnBack}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-900 hover:bg-blue-800 rounded-xl transition-all shadow-sm active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{t.step3.btnPrint}</span>
                  </button>
                </div>
              </div>

              {/* Anomalies Warnings Panel */}
              {anomalies.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-2.5 shadow-sm no-print">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>{t.step3.warningHeader} ({anomalies.length})</span>
                  </div>
                  <ul className="text-xs list-disc pl-5 space-y-1 text-amber-800/90 font-medium">
                    {anomalies.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Virtual A4 Previews Wrapper */}
              <div ref={containerRef} className="space-y-12 print-area w-full flex flex-col items-center">
                {Object.keys(groupedSamples).map((sampleKey, groupIdx) => {
                  const groupFiles = groupedSamples[sampleKey];
                  const sampleDisplayId = groupFiles[0].sampleId;
                  
                  const run1Specimen = groupFiles.find(f => f.run === "Run 1");
                  const run2Specimen = groupFiles.find(f => f.run === "Run 2");

                  return (
                    <div key={sampleKey} className="space-y-3">
                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 uppercase tracking-widest px-2 no-print">
                        <span>{t.step3.previewHeader}</span>
                        <span>{t.step3.pageText} {groupIdx + 1} {t.step3.ofText} {Object.keys(groupedSamples).length}</span>
                      </div>

                      {/* Zooming scaling container wrapper for mobile responsiveness, preserving A4 aspect ratio */}
                      <div 
                        className="print-wrapper w-full flex justify-center"
                        style={scale < 1 ? { height: `${1123 * scale}px` } : {}}
                      >
                        {/* PORTRAIT A4 SIMULATED PAGE CONTAINER */}
                        <div 
                          className="print-page w-[210mm] min-h-[297mm] bg-white border border-slate-200 shadow-xl rounded-lg p-[18mm] flex flex-col justify-between transition-all duration-300 shrink-0"
                          style={{
                            transform: scale < 1 ? `scale(${scale})` : "none",
                            transformOrigin: "top center",
                          }}
                        >
                          <div>
                            
                            {/* Report Header block */}
                            <div className="flex items-start justify-between border-b border-slate-300 pb-4 mb-6">
                              <div>
                                <h2 className="text-xl font-black text-blue-900 tracking-tight leading-none uppercase">
                                  {t.step3.a4Title}
                                </h2>
                                <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase block mt-1">
                                  {t.step3.a4Sub}
                                </span>
                              </div>
                              <div className="text-right font-mono text-xs text-slate-600 space-y-0.5">
                                <div>Date: <span className="font-semibold text-slate-800">{currentDate}</span></div>
                                <div>Sample ID: <span className="font-bold text-blue-900">{sampleDisplayId}</span></div>
                              </div>
                            </div>

                            {/* Two-Column Image Grid */}
                            <div className="grid grid-cols-2 gap-6">
                              
                              {/* Run 1 Col */}
                              <div className="space-y-3">
                                <div className="aspect-[4/3] w-full rounded border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                                  {run1Specimen ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={run1Specimen.previewUrl}
                                      alt={`${sampleDisplayId} Run 1`}
                                      className="w-full h-full object-cover filter grayscale"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center p-4 text-center text-slate-300 font-mono text-[10px]">
                                      <AlertCircle className="w-6 h-6 mb-1 text-slate-200" />
                                      <span>{t.step3.missingRunText}</span>
                                    </div>
                                  )}
                                </div>
                                <span className="block text-center font-mono text-[10px] text-slate-500 font-medium">
                                  {t.step3.fig1} {run1Specimen ? `(${lang === "vi" ? "Lần 1" : "Run 1"})` : ""}
                                </span>
                              </div>

                              {/* Run 2 Col */}
                              <div className="space-y-3">
                                <div className="aspect-[4/3] w-full rounded border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                                  {run2Specimen ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={run2Specimen.previewUrl}
                                      alt={`${sampleDisplayId} Run 2`}
                                      className="w-full h-full object-cover filter grayscale"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center p-4 text-center text-slate-300 font-mono text-[10px]">
                                      <AlertCircle className="w-6 h-6 mb-1 text-slate-200" />
                                      <span>{t.step3.missingRunText}</span>
                                    </div>
                                  )}
                                </div>
                                <span className="block text-center font-mono text-[10px] text-slate-500 font-medium">
                                  {t.step3.fig2} {run2Specimen ? `(${lang === "vi" ? "Lần 2" : "Run 2"})` : ""}
                                </span>
                              </div>

                            </div>

                          </div>

                          {/* A4 Report Footer details */}
                          <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[9px] font-mono text-slate-400">
                            <span>SYSTEM INTEGRITY: VERIFIED</span>
                            <span>LABPRINT CLINICAL OUTPUT SUITE</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* 3. FOOTER */}
          <footer className="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 no-print">
            <div className="text-center sm:text-left">
              <span className="font-semibold text-slate-600">LabPrint</span> © 2024 LabPrint Systems. Clinical Precision Division.
            </div>
            <div className="flex items-center gap-4 sm:gap-6 text-slate-500 font-semibold">
              <a href="#" className="hover:text-blue-900 transition-colors">
                {t.common.sop}
              </a>
              <span className="text-slate-300">|</span>
              <a href="#" className="hover:text-blue-900 transition-colors">
                {t.common.privacy}
              </a>
              <span className="text-slate-300">|</span>
              <a href="#" className="hover:text-blue-900 transition-colors flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {t.common.systemStatus}
              </a>
            </div>
          </footer>
        </main>
      </div>

      {/* DETAIL ZOOM OVERLAY MODAL */}
      {zoomedFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setZoomedFile(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomedFile(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-900/10 hover:bg-rose-600 hover:text-white rounded-full text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="relative aspect-[4/3] w-full bg-slate-900 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoomedFile.previewUrl}
                alt={zoomedFile.name}
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 border border-emerald-500/20 pointer-events-none grid grid-cols-6 grid-rows-6">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div key={i} className="border-t border-l border-emerald-500/10 font-mono text-[9px] text-emerald-500/40 p-0.5">
                    {i % 6},{Math.floor(i / 6)}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 flex items-center justify-between font-mono text-xs text-slate-500 bg-slate-50 rounded-b-xl mt-2">
              <span>{t.step2.specimenLabel} <b className="text-slate-800">{zoomedFile.name}</b></span>
              <span>{t.step2.calibrationLabel} <b className="text-slate-800">75x25mm Grid</b></span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
