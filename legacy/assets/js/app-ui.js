const PocketTranslate = () => {
      // Legacy external bridge path removed for stability.
      const ENABLE_RUNTIME_TILE_TOOLS = true;
      const LARGE_ROM_STREAM_THRESHOLD = 32 * 1024 * 1024;
      const ROM_STREAM_CHUNK_SIZE = 4 * 1024 * 1024;
      const [romData, setRomData] = useState(null);
      const [originalRomData, setOriginalRomData] = useState(null);
      const [tableData, setTableData] = useState(null);
      const [allTexts, setAllTexts] = useState([]);
      const [filteredTexts, setFilteredTexts] = useState([]);
      const [searchTerm, setSearchTerm] = useState('');
      const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
      const [searchIndexEpoch, setSearchIndexEpoch] = useState(0);
      const [isProcessing, setIsProcessing] = useState(false);
      const [processingText, setProcessingText] = useState('');
      const [progress, setProgress] = useState(0);
      const [processingElapsedSec, setProcessingElapsedSec] = useState(0);
      const [currentPage, setCurrentPage] = useState(1);
      const [error, setError] = useState('');
      const [success, setSuccess] = useState('');
      const [options, setOptions] = useState({
        minLength: 4,
        maxLength: 1024,
        asciiFallback: true,
        usePaddingByte: false,
        strictExtractorMode: false,
        strictSceneProfile: 'default',
        enableDteMteCompression: true,
        compressionStrategy: 'optimal',
        enableTextDecompression: true,
        decompressionMode: 'auto',
        includeCompressedReadOnly: true
      });
      const [systemInfo, setSystemInfo] = useState(null);
      const [modifiedRom, setModifiedRom] = useState(null);
      const [activeTab, setActiveTab] = useState('extraction');
      const [tableContent, setTableContent] = useState('');
      const [sourceLang, setSourceLang] = useState('en');
      const [targetLang, setTargetLang] = useState('id');
      const [translatingId, setTranslatingId] = useState(null);
      const [liveEditMode, setLiveEditMode] = useState(true);
      const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
      const [relativeSearchMode, setRelativeSearchMode] = useState('text');
      const [relativeSearchQuery, setRelativeSearchQuery] = useState('');
      const [relativeSearchHex, setRelativeSearchHex] = useState('');
      const [relativeSearchPadding, setRelativeSearchPadding] = useState('auto');
      const [relativeSearchResults, setRelativeSearchResults] = useState([]);
      const [relativeSearchSelected, setRelativeSearchSelected] = useState(null);
      const [relativeSearchStatus, setRelativeSearchStatus] = useState('');
      const [hexViewStart, setHexViewStart] = useState('0x000000');
      const [hexViewLength, setHexViewLength] = useState(4096);
      const [hexViewColumns, setHexViewColumns] = useState(16);
      const [hexRowLimit, setHexRowLimit] = useState(1024);
      const [hexSearchHex, setHexSearchHex] = useState('');
      const [hexRows, setHexRows] = useState([]);
      const [hexMatches, setHexMatches] = useState([]);
      const [hexStatus, setHexStatus] = useState('Load a ROM to start hex analysis.');
      const [hexWindowStart, setHexWindowStart] = useState(0);
      const [hexWindowEnd, setHexWindowEnd] = useState(0);
      const [hexTotalBytes, setHexTotalBytes] = useState(0);
      const [hexSelectedOffset, setHexSelectedOffset] = useState(null);
      const [hexSelectedValue, setHexSelectedValue] = useState('');
      const [hexMatchLength, setHexMatchLength] = useState(1);
      const [hexNibbleBuffer, setHexNibbleBuffer] = useState('');
      const [hexUndoStack, setHexUndoStack] = useState([]);
      const [hexRedoStack, setHexRedoStack] = useState([]);
      const [hexBookmarks, setHexBookmarks] = useState([]);
      const [hexAsciiMode, setHexAsciiMode] = useState('ascii');
      const [hexCustomTableData, setHexCustomTableData] = useState(null);
      const [hexCustomTableName, setHexCustomTableName] = useState('');
      const [pointerStatus, setPointerStatus] = useState('Select a byte to inspect pointers.');
      const [pointerMatches, setPointerMatches] = useState([]);
      const [pointerLabOffsetInput, setPointerLabOffsetInput] = useState('');
      const [pointerLabTextId, setPointerLabTextId] = useState('');
      const [pointerTargetOffset, setPointerTargetOffset] = useState(null);
      const [pointerGroups, setPointerGroups] = useState([]);
      const [selectedPointerGroupId, setSelectedPointerGroupId] = useState('');
      const [pointerGroupName, setPointerGroupName] = useState('');
      const [pointerGroupNotes, setPointerGroupNotes] = useState('');
      const [pointerRuleTemplateKey, setPointerRuleTemplateKey] = useState('Auto');
      const [pointerRuleOverride, setPointerRuleOverride] = useState({ minPointers: '', minConfidence: '', containerGap: '', coverageThreshold: '' });
      const [pointerGateEnabled, setPointerGateEnabled] = useState(true);
      const [pointerGateMode, setPointerGateMode] = useState('advisory');
      const [pointerValidationReport, setPointerValidationReport] = useState('');
      const [pointerValidationVisible, setPointerValidationVisible] = useState(true);
      const [pointerReplayRunning, setPointerReplayRunning] = useState(false);
      const [selectedTextId, setSelectedTextId] = useState(null);
      const [selectedLiveDraft, setSelectedLiveDraft] = useState('');
      const [sceneSpeakerName, setSceneSpeakerName] = useState('');
      const [containerMapEnabled, setContainerMapEnabled] = useState(false);
      const [segmentConfidenceThreshold, setSegmentConfidenceThreshold] = useState(0);
      const [extractionProfileLock, setExtractionProfileLock] = useState(false);
      const [extractionProfiles, setExtractionProfiles] = useState({});
      const [controlCodeDict, setControlCodeDict] = useState({ aliases: {}, ignoreTokens: [] });
      const [hexPointerHighlights, setHexPointerHighlights] = useState([]);
      const [tileEditorOffsetInput, setTileEditorOffsetInput] = useState('0x000000');
      const [tileEditorCount, setTileEditorCount] = useState(256);
      const [tileEditorColumns, setTileEditorColumns] = useState(16);
      const [tileEditorBppMode, setTileEditorBppMode] = useState('auto');
      const [tileEditorStatus, setTileEditorStatus] = useState('Load a ROM to start tile editor rendering.');
      const [tileEditorData, setTileEditorData] = useState(null);
      const [tileMapData, setTileMapData] = useState(null);
      const [tileEditorMapOffsetInput, setTileEditorMapOffsetInput] = useState('');
      const [tileEditorMapWidth, setTileEditorMapWidth] = useState(32);
      const [tileEditorMapHeight, setTileEditorMapHeight] = useState(30);
      const [tileEditorMapEntrySize, setTileEditorMapEntrySize] = useState(1);
      const [tileEditorMapEndian, setTileEditorMapEndian] = useState('little');
      const [tileEditorSelectedTile, setTileEditorSelectedTile] = useState(0);
      const [tileEditorPaintColor, setTileEditorPaintColor] = useState(1);
      const [tileEditorSelectedMapCell, setTileEditorSelectedMapCell] = useState(null);
      const [tileEditorAutoRefresh, setTileEditorAutoRefresh] = useState(true);
      const [unitTestStatus, setUnitTestStatus] = useState('Unit tests not executed yet.');
      const [unitTestResults, setUnitTestResults] = useState([]);
      const [unitTestSummary, setUnitTestSummary] = useState(null);
      const [previewPipelineStatus, setPreviewPipelineStatus] = useState('Preview pipeline tests not executed yet.');
      const [previewPipelineResults, setPreviewPipelineResults] = useState([]);
      const [scenePreviewMode, setScenePreviewMode] = useState('font'); // wasm | font
      const [wasmPreviewUrl, setWasmPreviewUrl] = useState('');
      const [wasmPreviewStatus, setWasmPreviewStatus] = useState('WASM runtime is idle.');
      const [wasmPreviewWarning, setWasmPreviewWarning] = useState('');
      const [showWasmRuntimeSlot, setShowWasmRuntimeSlot] = useState(true);
      const [showWasmRuntimeReport, setShowWasmRuntimeReport] = useState(true);
      const [fontPreviewLayout, setFontPreviewLayout] = useState({ lines: [], overflow: false, maxCols: 36, maxLines: 4 });
      const [fontPreviewStatus, setFontPreviewStatus] = useState('Internal font renderer ready.');
      const [fontPreviewBoxWidth, setFontPreviewBoxWidth] = useState(640);
      const [fontPreviewLineHeight, setFontPreviewLineHeight] = useState(20);
      const [fontPreviewPadding, setFontPreviewPadding] = useState(14);
      const [fontPreviewBackgroundMeta, setFontPreviewBackgroundMeta] = useState(null);
      const [liveEmulatorLinked, setLiveEmulatorLinked] = useState(false);
      const [isLiveSyncing, setIsLiveSyncing] = useState(false);
      const [liveEmulatorStatus, setLiveEmulatorStatus] = useState('Live emulator link is idle.');
      const [runtimeSaveStateBytes, setRuntimeSaveStateBytes] = useState(0);
      const [runtimePaused, setRuntimePaused] = useState(false);
      const [runtimeFastForward, setRuntimeFastForward] = useState(false);
      const [runtimeControlBusy, setRuntimeControlBusy] = useState({
        save: false,
        load: false,
        pause: false,
        fast: false,
        reset: false
      });
      const [scenePreviewFrame, setScenePreviewFrame] = useState(null);
      const [sceneFontSourceMeta, setSceneFontSourceMeta] = useState({
        offset: 0,
        bpp: 4,
        bytesPerTile: 32,
        detectVariant: 'default',
        detectScore: 0,
        detectMode: 'auto',
        romLength: 0
      });
      const [romPreviewData, setRomPreviewData] = useState(null);
      const [romPreviewStatus, setRomPreviewStatus] = useState('ROM tile preview idle.');
      const [romPreviewMode, setRomPreviewMode] = useState('auto');
      const [romPreviewOffsetInput, setRomPreviewOffsetInput] = useState('');
      const [romPreviewAutoRefresh, setRomPreviewAutoRefresh] = useState(true);
      const [wasmIframeKey, setWasmIframeKey] = useState(1);
      const [runtimeRamData, setRuntimeRamData] = useState(null);
      const [runtimeRamName, setRuntimeRamName] = useState('');
      const [runtimeRamHits, setRuntimeRamHits] = useState([]);
      const [runtimeRamStatus, setRuntimeRamStatus] = useState('Load a RAM dump to inspect live dialogue buffers.');
      const [runtimeDomainDump, setRuntimeDomainDump] = useState(null);
      const [runtimeDomainName, setRuntimeDomainName] = useState('');
      const [runtimeDomainSystem, setRuntimeDomainSystem] = useState('auto');
      const [runtimeVizData, setRuntimeVizData] = useState(null);
      const [runtimeVizStatus, setRuntimeVizStatus] = useState('Load a VRAM/PPU dump to render off-main-thread preview.');
      const [zoom, setZoom] = useState(1);
      const [bootDiagnosticMode, setBootDiagnosticMode] = useState(false);
      const [bootDiagnostics, setBootDiagnostics] = useState([]);
      const [topCompact, setTopCompact] = useState(false);
      const [workspaceEngaged, setWorkspaceEngaged] = useState(false);
      const [panelMinimized, setPanelMinimized] = useState({});
      const [isMobileLayout, setIsMobileLayout] = useState(() => {
        try {
          return window.matchMedia('(max-width: 980px)').matches;
        } catch (_) {
          return false;
        }
      });
      const [workerEpoch, setWorkerEpoch] = useState(0);
      const wasmBrowserRisk = useMemo(() => {
        try {
          const cpu = Number(navigator?.hardwareConcurrency) || 0;
          const mem = Number(navigator?.deviceMemory) || 0;
          const lowCpu = cpu > 0 && cpu <= 4;
          const lowMem = mem > 0 && mem <= 4;
          const noCrossIso = typeof crossOriginIsolated === 'boolean' ? !crossOriginIsolated : true;
          return lowCpu || lowMem || noCrossIso;
        } catch (_) {
          return true;
        }
      }, []);

      const fileInputRef = useRef(null);
      const tableInputRef = useRef(null);
      const patchInputRef = useRef(null);
      const csvImportRef = useRef(null);
      const projectImportRef = useRef(null);
      const pointerImportRef = useRef(null);
      const controlDictInputRef = useRef(null);
      const hexCustomTableInputRef = useRef(null);
      const fontBackgroundInputRef = useRef(null);
      const tileSheetCanvasRef = useRef(null);
      const tileMapCanvasRef = useRef(null);
      const tileSelectedCanvasRef = useRef(null);
      const scenePreviewCanvasRef = useRef(null);
      const scenePreviewIframeRef = useRef(null);
      const previewCanvasRef = useRef(null);
      const runtimeVizCanvasRef = useRef(null);
      const workspaceScrollRef = useRef(null);
      const runtimeDumpInputRef = useRef(null);
      const runtimeDomainInputRef = useRef(null);
      const textsPerPage = 20;

      const textExtractorWorker = useRef(null);
      const buildWorker = useRef(null);
      const relativeSearchWorker = useRef(null);
      const hexWorker = useRef(null);
      const translationInputWorker = useRef(null);
      const searchWorker = useRef(null);
      const pointerWorker = useRef(null);
      const tableWorker = useRef(null);
      const tileEditorWorker = useRef(null);
      const unitTestWorker = useRef(null);
      const scenePreviewWorker = useRef(null);
      const romPreviewWorker = useRef(null);
      const runtimeRamWorker = useRef(null);
      const runtimeVizWorker = useRef(null);
      const previewAssertWorker = useRef(null);
      const sceneFontSourceSeqRef = useRef(0);
      const hasUnsavedChangesRef = useRef(false);
      const stateToSave = useRef({});
      const wasmPreviewFrameSeqRef = useRef(0);
      const wasmRuntimeBootRef = useRef({ key: '', pending: false });
      const wasmCoreReadyRef = useRef(false);
      const extractionBufferRef = useRef([]);
      const tableEditTimerRef = useRef(null);
      const tableParseSeqRef = useRef(0);
      const processingStartRef = useRef(0);
      const searchSeqRef = useRef(0);
      const searchIndexReadyRef = useRef(false);
      const searchInputRef = useRef(null);
      const searchSelectionRef = useRef({ start: null, end: null, dir: 'none' });
      const allTextsRef = useRef([]);
      const allTextsByIdRef = useRef(new Map());
      const romDataRef = useRef(null);
      const tableDataRef = useRef(null);
      const systemInfoRef = useRef(null);
      const debouncedSearchTermRef = useRef('');
      const translatedLenCacheRef = useRef(new Map());
      const previewAssertSeqRef = useRef(0);
      const previewAssertPendingRef = useRef(new Map());
      const fontPreviewBackgroundRef = useRef(null);
      const liveSaveStateRef = useRef(null);
      const liveSaveStateRequestSeqRef = useRef(0);
      const liveSaveStatePendingRef = useRef(new Map());
      const runtimeLoadRequestSeqRef = useRef(0);
      const runtimeLoadPendingRef = useRef(new Map());
      const runtimeControlSeqRef = useRef(0);
      const runtimeControlPendingRef = useRef(new Map());
      const runtimeRedrawSeqRef = useRef(0);
      const runtimeRedrawPendingRef = useRef(new Map());
      const liveBuildRequestSeqRef = useRef(0);
      const liveBuildPendingRef = useRef(new Map());
      const liveBuildBusyRef = useRef(false);
      const liveBuildQueuedRef = useRef(false);
      const liveSyncQueuedOverrideRef = useRef(null);
      const liveSyncTextsRef = useRef(new Map());
      const liveAppliedTextsRef = useRef(new Map());
      const liveRuntimeRomRef = useRef(null);
      const liveLinkBusyRef = useRef(false);
      const unitRuntimeTestBusyRef = useRef(false);
      const testWasmRuntimeCycleRef = useRef(null);
      const liveAutoSyncTimerRef = useRef(null);
      const runtimeRemountSyncRef = useRef(false);
      const pendingRuntimeLoadRef = useRef(null);
      const prevActiveTabRef = useRef(activeTab);
      const shouldUseSearchWorker = useMemo(() => allTexts.length >= 3000, [allTexts.length]);

      useEffect(() => {
        window.__PT_APP_READY__ = true;
        window.__PT_RUNTIME_ERROR_HANDLER__ = (title, detail) => {
          const head = String(title || 'Runtime Error');
          const body = String(detail || 'Unknown runtime error');
          setError(`${head}\n${body}`);
        };
        return () => {
          if (window.__PT_RUNTIME_ERROR_HANDLER__) window.__PT_RUNTIME_ERROR_HANDLER__ = null;
          window.__PT_APP_READY__ = false;
        };
      }, []);

      useEffect(() => {
        return () => {
          if (liveAutoSyncTimerRef.current) clearTimeout(liveAutoSyncTimerRef.current);
        };
      }, []);

      const recordSearchSelection = useCallback((inputEl) => {
        if (!inputEl) return;
        searchSelectionRef.current = {
          start: typeof inputEl.selectionStart === 'number' ? inputEl.selectionStart : null,
          end: typeof inputEl.selectionEnd === 'number' ? inputEl.selectionEnd : null,
          dir: inputEl.selectionDirection || 'none'
        };
      }, []);

      const isPanelMinimized = useCallback((panelKey) => {
        return !!panelMinimized[String(panelKey || '')];
      }, [panelMinimized]);

      const togglePanelMinimized = useCallback((panelKey) => {
        const key = String(panelKey || '');
        if (!key) return;
        setPanelMinimized(prev => ({ ...prev, [key]: !prev[key] }));
      }, []);

      useEffect(() => {
        let mql = null;
        const handleLayout = () => {
          try {
            setIsMobileLayout(window.matchMedia('(max-width: 980px)').matches);
          } catch (_) {
            setIsMobileLayout((window.innerWidth || 0) <= 980);
          }
        };
        handleLayout();
        try {
          mql = window.matchMedia('(max-width: 980px)');
          if (mql.addEventListener) mql.addEventListener('change', handleLayout);
          else if (mql.addListener) mql.addListener(handleLayout);
        } catch (_) { }
        window.addEventListener('resize', handleLayout);
        return () => {
          window.removeEventListener('resize', handleLayout);
          if (mql) {
            if (mql.removeEventListener) mql.removeEventListener('change', handleLayout);
            else if (mql.removeListener) mql.removeListener(handleLayout);
          }
        };
      }, []);

      useEffect(() => {
        if (!isMobileLayout || activeTab !== 'extraction') return;
        setPanelMinimized(prev => {
          if (!prev['translation-center']) return prev;
          return { ...prev, 'translation-center': false };
        });
      }, [isMobileLayout, activeTab]);

      const appendBootDiagnostic = useCallback((line) => {
        setBootDiagnostics(prev => {
          const next = [...prev, line];
          if (next.length > 60) next.splice(0, next.length - 60);
          return next;
        });
      }, []);

      const HEX_MIN_WINDOW_BYTES = 256;
      const HEX_MAX_WINDOW_BYTES = 0x20000;
      const HEX_MIN_COLUMNS = 8;
      const HEX_MAX_COLUMNS = 32;
      const HEX_MIN_ROWS = 128;
      const HEX_MAX_ROWS = 8192;
      const HEX_HISTORY_LIMIT = 4096;
      const HEX_BOOKMARK_LIMIT = 256;

      const POINTER_RULE_TEMPLATES = useMemo(() => ({
        Auto: { minPointers: 1, minConfidence: 0.45, containerGap: 0x400, coverageThreshold: 60, requireAbsolute: false, bankConstraint: 'auto' },
        NES: { minPointers: 1, minConfidence: 0.55, containerGap: 0x200, coverageThreshold: 55, requireAbsolute: false, bankConstraint: 'bank16' },
        SNES: { minPointers: 1, minConfidence: 0.6, containerGap: 0x400, coverageThreshold: 60, requireAbsolute: false, bankConstraint: 'lorom-hirom' },
        GB: { minPointers: 1, minConfidence: 0.55, containerGap: 0x200, coverageThreshold: 55, requireAbsolute: false, bankConstraint: 'bank16' },
        GBC: { minPointers: 1, minConfidence: 0.55, containerGap: 0x200, coverageThreshold: 55, requireAbsolute: false, bankConstraint: 'bank16' },
        GBA: { minPointers: 1, minConfidence: 0.7, containerGap: 0x800, coverageThreshold: 70, requireAbsolute: true, bankConstraint: 'arm32' },
        NDS: { minPointers: 1, minConfidence: 0.68, containerGap: 0x1000, coverageThreshold: 70, requireAbsolute: true, bankConstraint: 'arm32' },
        "Nintendo 3DS": { minPointers: 1, minConfidence: 0.65, containerGap: 0x1000, coverageThreshold: 70, requireAbsolute: true, bankConstraint: 'arm32' },
        "Nintendo 64": { minPointers: 1, minConfidence: 0.65, containerGap: 0x1000, coverageThreshold: 65, requireAbsolute: true, bankConstraint: 'mips32' },
        "Sega Genesis/MD": { minPointers: 1, minConfidence: 0.6, containerGap: 0x400, coverageThreshold: 60, requireAbsolute: false, bankConstraint: '68k' },
        "PlayStation Portable": { minPointers: 1, minConfidence: 0.7, containerGap: 0x1000, coverageThreshold: 70, requireAbsolute: true, bankConstraint: 'mips32' },
        "PlayStation 1": { minPointers: 1, minConfidence: 0.65, containerGap: 0x1000, coverageThreshold: 65, requireAbsolute: true, bankConstraint: 'mips32' }
      }), []);

      // Update a ref with the latest state for session saving
      useEffect(() => {
        stateToSave.current = {
          romData, originalRomData, tableData, allTexts,
          searchTerm, options, systemInfo, modifiedRom,
          activeTab, tableContent, sourceLang, targetLang,
          hexViewStart, hexViewLength, hexViewColumns, hexRowLimit, hexSearchHex, hexBookmarks,
          hexAsciiMode, hexCustomTableName,
          liveEditMode, pointerLabOffsetInput, pointerLabTextId, pointerGroups, selectedPointerGroupId,
          pointerRuleTemplateKey, pointerRuleOverride, pointerGateEnabled, pointerGateMode, sceneSpeakerName,
          containerMapEnabled, segmentConfidenceThreshold, extractionProfileLock, extractionProfiles,
          controlCodeDict, romPreviewMode, romPreviewOffsetInput, romPreviewAutoRefresh,
          runtimeDomainSystem
        };
        if (romData && allTexts.length > 0) {
          setHasUnsavedChanges(true);
        }
        hasUnsavedChangesRef.current = !!hasUnsavedChanges;
      }, [
        romData, originalRomData, tableData, allTexts, searchTerm,
        options, systemInfo, modifiedRom, activeTab, tableContent,
        sourceLang, targetLang, hexViewStart, hexViewLength, hexViewColumns, hexRowLimit, hexSearchHex, hexBookmarks,
        hexAsciiMode, hexCustomTableName,
        liveEditMode, pointerLabOffsetInput, pointerLabTextId, pointerGroups, selectedPointerGroupId,
        pointerRuleTemplateKey, pointerRuleOverride, pointerGateEnabled, pointerGateMode, sceneSpeakerName,
        containerMapEnabled, segmentConfidenceThreshold, extractionProfileLock, extractionProfiles,
        controlCodeDict, romPreviewMode, romPreviewOffsetInput, romPreviewAutoRefresh,
        runtimeDomainSystem,
        hasUnsavedChanges
      ]);

      // Session Persistence and Refresh Protection
      useEffect(() => {
        const SESSION_KEY = 'pocketTranslateSession';
        const urlParams = new URLSearchParams(window.location.search);
        const diagParam = String(urlParams.get('diag') || '').toLowerCase();
        const diagnosticMode =
          diagParam === '1' ||
          diagParam === 'true' ||
          diagParam === 'on' ||
          diagParam === 'fresh' ||
          window.localStorage.getItem('pt_boot_diag') === '1';
        const safeBoot =
          diagParam === 'fresh' ||
          urlParams.get('fresh') === '1';
        setBootDiagnosticMode(diagnosticMode);
        if (diagnosticMode) appendBootDiagnostic(`[BOOT] Diagnostic mode enabled (${safeBoot ? 'SAFE' : 'NORMAL'}).`);

        // On Load: Attempt to restore session
        const restoreSession = () => {
          try {
            if (safeBoot) {
              sessionStorage.removeItem(SESSION_KEY);
              if (diagnosticMode) appendBootDiagnostic('[BOOT] Safe boot cleared session cache.');
              return;
            }
            const savedStateJSON = sessionStorage.getItem(SESSION_KEY);
            if (diagnosticMode) {
              const bytes = savedStateJSON ? savedStateJSON.length : 0;
              appendBootDiagnostic(`[BOOT] Session payload bytes: ${bytes}.`);
            }
            if (savedStateJSON) {
              const parseStart = performance.now();
              const savedState = JSON.parse(savedStateJSON, (key, value) => {
                // Reviver to convert array-like objects back to Uint8Array
                if (value && typeof value === 'object' && value.type === 'Uint8Array') {
                  return new Uint8Array(Object.values(value.data));
                }
                return value;
              });
              if (diagnosticMode) {
                const elapsed = (performance.now() - parseStart).toFixed(1);
                appendBootDiagnostic(`[BOOT] Session JSON parse completed in ${elapsed}ms.`);
              }

              // Helper to create a valid ROM data object from raw buffer
              const createRomDataObject = (rawBuffer, name, system) => {
                if (!rawBuffer) return null;
                const data = new Uint8Array(rawBuffer);
                return { name, size: data.length, data, system };
              };

              // Restore state
              const restoredOriginalRom = createRomDataObject(savedState.originalRomData?.data, savedState.originalRomData?.name, savedState.systemInfo);
              if (restoredOriginalRom) {
                setOriginalRomData(restoredOriginalRom);
                const restoredCurrentRom = createRomDataObject(savedState.romData?.data, savedState.romData?.name, savedState.systemInfo);
                setRomData(restoredCurrentRom || restoredOriginalRom);
                if (savedState.modifiedRom) setModifiedRom(new Uint8Array(savedState.modifiedRom));
              }

              setTableData(savedState.tableData);
              setAllTexts(savedState.allTexts || []);
              setSearchTerm(savedState.searchTerm || '');
              setOptions({
                minLength: 4,
                maxLength: 1024,
                asciiFallback: true,
                usePaddingByte: false,
                strictExtractorMode: false,
                strictSceneProfile: 'default',
                ...(savedState.options || {})
              });
              setSystemInfo(savedState.systemInfo);
              const restoredTab = savedState.activeTab || 'extraction';
              setActiveTab(restoredTab || 'extraction');
              setTableContent(savedState.tableContent || '');
              setSourceLang(savedState.sourceLang || 'en');
              setTargetLang(savedState.targetLang || 'id');
              setHexViewStart(savedState.hexViewStart || '0x000000');
              setHexViewLength(savedState.hexViewLength || 4096);
              setHexViewColumns(savedState.hexViewColumns || 16);
              setHexRowLimit(savedState.hexRowLimit || 1024);
              setHexSearchHex(savedState.hexSearchHex || '');
              setHexBookmarks(Array.isArray(savedState.hexBookmarks) ? savedState.hexBookmarks : []);
              const restoredHexMode = savedState.hexAsciiMode || 'ascii';
              setHexAsciiMode(restoredHexMode === 'custom_table' ? 'ascii' : restoredHexMode);
              setHexCustomTableName(savedState.hexCustomTableName || '');
              setHexCustomTableData(null);
              setLiveEditMode(savedState.liveEditMode !== false);
              setPointerLabOffsetInput(savedState.pointerLabOffsetInput || '');
              setPointerLabTextId(savedState.pointerLabTextId || '');
              setPointerGroups(Array.isArray(savedState.pointerGroups) ? savedState.pointerGroups : []);
              setSelectedPointerGroupId(savedState.selectedPointerGroupId || '');
              setPointerRuleTemplateKey(savedState.pointerRuleTemplateKey || 'Auto');
              setPointerRuleOverride(savedState.pointerRuleOverride || { minPointers: '', minConfidence: '', containerGap: '', coverageThreshold: '' });
              setPointerGateEnabled(savedState.pointerGateEnabled !== false);
              setPointerGateMode(savedState.pointerGateMode || 'advisory');
              setSceneSpeakerName(savedState.sceneSpeakerName || '');
              setRomPreviewData(null);
              setRomPreviewStatus('ROM tile preview idle.');
              setRomPreviewMode(savedState.romPreviewMode || 'auto');
              setRomPreviewOffsetInput(savedState.romPreviewOffsetInput || '');
              setRomPreviewAutoRefresh(savedState.romPreviewAutoRefresh !== false);
              setRuntimeDomainSystem(savedState.runtimeDomainSystem || 'auto');
              setRuntimeRamData(null);
              setRuntimeRamName('');
              setRuntimeRamHits([]);
              setRuntimeRamStatus('Load a RAM dump to inspect live dialogue buffers.');
              setRuntimeDomainDump(null);
              setRuntimeDomainName('');
              setRuntimeVizData(null);
              setRuntimeVizStatus('Load a VRAM/PPU dump to render off-main-thread preview.');
              setContainerMapEnabled(savedState.containerMapEnabled === true);
              setSegmentConfidenceThreshold(Math.max(0, Math.min(100, Number(savedState.segmentConfidenceThreshold) || 0)));
              setExtractionProfileLock(savedState.extractionProfileLock === true);
              setExtractionProfiles(savedState.extractionProfiles && typeof savedState.extractionProfiles === 'object' ? savedState.extractionProfiles : {});
              setControlCodeDict(savedState.controlCodeDict && typeof savedState.controlCodeDict === 'object'
                ? {
                  aliases: savedState.controlCodeDict.aliases && typeof savedState.controlCodeDict.aliases === 'object' ? savedState.controlCodeDict.aliases : {},
                  ignoreTokens: Array.isArray(savedState.controlCodeDict.ignoreTokens) ? savedState.controlCodeDict.ignoreTokens : []
                }
                : { aliases: {}, ignoreTokens: [] }
              );

              setHasUnsavedChanges(false); // Reset on restore
              setSuccess("Restored previous session.");
              if (diagnosticMode) appendBootDiagnostic('[BOOT] Session restore completed.');
            } else if (diagnosticMode) {
              appendBootDiagnostic('[BOOT] No prior session found.');
            }
          } catch (err) {
            console.error("Failed to restore session:", err);
            setError("Could not restore previous session. It may have been corrupted.");
            sessionStorage.removeItem(SESSION_KEY);
            if (diagnosticMode) appendBootDiagnostic(`[BOOT] Session restore failed: ${err?.message || 'Unknown error'}`);
          } finally {
            // Show the UI after attempting to restore
            const loader = document.getElementById('loader');
            const root = document.getElementById('root');
            if (loader) {
              loader.style.opacity = '0';
              setTimeout(() => {
                loader.style.display = 'none';
                if (root) root.style.display = 'block';
              }, 500);
            } else if (root) {
              root.style.display = 'block';
            }
            if (diagnosticMode) appendBootDiagnostic('[BOOT] UI bootstrap completed.');
          }
        };

        // On Unload: Save session and show prompt
        const handleBeforeUnload = (e) => {
          const hasLoadedProject = !!stateToSave.current?.romData;
          if (hasUnsavedChangesRef.current && stateToSave.current.romData) {
            try {
              // Replacer to handle Uint8Array serialization
              const replacer = (key, value) => {
                if (value instanceof Uint8Array) {
                  return { type: 'Uint8Array', data: { ...value } };
                }
                if (value instanceof Map) {
                  return { type: 'Map', data: Array.from(value.entries()) };
                }
                return value;
              };
              const stateJSON = JSON.stringify(stateToSave.current, replacer);
              sessionStorage.setItem(SESSION_KEY, stateJSON);
            } catch (err) {
              console.error("Failed to save session state:", err);
              // Don't prevent unload, but log the error
            }

            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
          } else {
            if (hasLoadedProject) {
              e.preventDefault();
              e.returnValue = 'A project is loaded. Refresh can reset current working state. Continue?';
              return e.returnValue;
            }
            sessionStorage.removeItem(SESSION_KEY); // Clear session if no unsaved changes
          }
        };

        restoreSession();
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      }, [appendBootDiagnostic]); // Run once (appendBootDiagnostic is stable)

      const LANGUAGES = [
        { code: 'id', name: 'Indonesian' }, { code: 'en', name: 'English' },
        { code: 'ja', name: 'Japanese' }, { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' }, { code: 'pt', name: 'Portuguese' },
        { code: 'ru', name: 'Russian' }, { code: 'zh-CN', name: 'Chinese (Simplified)' },
        { code: 'ko', name: 'Korean' }, { code: 'ar', name: 'Arabic' },
      ];

      const ensureControlTokensInContent = useCallback((content, modeHint = 'auto', preferredBytes = null) => {
        const normalized = String(content ?? '').replace(/\r/g, '');
        const lines = normalized.split('\n');
        const entries = [];
        const keySet = new Set();
        const valueByKey = new Map();
        let hasLineToken = false;
        let hasEndToken = false;
        let explicitLineKey = null;
        let explicitEndKey = null;
        let slashKey = null;
        const widthCounts = new Map();

        for (const rawLine of lines) {
          if (!rawLine) continue;
          const trimmed = rawLine.trim();
          if (!trimmed || trimmed.startsWith('//')) continue;
          const commentIndex = rawLine.indexOf(';');
          const line = commentIndex > -1 ? rawLine.substring(0, commentIndex) : rawLine;
          const splitIndex = line.indexOf('=');
          if (splitIndex <= 0) continue;
          const hexStr = line.substring(0, splitIndex).replace(/\s+/g, '').toUpperCase();
          if (!/^[0-9A-F]+$/.test(hexStr) || (hexStr.length % 2 !== 0)) continue;
          const value = line.substring(splitIndex + 1) ?? '';
          const valueTrimmed = value.trim();
          const upperValue = valueTrimmed.toUpperCase();
          if (upperValue === '[LINE]' || upperValue === '[NEWLINE]') {
            hasLineToken = true;
            explicitLineKey = explicitLineKey || hexStr;
          }
          if (upperValue === '[END]' || upperValue === '[NULL]') {
            hasEndToken = true;
            explicitEndKey = explicitEndKey || hexStr;
          }
          if (valueTrimmed === '/' && !slashKey) slashKey = hexStr;
          entries.push({ hexStr, value });
          keySet.add(hexStr);
          valueByKey.set(hexStr, valueTrimmed);
          const byteLen = hexStr.length / 2;
          widthCounts.set(byteLen, (widthCounts.get(byteLen) || 0) + 1);
        }

        let dominantByteLen = 1;
        let dominantCount = -1;
        for (const [byteLen, count] of widthCounts.entries()) {
          if (count > dominantCount) {
            dominantByteLen = byteLen;
            dominantCount = count;
          }
        }
        const controlByteLen = dominantByteLen >= 2 ? 2 : 1;

        let inferredMode = modeHint;
        if (inferredMode !== 'none' && inferredMode !== 'le' && inferredMode !== 'be') {
          if (controlByteLen === 1) {
            inferredMode = 'none';
          } else {
            let leCount = 0;
            let beCount = 0;
            for (const entry of entries) {
              if (entry.hexStr.length !== 4) continue;
              if (entry.hexStr.endsWith('00')) leCount++;
              if (entry.hexStr.startsWith('00')) beCount++;
            }
            if (leCount === 0 && beCount === 0) inferredMode = 'none';
            else inferredMode = leCount >= beCount ? 'le' : 'be';
          }
        }

        const decodeControlByte = (hexStr) => {
          if (!hexStr || !/^[0-9A-F]+$/.test(hexStr) || (hexStr.length % 2) !== 0) return null;
          const bytes = hexStr.match(/.{1,2}/g).map(h => parseInt(h, 16));
          if (bytes.length === 1) return bytes[0];
          if (inferredMode === 'le') {
            const nonZero = bytes.find(b => b !== 0);
            return Number.isFinite(nonZero) ? nonZero : bytes[0];
          }
          if (inferredMode === 'be') {
            const nonZero = bytes.find(b => b !== 0);
            return Number.isFinite(nonZero) ? nonZero : bytes[bytes.length - 1];
          }
          const nonZero = bytes.filter(b => b !== 0);
          if (nonZero.length === 1) return nonZero[0];
          return bytes[0];
        };

        const formatByteKey = (byteVal) => {
          const hex = (byteVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');
          if (controlByteLen === 1 || inferredMode === 'none') return hex;
          return inferredMode === 'be' ? ('00' + hex) : (hex + '00');
        };

        const uniqueBytes = (values) => {
          const seen = new Set();
          const out = [];
          for (const value of values) {
            if (!Number.isFinite(value)) continue;
            const b = value & 0xFF;
            if (seen.has(b)) continue;
            seen.add(b);
            out.push(b);
          }
          return out;
        };

        const currentLineByte = decodeControlByte(explicitLineKey) ?? decodeControlByte(slashKey);
        const currentEndByte = decodeControlByte(explicitEndKey);
        let selectedLineByte = Number.isFinite(currentLineByte) ? currentLineByte : null;
        let selectedEndByte = Number.isFinite(currentEndByte) ? currentEndByte : null;
        const preferredLineByte = Number.isFinite(preferredBytes?.lineByte) ? preferredBytes.lineByte : null;
        const preferredEndByte = Number.isFinite(preferredBytes?.endByte) ? preferredBytes.endByte : null;

        const addedTokens = [];
        if (!hasLineToken) {
          let lineKey = null;
          const lineCandidates = uniqueBytes([preferredLineByte, selectedLineByte, 0x06, 0x0A, 0x0D, 0xFE]);
          for (const byteVal of lineCandidates) {
            if (Number.isFinite(selectedEndByte) && byteVal === selectedEndByte) continue;
            const key = formatByteKey(byteVal);
            if (!keySet.has(key)) {
              lineKey = key;
              selectedLineByte = byteVal;
              break;
            }
            const existingValue = (valueByKey.get(key) || '').toUpperCase();
            if (existingValue === '[LINE]' || existingValue === '[NEWLINE]' || existingValue === '/') {
              lineKey = key;
              selectedLineByte = byteVal;
              break;
            }
          }
          if (!lineKey) {
            const fallbackByte = Number.isFinite(preferredLineByte) ? preferredLineByte : 0x0A;
            selectedLineByte = fallbackByte & 0xFF;
            lineKey = formatByteKey(selectedLineByte);
          }
          lines.push(`${lineKey}=[LINE]`);
          keySet.add(lineKey);
          valueByKey.set(lineKey, '[LINE]');
          addedTokens.push('[LINE]');
        }

        if (!hasEndToken) {
          let endKey = null;
          const endCandidates = uniqueBytes([preferredEndByte, selectedEndByte, 0x00, 0x0A, 0xFF]);
          for (const byteVal of endCandidates) {
            if (Number.isFinite(selectedLineByte) && byteVal === selectedLineByte) continue;
            const key = formatByteKey(byteVal);
            if (!keySet.has(key)) {
              endKey = key;
              selectedEndByte = byteVal;
              break;
            }
            const existingValue = (valueByKey.get(key) || '').toUpperCase();
            if (existingValue === '[END]' || existingValue === '[NULL]' || existingValue === '') {
              endKey = key;
              selectedEndByte = byteVal;
              break;
            }
          }
          if (!endKey) {
            const fallbackByte = Number.isFinite(preferredEndByte) ? preferredEndByte : 0x00;
            selectedEndByte = fallbackByte & 0xFF;
            if (Number.isFinite(selectedLineByte) && selectedEndByte === selectedLineByte) {
              selectedEndByte = selectedEndByte === 0x00 ? 0xFF : 0x00;
            }
            endKey = formatByteKey(selectedEndByte);
          }
          lines.push(`${endKey}=[END]`);
          keySet.add(endKey);
          valueByKey.set(endKey, '[END]');
          addedTokens.push('[END]');
        }

        return {
          content: lines.join('\n'),
          addedTokens
        };
      }, []);

      const parseAndSetTable = useCallback((content, fileName = "custom.tbl") => {
        try {
          if (!tableWorker.current) {
            setError("Table worker is not ready. Please refresh and try again.");
            return;
          }
          const parseId = ++tableParseSeqRef.current;
          tableWorker.current.postMessage({ type: 'parseTable', payload: { content, fileName, parseId } });
        } catch (err) {
          setError(`Table Parse Error: ${err.message}`);
          setTableData(null);
        }
      }, []);

      const formatActionableError = useCallback((scope, rawMessage) => {
        const msg = String(rawMessage || 'Unknown error');
        const lower = msg.toLowerCase();
        let suggestion = 'Retry the action. If it repeats, refresh the page and reload ROM + table.';
        if (lower.includes('table') || lower.includes('encoding')) {
          suggestion = 'Check table format (.tbl), ensure [LINE]/[END] exist, then reload table.';
        } else if (lower.includes('pointer')) {
          suggestion = 'Run pointer scan/validation again and verify system profile before build.';
        } else if (lower.includes('worker') || lower.includes('syntax')) {
          suggestion = 'Refresh browser once, then repeat the last step.';
        } else if (lower.includes('memory') || lower.includes('out of')) {
          suggestion = 'Close other heavy tabs/apps, then retry with smaller window/chunk.';
        }
        return `${scope ? scope + ': ' : ''}${msg}\nSuggestion: ${suggestion}`;
      }, []);

      useEffect(() => {
        const handleWorkerMessage = (e) => {
          const data = (e && e.data && typeof e.data === 'object') ? e.data : {};
          const {
            type,
            texts,
            done,
            totalTextCount,
            value,
            message,
            stack,
            modifiedRom,
            relocationLog,
            patchData,
            results,
            queryLength,
            rows,
            matches,
            start,
            end,
            total,
            searched,
            matchLength,
            truncated,
            rowLimit,
            requestedLength,
            targetOffset,
            pointerSize,
            endian,
            width,
            height,
            pixels,
            mode,
            sourceStart,
            sourceTag,
            status,
            details,
            updatedPointers,
            fileName,
            singleByte,
            multiByte,
            entryCount,
            hasMultiByte,
            maxByteLength,
            byteWidths,
            spaceDefined,
            parseId,
            hits,
            textId,
            queryByteLength,
            capped,
            requestId,
            matchedIds,
            totalIndex,
            tests,
            passed,
            failed,
            summary,
            bpp,
            bytesPerTile,
            tileOffset,
            tileCount,
            tilesPerRow,
            sheetWidth,
            sheetHeight,
            sheetPixels,
            mapWidth,
            mapHeight,
            mapPresent,
            mapPixels,
            previewLines,
            previewOverflow,
            previewMaxCols,
            previewMaxLines,
            previewSourceLength,
            frameWidth,
            frameHeight,
            framePixels,
            fontOffset,
            fontBpp,
            detectScore,
            detectVariant,
            detectMode,
            romLength,
            newTranslation,
            predictions,
            bestOffset,
            bestBpp,
            bestVariant,
            bestScore,
            bestMode,
            stage,
            variant,
            progress
          } = data;
          try {
            const safeUint8Clamped = (value, fallbackLength = 0) => {
              try {
                if (value instanceof Uint8ClampedArray) return value;
                if (value instanceof ArrayBuffer) return new Uint8ClampedArray(value);
                if (ArrayBuffer.isView(value)) return new Uint8ClampedArray(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
                if (Array.isArray(value)) return new Uint8ClampedArray(value);
              } catch (_) { }
              return new Uint8ClampedArray(Math.max(0, Number(fallbackLength) || 0));
            };
            if (type === 'progress') {
              if ((data?.silentLive === true) && Number(data?.requestId) > 0) return;
              setProgress(value);
            } else if (type === 'resultChunk') {
              const chunk = Array.isArray(texts) ? texts : [];
              if (chunk.length > 0) extractionBufferRef.current.push(...chunk);
              if (done) {
                const finalTexts = extractionBufferRef.current.slice();
                extractionBufferRef.current = [];
                setAllTexts(finalTexts);
                setScenePreviewMode('font');
                const totalCount = Number.isFinite(totalTextCount) ? totalTextCount : (Number.isFinite(total) ? total : finalTexts.length);
                setSuccess(`Extraction complete. Found ${totalCount} unique text strings.`);
                setIsProcessing(false); setProcessingText(''); setProgress(100); setTimeout(() => setProgress(0), 500);
              }
            } else if (type === 'result' && Array.isArray(texts)) {
              extractionBufferRef.current = [];
              setAllTexts(texts);
              setScenePreviewMode('font');
              setSuccess(`Extraction complete. Found ${texts.length} unique text strings.`);
              setIsProcessing(false); setProcessingText(''); setProgress(100); setTimeout(() => setProgress(0), 500);
            } else if (type === 'tableParsed') {
              if (Number(parseId) !== tableParseSeqRef.current) return;
              const parsedEntryCount = Number(entryCount) || 0;
              if (parsedEntryCount === 0) {
                if (String(fileName || '') !== 'edited.tbl') setTableData(null);
                setError(`Table Parse Error: no valid entries found in ${fileName || 'table file'}.`);
                return;
              }
              if (parsedEntryCount > 0 && !spaceDefined) {
                setError("Warning: Space character ' ' or '[SPACE]' is not defined in the table. Text encoding may fail.");
              } else {
                setError((currentError) => {
                  const msg = typeof currentError === 'string' ? currentError : '';
                  return msg.startsWith("Warning: Space") ? "" : msg;
                });
              }
              setTableData({
                name: fileName || 'custom.tbl',
                singleByte: singleByte || {},
                multiByte: multiByte || {},
                entryCount: parsedEntryCount,
                hasMultiByte: hasMultiByte === true,
                maxByteLength: Number(maxByteLength) || 1,
                byteWidths: Array.isArray(byteWidths) ? byteWidths : [1]
              });
              setHasUnsavedChanges(true);
            } else if (type === 'runtimeSearchProgress') {
              setProgress(Math.max(0, Math.min(100, Number(value) || 0)));
            } else if (type === 'runtimeSearchResult') {
              const nextHits = Array.isArray(hits) ? hits : [];
              setRuntimeRamHits(nextHits);
              const target = Number.isFinite(Number(textId)) ? Number(textId) : 'N/A';
              const len = Number(queryByteLength) || 0;
              setRuntimeRamStatus(`Runtime scan complete for Text ID ${target}. Query length ${len} byte(s), hits ${nextHits.length}${capped ? ' (capped)' : ''}.`);
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'buildResult') {
              const resultRequestId = Number(data?.requestId) || 0;
              const resultSilentLive = data?.silentLive === true;
              const romPayload = data?.modifiedRom;
              const newRomData = romPayload instanceof Uint8Array
                ? romPayload
                : (romPayload instanceof ArrayBuffer
                  ? new Uint8Array(romPayload)
                  : new Uint8Array(romPayload || []));
              if (resultRequestId > 0) {
                const pending = liveBuildPendingRef.current.get(resultRequestId);
                if (pending) {
                  liveBuildPendingRef.current.delete(resultRequestId);
                  clearTimeout(pending.timerId);
                  pending.resolve({
                    requestId: resultRequestId,
                    silentLive: resultSilentLive,
                    modifiedRom: newRomData,
                    relocationLog: Array.isArray(relocationLog) ? relocationLog : []
                  });
                }
                if (resultSilentLive) {
                  return;
                }
              }
              setModifiedRom(newRomData);
              let successMessage = `Modified ROM built successfully (${Math.round(newRomData.length / 1024)}KB).`;
              if (relocationLog && relocationLog.length > 0) successMessage += `\n\nBuild Report:\n- ${relocationLog.join('\n- ')}`;
              setSuccess(successMessage);
              setPointerReplayRunning(false);
              setActiveTab('patching');
              setIsProcessing(false); setProcessingText(''); setProgress(100); setTimeout(() => setProgress(0), 500);
            } else if (type === 'ipsResult') {
              const baseName = (romData?.name || 'patched').split('.').slice(0, -1).join('.') || romData.name;
              const fileName = `${baseName}.ips`;
              const blob = new Blob([patchData], { type: 'application/octet-stream' });
              const url = URL.createObjectURL(blob); const link = document.createElement('a');
              link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
              setSuccess(`Successfully exported to ${fileName}.`);
              setIsProcessing(false); setProcessingText(''); setProgress(100); setTimeout(() => setProgress(0), 500);
            } else if (type === 'relativeSearchResult') {
              const nextResults = results || [];
              setRelativeSearchResults(nextResults);
              setRelativeSearchSelected(nextResults.length > 0 ? nextResults[0] : null);
              const count = results ? results.length : 0;
              setRelativeSearchStatus(`Results: ${count} match(es) for ${queryLength || 0} byte(s).`);
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'hexResult') {
              const nextRows = rows || [];
              const nextMatches = matches || [];
              setHexRows(nextRows);
              setHexMatches(nextMatches);
              setHexMatchLength(Math.max(1, Number(matchLength) || 1));
              setHexWindowStart(Number.isFinite(start) ? start : 0);
              setHexWindowEnd(Number.isFinite(end) ? end : 0);
              setHexTotalBytes(Number.isFinite(total) ? total : 0);
              const startHex = Number.isFinite(start) ? `0x${start.toString(16).toUpperCase().padStart(6, '0')}` : 'N/A';
              const endHex = Number.isFinite(end) ? `0x${Math.max(0, end - 1).toString(16).toUpperCase().padStart(6, '0')}` : 'N/A';
              const totalBytes = Number.isFinite(total) ? total.toLocaleString() : 'N/A';
              const searchInfo = searched ? ` | Matches: ${nextMatches.length}` : '';
              const limitInfo = Number.isFinite(rowLimit) ? ` | Row cap: ${rowLimit}` : '';
              const truncInfo = truncated ? ` | Clipped for stability${Number.isFinite(requestedLength) ? ` (requested ${requestedLength.toLocaleString()} bytes)` : ''}` : '';
              setHexStatus(`Hex window ${startHex} - ${endHex} | Rows: ${nextRows.length} | ROM bytes: ${totalBytes}${searchInfo}${limitInfo}${truncInfo}`);
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'pointerResult') {
              const nextMatches = Array.isArray(matches) ? matches : [];
              setPointerMatches(nextMatches);
              const targetHex = Number.isFinite(targetOffset) ? `0x${targetOffset.toString(16).toUpperCase().padStart(6, '0')}` : 'N/A';
              setPointerStatus(`Target ${targetHex} | Pointer size ${pointerSize || '?'} (${endian || '?'}) | Matches: ${nextMatches.length}`);
              setPointerTargetOffset(Number.isFinite(targetOffset) ? targetOffset : null);
              if (Number.isFinite(targetOffset)) setPointerGroupName(prev => prev || `Group 0x${targetOffset.toString(16).toUpperCase()}`);
              setHexPointerHighlights(nextMatches.map(p => p.ptrOffset).filter(v => Number.isFinite(v)));
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'pointerReplayResult') {
              const replayLog = Array.isArray(relocationLog) ? relocationLog : [];
              const report = [
                'Pointer Replay Test',
                `Updated pointer(s): ${Number(updatedPointers) || 0}`,
                ...replayLog.slice(0, 120)
              ].join('\n');
              setPointerValidationReport(report);
              setSuccess(`Pointer replay completed. Updated pointer(s): ${Number(updatedPointers) || 0}.`);
              setPointerReplayRunning(false);
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'romPreviewResult') {
              const w = Math.max(8, Number(width) || 160);
              const h = Math.max(8, Number(height) || 144);
              const px = safeUint8Clamped(pixels, w * h * 4);
              setRomPreviewData({ width: w, height: h, pixels: px });
              const srcHex = Number.isFinite(sourceStart) ? `0x${Number(sourceStart).toString(16).toUpperCase()}` : 'N/A';
              setRomPreviewStatus(`${status || 'ROM preview ready.'} Mode: ${mode || 'N/A'} | Source: ${sourceTag || 'unknown'} @ ${srcHex}`);
            } else if (type === 'runtimeVizResult') {
              const w = Math.max(8, Number(width) || 256);
              const h = Math.max(8, Number(height) || 240);
              const px = safeUint8Clamped(pixels, w * h * 4);
              setRuntimeVizData({ width: w, height: h, pixels: px, mode: mode || 'unknown', details: details || '' });
              setRuntimeVizStatus(`${summary || 'Runtime visualization rendered.'} Mode: ${mode || 'N/A'}`);
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'previewAssertResult') {
              const rid = Number(requestId) || 0;
              const pendingMap = previewAssertPendingRef?.current;
              if (!(pendingMap instanceof Map)) return;
              const pending = pendingMap.get(rid);
              if (pending) {
                pendingMap.delete(rid);
                if (typeof pending.resolve === 'function') {
                  pending.resolve({
                    pass: !!data?.pass,
                    details: data?.details || {}
                  });
                }
              }
            } else if (type === 'translationInputCommit') {
              const id = Number(textId);
              if (Number.isFinite(id)) {
                const translationValue = String(newTranslation || '');
                if (translationValue.trim().length > 0) {
                  const row = (allTextsRef.current || []).find(entry => Number(entry?.id) === id);
                  if (row) liveSyncTextsRef.current.set(id, { ...row, translatedText: translationValue });
                } else {
                  liveSyncTextsRef.current.delete(id);
                }
                setAllTexts((currentTexts) => {
                  const idx = currentTexts.findIndex(text => text.id === id);
                  if (idx < 0) return currentTexts;
                  const prev = currentTexts[idx];
                  if ((prev?.translatedText || '') === translationValue) return currentTexts;
                  const next = currentTexts.slice();
                  next[idx] = { ...prev, translatedText: translationValue };
                  return next;
                });
                if (searchWorker.current && searchIndexReadyRef.current) {
                  try {
                    searchWorker.current.postMessage({
                      type: 'updateSearchTranslation',
                      payload: { textId: id, translatedText: translationValue }
                    });
                  } catch (_) { }
                }
                setHasUnsavedChanges(true);
              }
            } else if (type === 'searchIndexReady') {
              searchIndexReadyRef.current = true;
              if (Number.isFinite(Number(total))) {
                setSuccess(prev => prev || `Search index ready (${Number(total)} entries).`);
              }
            } else if (type === 'searchResult') {
              const reqId = Number(requestId);
              if (!Number.isFinite(reqId) || reqId !== searchSeqRef.current) return;
              const ids = new Set((Array.isArray(matchedIds) ? matchedIds : []).map(v => Number(v)));
              const sourceTexts = Array.isArray(allTextsRef.current) ? allTextsRef.current : [];
              setFilteredTexts(sourceTexts.filter(text => ids.has(Number(text.id))));
              setCurrentPage(1);
            } else if (type === 'tileEditorResult') {
              const sheetW = Math.max(8, Number(sheetWidth) || 8);
              const sheetH = Math.max(8, Number(sheetHeight) || 8);
              const sheetPx = safeUint8Clamped(sheetPixels, sheetW * sheetH * 4);
              const mapW = Math.max(1, Number(mapWidth) || 1);
              const mapH = Math.max(1, Number(mapHeight) || 1);
              const mapPx = safeUint8Clamped(mapPixels, 0);
              setTileEditorData({
                bpp: Number(bpp) || 2,
                bytesPerTile: Number(bytesPerTile) || 16,
                tileOffset: Number(tileOffset) || 0,
                tileCount: Number(tileCount) || 0,
                tilesPerRow: Number(tilesPerRow) || 16,
                sheetWidth: sheetW,
                sheetHeight: sheetH,
                sheetPixels: sheetPx
              });
              setTileMapData({
                mapPresent: !!mapPresent,
                mapWidth: mapW,
                mapHeight: mapH,
                mapPixels: mapPx
              });
              setTileEditorStatus(String(status || 'Tile editor render complete.'));
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            } else if (type === 'unitTestResult') {
              const baseList = Array.isArray(tests) ? tests : [];
              const applyUnitTestReport = (items) => {
                const reportList = Array.isArray(items) ? items : [];
                const passCount = reportList.filter(t => !!t?.pass).length;
                const failCount = reportList.length - passCount;
                const totalCount = reportList.length;
                const summaryText = `Unit tests completed: ${passCount}/${Math.max(1, totalCount)} passed, ${failCount} failed.`;
                const failLines = reportList
                  .filter(t => !t?.pass)
                  .map(t => `FAIL - ${String(t?.name || 'Unknown')}${t?.info ? ': ' + String(t.info) : ''}`);
                const detailText = failLines.length > 0
                  ? `${summaryText}\nPassed ${passCount}/${Math.max(1, totalCount)} | Failed ${failCount}\n${failLines.join('\n')}`
                  : `${summaryText}\nPassed ${passCount}/${Math.max(1, totalCount)} | Failed ${failCount}`;
                setUnitTestResults(reportList);
                setUnitTestSummary({
                  passed: passCount,
                  failed: failCount,
                  total: totalCount
                });
                setUnitTestStatus(summaryText);
                if (failCount > 0) {
                  setSuccess('');
                  setError(`Unit Test Report\n${detailText}`);
                } else {
                  setError('');
                  setSuccess(`Unit Test Report\n${detailText}`);
                }
              };
              if (unitRuntimeTestBusyRef.current) {
                applyUnitTestReport(baseList);
                setIsProcessing(false); setProcessingText(''); setProgress(0);
                return;
              }
              unitRuntimeTestBusyRef.current = true;
              (async () => {
                try {
                  const runtimeFn = testWasmRuntimeCycleRef.current;
                  const runtimeCase = runtimeFn
                    ? await runtimeFn()
                    : { pass: false, name: 'WASM Bridge & Save-State Cycle', info: 'Runtime cycle test function is unavailable.' };
                  applyUnitTestReport([...baseList, runtimeCase]);
                } catch (err) {
                  applyUnitTestReport([
                    ...baseList,
                    { pass: false, name: 'WASM Bridge & Save-State Cycle', info: err?.message || String(err) }
                  ]);
                } finally {
                  unitRuntimeTestBusyRef.current = false;
                  setIsProcessing(false); setProcessingText(''); setProgress(0);
                }
              })();
              return;
            } else if (type === 'sceneFontSourceReady') {
              const readyRequestId = Number(requestId) || 0;
              if (readyRequestId > 0 && readyRequestId !== sceneFontSourceSeqRef.current) return;
              const readyOffset = Number(fontOffset) || 0;
              const readyBpp = Number(fontBpp) || 4;
              const readyMode = String(detectMode || 'auto');
              const readyScore = Number(detectScore) || 0;
              const variantLabel = String(detectVariant || 'default');
              const offsetHex = Number.isFinite(readyOffset) ? readyOffset.toString(16).toUpperCase() : '0';
              setSceneFontSourceMeta({
                offset: readyOffset,
                bpp: readyBpp,
                bytesPerTile: Number(bytesPerTile) || 32,
                detectVariant: variantLabel,
                detectScore: readyScore,
                detectMode: readyMode,
                romLength: Number(romLength) || 0
              });
              setFontPreviewStatus(`Dialog preview source ready: 0x${offsetHex} | ${readyBpp}bpp`);
            } else if (type === 'scenePreviewFrame') {
              const fw = Math.max(16, Number(frameWidth) || 640);
              const fh = Math.max(16, Number(frameHeight) || 360);
              const fp = safeUint8Clamped(framePixels, fw * fh * 4);
              setScenePreviewFrame({ width: fw, height: fh, pixels: fp });
              setFontPreviewLayout({
                lines: Array.isArray(previewLines) ? previewLines : [],
                overflow: !!previewOverflow,
                maxCols: Number(previewMaxCols) || 36,
                maxLines: Number(previewMaxLines) || 4,
                sourceLength: Number(previewSourceLength) || 0
              });
              setFontPreviewStatus(prev => prev || 'Internal font renderer frame updated.');
            } else if (type === 'error') {
              if (liveBuildPendingRef.current.size > 0) {
                for (const [requestId, pending] of liveBuildPendingRef.current.entries()) {
                  clearTimeout(pending.timerId);
                  try { pending.reject(new Error(String(message || 'Build worker error'))); } catch (_) { }
                  liveBuildPendingRef.current.delete(requestId);
                }
                liveBuildBusyRef.current = false;
                liveBuildQueuedRef.current = false;
              }
              console.error("Worker Error:", message, stack);
              extractionBufferRef.current = [];
              setPointerReplayRunning(false);
              const withStack = stack ? `${message}\nStack: ${stack}` : message;
              setError(formatActionableError('Worker Error', withStack));
              setIsProcessing(false); setProcessingText(''); setProgress(0);
            }
          } catch (err) {
            extractionBufferRef.current = [];
            setPointerReplayRunning(false);
            const safeMsg = err?.message || String(err);
            const safeStack = err?.stack ? `\nStack: ${String(err.stack)}` : '';
            const workerType = String(type || 'unknown');
            setError(formatActionableError('Bootstrap Error', `[${workerType}] ${safeMsg}${safeStack}`));
            setIsProcessing(false);
            setProcessingText('');
            setProgress(0);
          }
        };
        const handleWorkerError = (event, workerName) => {
          console.error(`${workerName} Error:`, event);
          const msg = event?.message || event?.data?.message || 'Unknown error';
          extractionBufferRef.current = [];
          setPointerReplayRunning(false);
          setError(formatActionableError(`${workerName} Error`, msg));
          setIsProcessing(false); setProcessingText(''); setProgress(0);
        };

        textExtractorWorker.current = createTextExtractorWorker();
        buildWorker.current = createBuildWorker();
        relativeSearchWorker.current = createRelativeSearchWorker();
        hexWorker.current = createHexWorker();
        translationInputWorker.current = createTranslationInputWorker();
        searchWorker.current = createSearchWorker();
        pointerWorker.current = createPointerWorker();
        romPreviewWorker.current = createRomPreviewWorker();
        tableWorker.current = createTableWorker();
        tileEditorWorker.current = createTileEditorWorker();
        unitTestWorker.current = createUnitTestWorker();
        scenePreviewWorker.current = createScenePreviewWorker();
        runtimeRamWorker.current = createRuntimeRamWorker();
        runtimeVizWorker.current = createRuntimeVizWorker();
        previewAssertWorker.current = createPreviewAssertWorker();
        textExtractorWorker.current.onmessage = handleWorkerMessage;
        buildWorker.current.onmessage = handleWorkerMessage;
        relativeSearchWorker.current.onmessage = handleWorkerMessage;
        hexWorker.current.onmessage = handleWorkerMessage;
        translationInputWorker.current.onmessage = handleWorkerMessage;
        searchWorker.current.onmessage = handleWorkerMessage;
        pointerWorker.current.onmessage = handleWorkerMessage;
        romPreviewWorker.current.onmessage = handleWorkerMessage;
        tableWorker.current.onmessage = handleWorkerMessage;
        tileEditorWorker.current.onmessage = handleWorkerMessage;
        unitTestWorker.current.onmessage = handleWorkerMessage;
        scenePreviewWorker.current.onmessage = handleWorkerMessage;
        if (runtimeRamWorker.current) runtimeRamWorker.current.onmessage = handleWorkerMessage;
        if (runtimeVizWorker.current) runtimeVizWorker.current.onmessage = handleWorkerMessage;
        if (previewAssertWorker.current) previewAssertWorker.current.onmessage = handleWorkerMessage;
        textExtractorWorker.current.onerror = (e) => handleWorkerError(e, 'Text Extractor Worker');
        textExtractorWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Text Extractor Worker');
        buildWorker.current.onerror = (e) => handleWorkerError(e, 'Build Worker');
        buildWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Build Worker');
        relativeSearchWorker.current.onerror = (e) => handleWorkerError(e, 'Generate Table Worker');
        relativeSearchWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Generate Table Worker');
        hexWorker.current.onerror = (e) => handleWorkerError(e, 'Hex Worker');
        hexWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Hex Worker');
        translationInputWorker.current.onerror = (e) => handleWorkerError(e, 'Translation Input Worker');
        translationInputWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Translation Input Worker');
        searchWorker.current.onerror = (e) => handleWorkerError(e, 'Search Worker');
        searchWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Search Worker');
        pointerWorker.current.onerror = (e) => handleWorkerError(e, 'Pointer Worker');
        pointerWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Pointer Worker');
        romPreviewWorker.current.onerror = (e) => handleWorkerError(e, 'ROM Preview Worker');
        romPreviewWorker.current.onmessageerror = (e) => handleWorkerError(e, 'ROM Preview Worker');
        tableWorker.current.onerror = (e) => handleWorkerError(e, 'Table Worker');
        tableWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Table Worker');
        tileEditorWorker.current.onerror = (e) => handleWorkerError(e, 'Tile Editor Worker');
        tileEditorWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Tile Editor Worker');
        unitTestWorker.current.onerror = (e) => handleWorkerError(e, 'Unit Test Worker');
        unitTestWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Unit Test Worker');
        scenePreviewWorker.current.onerror = (e) => handleWorkerError(e, 'Scene Preview Worker');
        scenePreviewWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Scene Preview Worker');
        if (runtimeRamWorker.current) {
          runtimeRamWorker.current.onerror = (e) => handleWorkerError(e, 'Runtime RAM Worker');
          runtimeRamWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Runtime RAM Worker');
        }
        if (runtimeVizWorker.current) {
          runtimeVizWorker.current.onerror = (e) => handleWorkerError(e, 'Runtime Viz Worker');
          runtimeVizWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Runtime Viz Worker');
        }
        if (previewAssertWorker.current) {
          previewAssertWorker.current.onerror = (e) => handleWorkerError(e, 'Preview Assert Worker');
          previewAssertWorker.current.onmessageerror = (e) => handleWorkerError(e, 'Preview Assert Worker');
        }

        return () => {
          previewAssertPendingRef.current.forEach((pending) => {
            try { pending.reject(new Error('Preview assert worker was terminated.')); } catch (_) { }
          });
          previewAssertPendingRef.current.clear();
          liveSaveStatePendingRef.current.forEach((pending) => {
            clearTimeout(pending.timerId);
            try { pending.reject(new Error('Runtime save-state request was cancelled.')); } catch (_) { }
          });
          liveSaveStatePendingRef.current.clear();
          runtimeLoadPendingRef.current.forEach((pending) => {
            clearTimeout(pending.timerId);
            try { pending.reject(new Error('Runtime load request was cancelled.')); } catch (_) { }
          });
          runtimeLoadPendingRef.current.clear();
          liveBuildPendingRef.current.forEach((pending) => {
            clearTimeout(pending.timerId);
            try { pending.reject(new Error('Live build request was cancelled.')); } catch (_) { }
          });
          liveBuildPendingRef.current.clear();
          liveBuildBusyRef.current = false;
          liveBuildQueuedRef.current = false;
          if (textExtractorWorker.current) textExtractorWorker.current.terminate();
          if (buildWorker.current) buildWorker.current.terminate();
          if (relativeSearchWorker.current) relativeSearchWorker.current.terminate();
          if (hexWorker.current) hexWorker.current.terminate();
          if (translationInputWorker.current) translationInputWorker.current.terminate();
          if (searchWorker.current) searchWorker.current.terminate();
          if (pointerWorker.current) pointerWorker.current.terminate();
          if (romPreviewWorker.current) romPreviewWorker.current.terminate();
          if (tableWorker.current) tableWorker.current.terminate();
          if (tileEditorWorker.current) tileEditorWorker.current.terminate();
          if (unitTestWorker.current) unitTestWorker.current.terminate();
          if (scenePreviewWorker.current) scenePreviewWorker.current.terminate();
          if (runtimeRamWorker.current) runtimeRamWorker.current.terminate();
          if (runtimeVizWorker.current) runtimeVizWorker.current.terminate();
          if (previewAssertWorker.current) previewAssertWorker.current.terminate();
          pendingRuntimeLoadRef.current = null;
          runtimeRemountSyncRef.current = false;
        };
      }, [parseAndSetTable, formatActionableError, workerEpoch]);

      useEffect(() => {
        const handler = setTimeout(() => { setDebouncedSearchTerm(searchTerm); }, 300);
        return () => clearTimeout(handler);
      }, [searchTerm]);

      useEffect(() => {
        allTextsRef.current = allTexts;
        const liveMap = liveSyncTextsRef.current instanceof Map ? liveSyncTextsRef.current : new Map();
        const appliedMap = liveAppliedTextsRef.current instanceof Map ? liveAppliedTextsRef.current : new Map();
        const byId = new Map();
        for (let i = 0; i < allTexts.length; i++) {
          const row = allTexts[i];
          const rowId = Number(row?.id);
          if (!Number.isFinite(rowId)) continue;
          const liveRow = liveMap.get(rowId) || appliedMap.get(rowId) || null;
          if (liveRow && String(liveRow?.translatedText || '').trim()) {
            byId.set(rowId, { ...row, translatedText: String(liveRow.translatedText || '') });
          } else {
            byId.set(rowId, row);
          }
        }
        allTextsByIdRef.current = byId;
      }, [allTexts]);

      useEffect(() => {
        liveSyncTextsRef.current = new Map();
        liveAppliedTextsRef.current = new Map();
        liveRuntimeRomRef.current = null;
      }, [romData, tableData]);

      useEffect(() => {
        romDataRef.current = romData;
      }, [romData]);

      useEffect(() => {
        tableDataRef.current = tableData;
      }, [tableData]);

      useEffect(() => {
        systemInfoRef.current = systemInfo;
      }, [systemInfo]);

      useEffect(() => {
        debouncedSearchTermRef.current = debouncedSearchTerm;
      }, [debouncedSearchTerm]);

      useEffect(() => {
        if (!searchWorker.current || !shouldUseSearchWorker) {
          searchIndexReadyRef.current = false;
          return;
        }
        searchIndexReadyRef.current = false;
        searchSeqRef.current = 0;
        const lightweightItems = allTexts.map(item => ({
          id: item.id,
          originalText: item.originalText || '',
          translatedText: item.translatedText || '',
          offset: item.offset || ''
        }));
        try {
          searchWorker.current.postMessage({ type: 'initSearchIndex', payload: { items: lightweightItems } });
        } catch (_) {
          searchIndexReadyRef.current = false;
        }
      }, [allTexts, shouldUseSearchWorker, searchIndexEpoch]);

      useEffect(() => {
        if (!isProcessing) {
          processingStartRef.current = 0;
          setProcessingElapsedSec(0);
          return;
        }
        if (!processingStartRef.current) processingStartRef.current = Date.now();
        const timer = setInterval(() => {
          const elapsed = Math.max(0, Math.floor((Date.now() - processingStartRef.current) / 1000));
          setProcessingElapsedSec(elapsed);
        }, 500);
        return () => clearInterval(timer);
      }, [isProcessing]);

      useEffect(() => {
        if (allTexts.length === 0 && !debouncedSearchTerm) { setFilteredTexts(prev => (prev.length === 0 ? prev : [])); return; }
        if (allTexts.length > 0) {
          if (!debouncedSearchTerm.trim()) {
            setFilteredTexts(prev => (prev.length === 0 ? prev : []));
            return;
          }
          if (shouldUseSearchWorker && searchWorker.current && searchIndexReadyRef.current) {
            const reqId = ++searchSeqRef.current;
            try {
              searchWorker.current.postMessage({ type: 'runSearch', payload: { term: debouncedSearchTerm, requestId: reqId } });
            } catch (_) {
              // Fallback to local filtering below when worker message fails.
            }
            return;
          }
          const normalizeSearchable = (value) => String(value || '')
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          const lowerTerm = debouncedSearchTerm.toLowerCase();
          const normalizedTerm = normalizeSearchable(debouncedSearchTerm);
          setFilteredTexts(allTexts.filter((text) => {
            const original = String(text.originalText || '').toLowerCase();
            const translated = String(text.translatedText || '').toLowerCase();
            const offset = String(text.offset || '').toLowerCase();
            if (original.includes(lowerTerm) || translated.includes(lowerTerm) || offset.includes(lowerTerm)) return true;
            if (!normalizedTerm) return false;
            const normalizedOriginal = normalizeSearchable(text.originalText);
            const normalizedTranslated = normalizeSearchable(text.translatedText);
            return normalizedOriginal.includes(normalizedTerm) || normalizedTranslated.includes(normalizedTerm);
          }));
          setCurrentPage(1);
        }
      }, [debouncedSearchTerm, allTexts, shouldUseSearchWorker]);

      useEffect(() => { document.documentElement.style.setProperty('--app-zoom', zoom.toString()); }, [zoom]);

      const { tokenizer, masterCharToHex } = useMemo(() => {
        if (!tableData) return { tokenizer: null, masterCharToHex: new Map() };
        const newMasterMap = new Map();
        const allTokens = [];
        const hasMultiByte = !!tableData.hasMultiByte || (tableData.multiByte && Object.keys(tableData.multiByte).length > 0);
        const isMultiByteMode = hasMultiByte || options.usePaddingByte;

        const processMap = (map, isMultiByte = false) => {
          Object.entries(map).forEach(([key, rawChar]) => {
            let char = typeof rawChar === 'string' ? rawChar : String(rawChar ?? '');
            const upperChar = char.toUpperCase();
            if (upperChar === '[SPACE]') char = ' ';
            const isLineToken = upperChar === '[LINE]' || upperChar === '[NEWLINE]';
            const isBracketToken = char.startsWith('[') && char.endsWith(']');
            if (char.length > 0 && (!isBracketToken || isMultiByteMode || isLineToken)) {
              allTokens.push(char);
            }
            const bytes = isMultiByte
              ? key.match(/.{1,2}/g).map(h => parseInt(h, 16))
              : [parseInt(key, 10)];
            const byteArray = new Uint8Array(bytes);
            newMasterMap.set(char, byteArray);
            if (upperChar === '[SPACE]') newMasterMap.set(' ', byteArray);
          });
        };

        if (tableData.singleByte) processMap(tableData.singleByte, false);
        if (tableData.multiByte) processMap(tableData.multiByte, true);

        return { tokenizer: createTokenizer(allTokens), masterCharToHex: newMasterMap };
      }, [tableData, options.usePaddingByte]);

      const getTranslatedByteLength = useCallback((text) => {
        if (!tableData || !tokenizer) return 0;
        return getSmartByteLength(text, tokenizer, masterCharToHex, options.usePaddingByte)
      }, [tokenizer, masterCharToHex, tableData, options.usePaddingByte]);

      const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
      const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
      const handleZoomReset = () => setZoom(1);
      const cancelCurrentOperation = useCallback(() => {
        if (!isProcessing) return;
        setIsProcessing(false);
        setProcessingText('');
        setProgress(0);
        extractionBufferRef.current = [];
        setPointerReplayRunning(false);
        setWorkerEpoch(prev => prev + 1);
        setError('Operation cancelled by user. You can retry safely.');
      }, [isProcessing]);

      const renderTaskButton = useCallback((config) => {
        const {
          label,
          token = '',
          onClick,
          disabled = false,
          className = 'btn',
          cancelLabel = 'Cancel'
        } = config || {};
        const active = isProcessing && token && String(processingText || '').toLowerCase().includes(String(token).toLowerCase());
        if (active) {
          return e('button', {
            className: `${className} btn-danger`,
            onClick: cancelCurrentOperation,
            disabled: false
          }, cancelLabel);
        }
        return e('button', {
          className,
          onClick,
          disabled: !!disabled || !!isProcessing
        }, label);
      }, [isProcessing, processingText, cancelCurrentOperation]);

      const readRomFileData = useCallback(async (file, onProgress) => {
        if (!file) throw new Error("No ROM file selected.");
        if (file.size <= LARGE_ROM_STREAM_THRESHOLD) {
          const data = new Uint8Array(await file.arrayBuffer());
          if (typeof onProgress === 'function') onProgress(70);
          return data;
        }
        const merged = new Uint8Array(file.size);
        let offset = 0;
        while (offset < file.size) {
          const end = Math.min(file.size, offset + ROM_STREAM_CHUNK_SIZE);
          const chunkBuffer = await file.slice(offset, end).arrayBuffer();
          const chunk = new Uint8Array(chunkBuffer);
          merged.set(chunk, offset);
          offset += chunk.length;
          if (typeof onProgress === 'function') {
            const ratio = offset / file.size;
            onProgress(35 + Math.floor(ratio * 35));
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return merged;
      }, [LARGE_ROM_STREAM_THRESHOLD, ROM_STREAM_CHUNK_SIZE]);

      const resetStateForNewRom = useCallback(() => {
        sessionStorage.removeItem('pocketTranslateSession'); // Clear session on new ROM
        setRomData(null); setOriginalRomData(null);
        setAllTexts([]); setFilteredTexts([]); setModifiedRom(null);
        setTableData(null); setTableContent(''); setError('');
        setSuccess(''); setActiveTab('extraction'); setProgress(0);
        setHexRows([]); setHexMatches([]); setHexStatus('Load a ROM to start hex analysis.');
        setHexViewStart('0x000000'); setHexViewLength(4096); setHexViewColumns(16); setHexRowLimit(1024); setHexSearchHex('');
        setHexWindowStart(0); setHexWindowEnd(0); setHexTotalBytes(0);
        setHexSelectedOffset(null); setHexSelectedValue('');
        setHexMatchLength(1); setHexNibbleBuffer('');
        setHexUndoStack([]); setHexRedoStack([]); setHexBookmarks([]); setHexAsciiMode('ascii'); setHexCustomTableData(null); setHexCustomTableName('');
        setPointerStatus('Select a byte to inspect pointers.'); setPointerMatches([]); setPointerTargetOffset(null);
        setPointerLabOffsetInput(''); setPointerLabTextId(''); setLiveEditMode(true);
        setPointerGroups([]); setSelectedPointerGroupId(''); setPointerGroupName(''); setPointerGroupNotes('');
        setPointerRuleTemplateKey('Auto'); setPointerRuleOverride({ minPointers: '', minConfidence: '', containerGap: '', coverageThreshold: '' });
        setPointerGateEnabled(true); setPointerGateMode('advisory'); setPointerValidationReport(''); setPointerReplayRunning(false);
        setSelectedTextId(null); setSceneSpeakerName(''); setContainerMapEnabled(false);
        setSegmentConfidenceThreshold(0);
        setRomPreviewData(null); setRomPreviewStatus('ROM tile preview idle.'); setRomPreviewMode('auto'); setRomPreviewOffsetInput(''); setRomPreviewAutoRefresh(true);
        setRuntimeRamData(null); setRuntimeRamName(''); setRuntimeRamHits([]); setRuntimeRamStatus('Load a RAM dump to inspect live dialogue buffers.');
        setRuntimeDomainSystem('auto');
        setRuntimeDomainDump(null); setRuntimeDomainName(''); setRuntimeVizData(null); setRuntimeVizStatus('Load a VRAM/PPU dump to render off-main-thread preview.');
        setControlCodeDict({ aliases: {}, ignoreTokens: [] });
        setHexPointerHighlights([]);
        extractionBufferRef.current = [];
        setHasUnsavedChanges(false);
      }, []);

      const handleFileUpload = useCallback(async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        if (hasUnsavedChanges && !window.confirm("You have unsaved changes that will be lost. Are you sure you want to load a new ROM?")) {
          event.target.value = '';
          return;
        }
        resetStateForNewRom();
        setIsProcessing(true); setProcessingText('Analyzing ROM...'); setProgress(30);
        try {
          const data = await readRomFileData(file, (nextProgress) => {
            const clamped = Math.max(30, Math.min(70, Number(nextProgress) || 30));
            setProgress(clamped);
          });
          setProgress(70);
          const { system, method } = detectSystem(file.name, data);
          const romInfo = { name: file.name, size: file.size, data, system };
          setRomData(romInfo);
          setOriginalRomData({ ...romInfo, data: new Uint8Array(data) });
          setSystemInfo(system);
          setSuccess(`ROM Loaded: ${file.name} (${Math.round(file.size / 1024)}KB)\nSystem: ${system.name} (Detected via ${method})`);
          setHasUnsavedChanges(true); // Mark as changed now
        } catch (err) {
          setError(`ROM Load Error: ${err.message}`);
        } finally { setIsProcessing(false); setProcessingText(''); setProgress(0); if (event.target) event.target.value = ''; }
      }, [resetStateForNewRom, hasUnsavedChanges, readRomFileData]);

      const handleTableLoad = useCallback(async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        setIsProcessing(true); setProcessingText('Loading table...'); setProgress(50);
        try {
          const content = await file.text();
          const normalized = ensureControlTokensInContent(content, 'auto');
          setTableContent(normalized.content);
          parseAndSetTable(normalized.content, file.name);
          if (normalized.addedTokens.length > 0) {
            setSuccess(`Table Loaded: ${file.name} (auto-added: ${normalized.addedTokens.join(', ')})`);
          } else {
            setSuccess(`Table Loaded: ${file.name}`);
          }
        } catch (err) {
          setError(`Table Load Error: ${err.message}`);
        } finally { setIsProcessing(false); setProcessingText(''); setProgress(0); if (event.target) event.target.value = ''; }
      }, [parseAndSetTable, ensureControlTokensInContent]);

      const handleTableContentChange = (e) => {
        const content = e.target.value;
        setTableContent(content);
        if (tableEditTimerRef.current) clearTimeout(tableEditTimerRef.current);
        tableEditTimerRef.current = setTimeout(() => {
          parseAndSetTable(content, "edited.tbl");
        }, 220);
      };

      const handleTableDownload = () => {
        if (!tableContent) return;
        const blob = new Blob([tableContent], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = "table.tbl";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      };

      const handleProjectExport = useCallback(() => {
        const snapshot = stateToSave.current;
        if (!snapshot?.romData) {
          setError('No active project to export. Load ROM/table first.');
          return;
        }
        try {
          const replacer = (key, value) => {
            if (value instanceof Uint8Array) return { type: 'Uint8Array', data: { ...value } };
            if (value instanceof Map) return { type: 'Map', data: Array.from(value.entries()) };
            return value;
          };
          const json = JSON.stringify(snapshot, replacer, 2);
          const baseName = (romData?.name || 'pockettranslate_project').split('.')[0];
          const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${baseName}.ptproj`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          setSuccess(`Project exported: ${baseName}.ptproj`);
        } catch (err) {
          setError(formatActionableError('Export Project Failed', err?.message || String(err)));
        }
      }, [romData, formatActionableError]);

      const handleProjectImport = useCallback(async (event) => {
        const file = event?.target?.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object' || !parsed.romData) {
            throw new Error('Invalid project file format.');
          }
          sessionStorage.setItem('pocketTranslateSession', text);
          setSuccess('Project imported. Reloading workspace...');
          setTimeout(() => window.location.reload(), 120);
        } catch (err) {
          setError(formatActionableError('Import Project Failed', err?.message || String(err)));
        } finally {
          if (event?.target) event.target.value = '';
        }
      }, [formatActionableError]);

      useEffect(() => {
        return () => {
          if (tableEditTimerRef.current) clearTimeout(tableEditTimerRef.current);
        };
      }, []);

      const parseNumericInput = useCallback((value, fallback = 0) => {
        const text = String(value ?? '').trim();
        if (!text) return fallback;
        if (/^0x[0-9a-f]+$/i.test(text)) {
          const parsed = parseInt(text, 16);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        if (/^[0-9a-f]+h$/i.test(text)) {
          const parsed = parseInt(text.slice(0, -1), 16);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        if (/^[0-9]+$/i.test(text)) {
          const parsed = parseInt(text, 10);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        if (/^[0-9a-f]+$/i.test(text) && /[a-f]/i.test(text)) {
          const parsed = parseInt(text, 16);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
      }, []);

      const normalizeControlToken = useCallback((token) => {
        const source = token === '\n' ? '[LINE]' : String(token || '');
        const aliases = controlCodeDict?.aliases && typeof controlCodeDict.aliases === 'object' ? controlCodeDict.aliases : {};
        const exact = aliases[source];
        const upperSource = source.toUpperCase();
        const upperExact = aliases[upperSource];
        const mapped = exact ?? upperExact ?? source;
        if (/^\[[^\]]+\]$/.test(mapped)) return mapped.toUpperCase();
        if (mapped === '/') return '[LINE]';
        return mapped;
      }, [controlCodeDict]);

      const controlIgnoreSet = useMemo(() => {
        const base = Array.isArray(controlCodeDict?.ignoreTokens) ? controlCodeDict.ignoreTokens : [];
        return new Set(base.map(v => normalizeControlToken(v)));
      }, [controlCodeDict, normalizeControlToken]);

      const handleSearchTermInput = useCallback((event) => {
        const inputEl = event?.target || null;
        const nextValue = String(inputEl?.value ?? '');
        if (inputEl) recordSearchSelection(inputEl);
        setSearchTerm(nextValue);
        if (shouldUseSearchWorker && searchWorker.current && searchIndexReadyRef.current) {
          const reqId = ++searchSeqRef.current;
          try {
            searchWorker.current.postMessage({ type: 'runSearch', payload: { term: nextValue, requestId: reqId } });
          } catch (_) { }
        }
      }, [recordSearchSelection, shouldUseSearchWorker]);

      const queueTranslationUpdate = useCallback((textId, newTranslation, flush = false) => {
        const id = Number(textId);
        if (!Number.isFinite(id)) return;
        const value = String(newTranslation || '');
        const byId = allTextsByIdRef.current instanceof Map ? allTextsByIdRef.current : new Map();
        const prevRow = byId.get(id) || { id, originalText: '', translatedText: '' };
        const nextRow = { ...prevRow, id, translatedText: value };
        byId.set(id, nextRow);
        allTextsByIdRef.current = byId;
        if (!value.trim()) {
          liveSyncTextsRef.current.delete(id);
          liveAppliedTextsRef.current.delete(id);
        } else {
          liveSyncTextsRef.current.set(id, nextRow);
        }
        if (translationInputWorker.current) {
          try {
            translationInputWorker.current.postMessage({
              type: flush ? 'flushTranslationUpdate' : 'queueTranslationUpdate',
              payload: {
                textId: id,
                newTranslation: value,
                delayMs: 180
              }
            });
            return;
          } catch (_) { }
        }
        setAllTexts((currentTexts) => {
          const idx = currentTexts.findIndex(text => text.id === id);
          if (idx < 0) return currentTexts;
          const prev = currentTexts[idx];
          if ((prev?.translatedText || '') === value) return currentTexts;
          const next = currentTexts.slice();
          next[idx] = { ...prev, translatedText: value };
          return next;
        });
        setHasUnsavedChanges(true);
      }, []);

      const handleLiveDraftChange = useCallback((textId, draft) => {
        const id = Number(textId);
        if (!Number.isFinite(id)) return;
        setSelectedTextId(id);
        setSelectedLiveDraft(String(draft || ''));
      }, []);

      const selectedPreviewText = useMemo(() => {
        const numericId = Number(selectedTextId);
        const selectedEntry = Number.isFinite(numericId)
          ? (allTextsByIdRef.current.get(numericId) || null)
          : null;
        const previewEntry = selectedEntry || (allTexts.length > 0 ? allTexts[0] : null);
        if (!previewEntry) return '';
        const draft = String(selectedLiveDraft || '');
        if (draft.length > 0) return draft;
        const translated = String(previewEntry.translatedText || '');
        if (translated.length > 0) return translated;
        return String(previewEntry.originalText || '');
      }, [allTexts, selectedTextId, selectedLiveDraft]);

      const wasmPreviewAspectRatio = useMemo(() => {
        const sys = String(systemInfo?.name || '').toUpperCase();
        if (sys.includes('GBA')) return '3 / 2';
        if (sys.includes('NES') || sys.includes('SNES') || sys.includes('GENESIS')) return '4 / 3';
        if (sys.includes('GAME BOY') || sys.includes('GBC') || sys === 'GB') return '10 / 9';
        return '16 / 9';
      }, [systemInfo]);

      const fontPreviewAspectRatio = useMemo(() => {
        const boxW = Math.max(320, Math.min(960, Number(fontPreviewBoxWidth) || 640));
        const lineH = Math.max(10, Math.min(42, Number(fontPreviewLineHeight) || 19));
        const pad = Math.max(6, Math.min(72, Number(fontPreviewPadding) || 18));
        const sourceText = String(selectedPreviewText || '');
        const approxMaxCols = Math.max(
          28,
          Math.min(
            64,
            Math.floor(
              (boxW - (pad * 2) - 24) /
              Math.max(7, (lineH * 0.55))
            )
          )
        );
        const estimatedLines = sourceText.split('\n').reduce((acc, seg) => {
          const len = Math.max(0, String(seg || '').length);
          return acc + Math.max(1, Math.ceil(len / approxMaxCols));
        }, 0);
        const previewLines = Math.max(3, Math.min(12, estimatedLines || 1));
        const dialogH = Math.max(104, Math.min(360, (lineH * previewLines) + (pad * 2) + 24));
        const ratio = boxW / Math.max(1, dialogH);
        const clamped = Math.max(1.35, Math.min(4.2, ratio));
        return `${clamped.toFixed(2)} / 1`;
      }, [fontPreviewBoxWidth, fontPreviewLineHeight, fontPreviewPadding, selectedPreviewText]);

      const fontPreviewWarning = useMemo(() => '', []);

      const pushFontPreviewBackgroundToWorker = useCallback((bgSource) => {
        if (!scenePreviewWorker.current) return;
        if (bgSource && bgSource.pixels instanceof Uint8ClampedArray) {
          const pixelsBuffer = bgSource.pixels.slice().buffer;
          scenePreviewWorker.current.postMessage({
            type: 'setSceneBackground',
            payload: {
              background: {
                width: Number(bgSource.width) || 0,
                height: Number(bgSource.height) || 0,
                pixelsBuffer
              }
            }
          }, [pixelsBuffer]);
          return;
        }
        scenePreviewWorker.current.postMessage({ type: 'setSceneBackground', payload: { background: null } });
      }, []);

      const handleFontBackgroundUpload = useCallback(async (event) => {
        try {
          const file = event?.target?.files?.[0];
          if (!file) return;
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read image file.'));
            reader.readAsDataURL(file);
          });
          const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to decode image.'));
            img.src = dataUrl;
          });
          const srcW = Math.max(1, Number(image.naturalWidth || image.width) || 1);
          const srcH = Math.max(1, Number(image.naturalHeight || image.height) || 1);
          const capW = Math.min(1280, srcW);
          const capH = Math.min(720, srcH);
          const canvas = document.createElement('canvas');
          canvas.width = capW;
          canvas.height = capH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('Canvas context is unavailable.');
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, capW, capH);
          ctx.drawImage(image, 0, 0, srcW, srcH, 0, 0, capW, capH);
          const imageData = ctx.getImageData(0, 0, capW, capH);
          const pixels = new Uint8ClampedArray(imageData.data);
          const bgRecord = {
            name: file.name || 'dialog_background',
            width: capW,
            height: capH,
            dataUrl,
            pixels
          };
          fontPreviewBackgroundRef.current = bgRecord;
          setFontPreviewBackgroundMeta({ name: bgRecord.name, width: capW, height: capH, dataUrl });
          pushFontPreviewBackgroundToWorker(bgRecord);
          setFontPreviewStatus(`Custom dialog background loaded: ${bgRecord.name} (${capW}x${capH}).`);
        } catch (err) {
          setError(`Custom dialog background load failed: ${err?.message || String(err)}`);
        } finally {
          if (event?.target) event.target.value = '';
        }
      }, [pushFontPreviewBackgroundToWorker]);

      const clearFontPreviewBackground = useCallback(() => {
        fontPreviewBackgroundRef.current = null;
        setFontPreviewBackgroundMeta(null);
        pushFontPreviewBackgroundToWorker(null);
        setFontPreviewStatus('Custom dialog background cleared.');
      }, [pushFontPreviewBackgroundToWorker]);

      const refreshScenePreviewLayout = useCallback(() => {
        if (!scenePreviewWorker.current) return;
        const widthPx = Math.max(480, Math.min(960, Number(fontPreviewBoxWidth) || 640));
        const linePx = Math.max(12, Math.min(36, Number(fontPreviewLineHeight) || 19));
        const padPx = Math.max(8, Math.min(64, Number(fontPreviewPadding) || 18));
        const sourceText = String(selectedPreviewText || '');
        const sourceCols = Math.max(
          28,
          Math.min(
            64,
            Math.floor(
              (widthPx - (padPx * 2) - 24) /
              Math.max(7, (linePx * 0.55))
            )
          )
        );
        const estimatedLines = sourceText.split('\n').reduce((acc, seg) => {
          const len = Math.max(0, String(seg || '').length);
          return acc + Math.max(1, Math.ceil(len / sourceCols));
        }, 0);
        const dynamicMaxLines = Math.max(3, Math.min(12, estimatedLines || 1));
        const fontFrameHeight = Math.max(104, Math.min(420, (linePx * dynamicMaxLines) + (padPx * 2) + 24));
        const payload = {
          text: selectedPreviewText || '',
          mode: scenePreviewMode === 'wasm' ? 'wasm' : 'font',
          width: widthPx,
          height: scenePreviewMode === 'wasm' ? 360 : fontFrameHeight,
          maxCols: scenePreviewMode === 'wasm' ? 34 : sourceCols,
          maxLines: scenePreviewMode === 'wasm' ? 4 : dynamicMaxLines,
          lineHeight: linePx,
          padding: padPx,
          backgroundMeta: fontPreviewBackgroundMeta
        };
        const transfer = [];
        const bgSource = fontPreviewBackgroundRef.current;
        if (scenePreviewMode === 'font' && bgSource && bgSource.pixels instanceof Uint8ClampedArray) {
          const pixelsBuffer = bgSource.pixels.slice().buffer;
          payload.background = {
            width: Number(bgSource.width) || 0,
            height: Number(bgSource.height) || 0,
            pixelsBuffer
          };
          transfer.push(pixelsBuffer);
        }
        scenePreviewWorker.current.postMessage({ type: 'renderSceneFrame', payload }, transfer);
      }, [selectedPreviewText, scenePreviewMode, fontPreviewBoxWidth, fontPreviewLineHeight, fontPreviewPadding, fontPreviewBackgroundMeta]);

      const getWasmCoreForSystem = useCallback((name) => {
        const systemName = String(name || 'Unknown');
        const coreBySystem = {
          'NES': 'fceumm',
          'SNES': 'snes9x',
          'Game Boy': 'gambatte',
          'GBC': 'sameboy',
          'GBA': 'mgba',
          'Sega Genesis/MD': 'genesis_plus_gx',
          'Genesis': 'genesis_plus_gx',
          'NDS': 'desmume',
          'PlayStation 1': 'pcsx_rearmed'
        };
        return coreBySystem[systemName] || 'generic';
      }, []);

      const normalizeRuntimeCoreAlias = useCallback((value) => {
        const v = String(value || '').trim().toLowerCase();
        if (!v) return '';
        if (v === 'mgba' || v === 'gba' || v === 'gpsp') return 'gba';
        if (v === 'fceumm' || v === 'nestopia' || v === 'nes') return 'nes';
        if (v === 'snes9x' || v === 'mesen-s' || v === 'snes') return 'snes';
        if (v === 'gambatte' || v === 'sameboy' || v === 'gb') return 'gb';
        if (v === 'genesis_plus_gx' || v === 'segamd' || v === 'genesis') return 'genesis';
        if (v === 'desmume' || v === 'melonds' || v === 'nds') return 'nds';
        if (v === 'pcsx_rearmed' || v === 'swanstation' || v === 'psx' || v === 'ps1') return 'ps1';
        return v;
      }, []);

      const postRomToWasmRuntime = useCallback((force = false) => {
        if (scenePreviewMode !== 'wasm') return false;
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow || !romData?.data) return false;
        const systemName = String(systemInfo?.name || 'Unknown');
        const core = getWasmCoreForSystem(systemName);
        const rom = romData.data;
        const key = `${systemName}:${core}:${rom.length}:${Number(rom[0] || 0)}:${Number(rom[1] || 0)}`;
        if (!force && wasmRuntimeBootRef.current.key === key) return true;
        if (wasmRuntimeBootRef.current.pending) return false;
        const willRebootCore = force || wasmRuntimeBootRef.current.key !== key;
        try {
          wasmRuntimeBootRef.current.pending = true;
          if (willRebootCore) wasmCoreReadyRef.current = false;
          const romBuffer = rom.buffer.slice(0);
          runtimeWindow.postMessage({
            source: 'pockettranslate',
            type: 'pt-runtime-load-rom',
            payload: {
              system: systemName,
              core,
              romBuffer
            }
          }, '*');
          wasmRuntimeBootRef.current.key = key;
          setWasmPreviewStatus(`WASM core boot requested (${systemName} -> ${core}).`);
          return true;
        } catch (err) {
          wasmRuntimeBootRef.current.pending = false;
          setWasmPreviewStatus(`WASM core boot request failed: ${err?.message || String(err)}`);
          return false;
        }
      }, [scenePreviewMode, romData, systemInfo, getWasmCoreForSystem]);

      const postSceneToWasmRuntime = useCallback((textOverride = null) => {
        if (scenePreviewMode !== 'wasm') return false;
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return false;
        if (!runtimeRemountSyncRef.current) postRomToWasmRuntime(false);
        const systemName = String(systemInfo?.name || 'Unknown');
        const core = getWasmCoreForSystem(systemName);
        const widthPx = Math.max(480, Math.min(960, Number(fontPreviewBoxWidth) || 640));
        const linePx = Math.max(12, Math.min(36, Number(fontPreviewLineHeight) || 19));
        const padPx = Math.max(8, Math.min(64, Number(fontPreviewPadding) || 18));
        wasmPreviewFrameSeqRef.current += 1;
        const payload = {
          frameId: wasmPreviewFrameSeqRef.current,
          text: textOverride == null ? String(selectedPreviewText || '') : String(textOverride || ''),
          system: systemName,
          core,
          width: widthPx,
          height: 360,
          maxCols: 34,
          maxLines: 4,
          lineHeight: linePx,
          padding: padPx
        };
        try {
          runtimeWindow.postMessage({ type: 'pt-runtime-scene', source: 'pockettranslate', payload }, '*');
          return true;
        } catch (_) {
          return false;
        }
      }, [scenePreviewMode, systemInfo, selectedPreviewText, getWasmCoreForSystem, postRomToWasmRuntime, fontPreviewBoxWidth, fontPreviewLineHeight, fontPreviewPadding]);

      const handleStartWasmPreview = useCallback(() => {
        const systemName = String(systemInfo?.name || 'Unknown');
        const core = getWasmCoreForSystem(systemName);
        const params = new URLSearchParams({
          system: systemName,
          core,
          ts: String(Date.now())
        });
        wasmRuntimeBootRef.current = { key: '', pending: false };
        wasmCoreReadyRef.current = false;
        setShowWasmRuntimeReport(true);
        setWasmPreviewUrl(`./wasm-runtime/index.html?${params.toString()}`);
        setWasmPreviewStatus(`WASM runtime slot started (${systemName} -> ${core}).`);
        const heavySystems = new Set(['NDS', 'Nintendo 3DS', 'Nintendo 64', 'PlayStation Portable', 'PlayStation 1']);
        setWasmPreviewWarning(heavySystems.has(systemName) ? 'This system is heavy in browser runtime. Use Internal Font Renderer for stable editing.' : '');
        refreshScenePreviewLayout();
      }, [systemInfo, refreshScenePreviewLayout, getWasmCoreForSystem]);

      const buildLiveTextsSnapshot = useCallback((mode = 'selected-only', override = null) => {
        const overrideId = Number(override?.selectedId);
        const selectedId = Number.isFinite(overrideId) ? overrideId : Number(selectedTextId);
        const draftText = String(
          override && Object.prototype.hasOwnProperty.call(override, 'draftText')
            ? (override?.draftText || '')
            : (selectedLiveDraft || '')
        );
        const sourceById = new Map();
        const sourceRows = Array.isArray(allTextsRef.current) ? allTextsRef.current : [];
        for (let i = 0; i < sourceRows.length; i++) {
          const row = sourceRows[i];
          const rowId = Number(row?.id);
          if (!Number.isFinite(rowId)) continue;
          sourceById.set(rowId, row);
        }
        if (allTextsByIdRef.current instanceof Map) {
          allTextsByIdRef.current.forEach((row, rowIdRaw) => {
            const rowId = Number(rowIdRaw);
            if (!Number.isFinite(rowId) || sourceById.has(rowId)) return;
            sourceById.set(rowId, row);
          });
        }
        const persistedMap = (liveSyncTextsRef.current instanceof Map) ? liveSyncTextsRef.current : new Map();
        const appliedMap = (liveAppliedTextsRef.current instanceof Map) ? liveAppliedTextsRef.current : new Map();
        const translatedById = new Map();
        const writeTranslated = (rowLike, textOverride = null) => {
          const row = rowLike && typeof rowLike === 'object' ? rowLike : null;
          const rowId = Number(row?.id);
          if (!Number.isFinite(rowId)) return;
          const translated = textOverride === null ? String(row?.translatedText || '') : String(textOverride || '');
          if (!translated.trim()) {
            translatedById.delete(rowId);
            return;
          }
          translatedById.set(rowId, translated);
        };
        appliedMap.forEach((row, id) => {
          writeTranslated({ ...(row || {}), id: Number(id) }, String(row?.translatedText || ''));
        });
        persistedMap.forEach((row, id) => {
          writeTranslated({ ...(row || {}), id: Number(id) }, String(row?.translatedText || ''));
        });
        if (Number.isFinite(selectedId)) {
          if (String(draftText || '').trim()) {
            writeTranslated({ id: selectedId }, draftText);
          } else if (override && Object.prototype.hasOwnProperty.call(override, 'draftText')) {
            translatedById.delete(selectedId);
          }
        }
        if (mode === 'full') {
          const rows = Array.from(sourceById.values()).map((row) => ({
            ...row,
            id: Number(row?.id),
            translatedText: String(row?.translatedText || '')
          }));
          for (let i = 0; i < rows.length; i++) {
            const rowId = Number(rows[i]?.id);
            if (!Number.isFinite(rowId)) continue;
            if (translatedById.has(rowId)) rows[i].translatedText = translatedById.get(rowId);
          }
          translatedById.forEach((translatedText, rowId) => {
            if (sourceById.has(rowId)) return;
            const persisted = persistedMap.get(rowId) || appliedMap.get(rowId) || { id: rowId, originalText: '', translatedText: '' };
            rows.push({ ...persisted, id: rowId, translatedText });
          });
          if (rows.length > 1) rows.sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
          return rows;
        }
        if (Number.isFinite(selectedId) && translatedById.has(selectedId)) {
          const base =
            sourceById.get(selectedId) ||
            persistedMap.get(selectedId) ||
            appliedMap.get(selectedId) ||
            { id: selectedId, originalText: '', translatedText: '' };
          return [{ ...base, id: selectedId, translatedText: translatedById.get(selectedId) }];
        }
        const fallback = sourceById.get(selectedId) || persistedMap.get(selectedId) || appliedMap.get(selectedId) || null;
        if (!fallback) return [];
        const translated = String(fallback?.translatedText || '');
        return translated.trim() ? [{ ...fallback, id: selectedId, translatedText: translated }] : [];
      }, [selectedTextId, selectedLiveDraft]);

      const waitForRuntimeCoreReady = useCallback((timeoutMs = 22000, expectedCore = '') => {
        if (wasmCoreReadyRef.current) return Promise.resolve(true);
        const expectedNorm = normalizeRuntimeCoreAlias(expectedCore);
        return new Promise((resolve) => {
          const started = Date.now();
          const onMessage = (event) => {
            const data = event?.data;
            if (!data || typeof data !== 'object') return;
            if (data.source !== 'pt-wasm-runtime') return;
            if (data.type === 'pt-runtime-core-ready' || data.type === 'pt-runtime-ready') {
              const payload = data.payload || {};
              const actualNorm = normalizeRuntimeCoreAlias(payload.core || payload.coreHint || '');
              if (expectedNorm && actualNorm && actualNorm !== expectedNorm) return;
              wasmCoreReadyRef.current = true;
              window.removeEventListener('message', onMessage);
              resolve(true);
              return;
            }
            if (data.type === 'pt-runtime-error') {
              window.removeEventListener('message', onMessage);
              resolve(false);
            }
          };
          window.addEventListener('message', onMessage);
          const tick = () => {
            if (wasmCoreReadyRef.current) {
              window.removeEventListener('message', onMessage);
              resolve(true);
              return;
            }
            if ((Date.now() - started) >= Math.max(5000, Number(timeoutMs) || 22000)) {
              window.removeEventListener('message', onMessage);
              resolve(false);
              return;
            }
            setTimeout(tick, 140);
          };
          tick();
        });
      }, [normalizeRuntimeCoreAlias]);

      const requestRuntimeSaveState = useCallback(() => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return Promise.reject(new Error('WASM runtime iframe is not ready.'));
        const requestId = ++liveSaveStateRequestSeqRef.current;
        return new Promise((resolve, reject) => {
          const timerId = setTimeout(() => {
            liveSaveStatePendingRef.current.delete(requestId);
            reject(new Error('Timed out while requesting emulator save state.'));
          }, 20000);
          liveSaveStatePendingRef.current.set(requestId, { resolve, reject, timerId });
          try {
            runtimeWindow.postMessage({
              source: 'pockettranslate',
              type: 'pt-runtime-req-save-state',
              payload: { requestId }
            }, '*');
          } catch (err) {
            clearTimeout(timerId);
            liveSaveStatePendingRef.current.delete(requestId);
            reject(err);
          }
        });
      }, []);

      const requestRuntimeControl = useCallback((action, payload = {}) => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return Promise.reject(new Error('WASM runtime iframe is not ready.'));
        const requestId = ++runtimeControlSeqRef.current;
        const actionName = String(action || '').toLowerCase();
        const timeoutMs =
          actionName === 'load_state' ? 36000 :
            (actionName === 'reset' ? 90000 : 25000);
        return new Promise((resolve, reject) => {
          const timerId = setTimeout(() => {
            runtimeControlPendingRef.current.delete(requestId);
            reject(new Error(`Runtime control timeout: ${String(action || 'unknown')}`));
          }, timeoutMs);
          runtimeControlPendingRef.current.set(requestId, { resolve, reject, timerId, action: String(action || '') });
          try {
            runtimeWindow.postMessage({
              source: 'pockettranslate',
              type: 'pt-runtime-control',
              payload: { requestId, action, ...payload }
            }, '*');
          } catch (err) {
            clearTimeout(timerId);
            runtimeControlPendingRef.current.delete(requestId);
            reject(err);
          }
        });
      }, []);

      const requestRuntimeFastForward = useCallback((enable) => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return Promise.reject(new Error('WASM runtime iframe is not ready.'));
        const requestId = ++runtimeControlSeqRef.current;
        return new Promise((resolve, reject) => {
          const timerId = setTimeout(() => {
            runtimeControlPendingRef.current.delete(requestId);
            reject(new Error('Runtime control timeout: fast_forward'));
          }, 26000);
          runtimeControlPendingRef.current.set(requestId, {
            resolve,
            reject,
            timerId,
            action: 'fast_forward'
          });
          try {
            runtimeWindow.postMessage({
              source: 'pockettranslate',
              type: 'pt-runtime-fastforward',
              payload: {
                requestId,
                enable: !!enable
              }
            }, '*');
          } catch (err) {
            clearTimeout(timerId);
            runtimeControlPendingRef.current.delete(requestId);
            reject(err);
          }
        });
      }, []);

      const testWasmRuntimeCycle = useCallback(async () => {
        const name = 'WASM Bridge & Save-State Cycle';
        const romCurrent = romData || romDataRef.current;
        const tableCurrent = tableData || tableDataRef.current;
        if (!romCurrent) {
          return { name, pass: false, info: 'Load ROM first.' };
        }
        if (!tableCurrent) {
          return { name, pass: false, info: 'Load table first.' };
        }
        if (scenePreviewMode !== 'wasm') {
          setScenePreviewMode('wasm');
          await new Promise(resolve => setTimeout(resolve, 180));
        }
        const expectedCore = getWasmCoreForSystem(String(systemInfo?.name || 'Unknown'));
        if (!wasmPreviewUrl) handleStartWasmPreview();
        postRomToWasmRuntime(false);
        let ready = await waitForRuntimeCoreReady(16000, expectedCore);
        if (!ready) {
          postRomToWasmRuntime(true);
          ready = await waitForRuntimeCoreReady(18000, expectedCore);
        }
        if (!ready) {
          const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
          if (runtimeWindow) {
            const probeFrameId = (Date.now() % 1000000000) + 7;
            const probeText = `PT READY PROBE ${probeFrameId}`;
            try {
              const probeAck = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                  window.removeEventListener('message', onMessage);
                  reject(new Error('Runtime probe ACK timeout'));
                }, 7000);
                const onMessage = (event) => {
                  const data = event?.data;
                  if (!data || typeof data !== 'object') return;
                  if (data.source !== 'pt-wasm-runtime' || data.type !== 'pt-runtime-ack') return;
                  const p = data.payload || {};
                  if (Number(p.frameId) !== probeFrameId) return;
                  clearTimeout(timeoutId);
                  window.removeEventListener('message', onMessage);
                  resolve(p);
                };
                window.addEventListener('message', onMessage);
                runtimeWindow.postMessage({
                  source: 'pockettranslate',
                  type: 'pt-runtime-scene',
                  payload: {
                    frameId: probeFrameId,
                    text: probeText,
                    system: String(systemInfo?.name || 'Unknown'),
                    core: expectedCore,
                    width: 640,
                    height: 360,
                    maxCols: 34,
                    maxLines: 4
                  }
                }, '*');
              });
              if (probeAck && Number(probeAck.frameId) === probeFrameId) {
                wasmCoreReadyRef.current = true;
                ready = true;
              }
            } catch (_) {
              ready = false;
            }
          }
        }
        if (!ready) {
          postRomToWasmRuntime(true);
          await new Promise(resolve => setTimeout(resolve, 900));
          ready = await waitForRuntimeCoreReady(14000, '');
        }
        if (!ready) {
          return { name, pass: false, info: 'Runtime core not ready within timeout.' };
        }
        try {
          let bytes = null;
          let lastErr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              bytes = await requestRuntimeSaveState();
              if (bytes instanceof Uint8Array && bytes.byteLength > 0) break;
            } catch (err) {
              lastErr = err;
            }
            await new Promise(resolve => setTimeout(resolve, 260 + (attempt * 180)));
          }
          if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
            throw (lastErr || new Error('save-state-unavailable'));
          }
          const pass = bytes instanceof Uint8Array && bytes.byteLength > 0;
          return {
            name,
            pass,
            info: pass ? `State captured (${bytes.byteLength} bytes).` : 'State payload is empty.'
          };
        } catch (err) {
          return { name, pass: false, info: err?.message || String(err) };
        }
      }, [romData, tableData, scenePreviewMode, wasmPreviewUrl, handleStartWasmPreview, postRomToWasmRuntime, waitForRuntimeCoreReady, requestRuntimeSaveState, getWasmCoreForSystem, systemInfo, postSceneToWasmRuntime]);

      useEffect(() => {
        testWasmRuntimeCycleRef.current = testWasmRuntimeCycle;
      }, [testWasmRuntimeCycle]);

      const requestLiveBuildRom = useCallback((snapshotTexts, buildOptions = {}) => {
        if (!buildWorker.current || !originalRomData || !tableData) {
          return Promise.reject(new Error('ROM/table/build worker is not ready for live build.'));
        }
        const baseRomInput = buildOptions?.baseRomBytes;
        const baseRomBytes = baseRomInput instanceof Uint8Array
          ? baseRomInput
          : (baseRomInput instanceof ArrayBuffer ? new Uint8Array(baseRomInput) : null);
        const selectedOnly = buildOptions?.selectedOnly === true;
        const sourceRomForBuild = (baseRomBytes instanceof Uint8Array && baseRomBytes.byteLength > 0)
          ? baseRomBytes
          : originalRomData.data;
        const requestId = ++liveBuildRequestSeqRef.current;
        const payload = {
          requestId,
          silentLive: true,
          originalRom: sourceRomForBuild.buffer.slice(sourceRomForBuild.byteOffset, sourceRomForBuild.byteOffset + sourceRomForBuild.byteLength),
          allTexts: snapshotTexts,
          tableData: {
            masterCharToHex: Object.fromEntries(masterCharToHex)
          },
          system: systemInfo,
          usePaddingByte: options.usePaddingByte,
          pointerGroups: selectedOnly ? [] : (Array.isArray(pointerGroups) ? pointerGroups : []),
          liveSyncMode: selectedOnly ? 'selected-only' : 'full'
        };
        const textCount = Array.isArray(snapshotTexts) ? snapshotTexts.length : 0;
        const liveBuildTimeoutMs = Math.max(60000, Math.min(240000, 45000 + (textCount * 4)));
        return new Promise((resolve, reject) => {
          const timerId = setTimeout(() => {
            liveBuildPendingRef.current.delete(requestId);
            reject(new Error('Timed out while building live modified ROM.'));
          }, liveBuildTimeoutMs);
          liveBuildPendingRef.current.set(requestId, { resolve, reject, timerId });
          try {
            buildWorker.current.postMessage({ type: 'buildRom', payload }, [payload.originalRom]);
          } catch (err) {
            clearTimeout(timerId);
            liveBuildPendingRef.current.delete(requestId);
            reject(err);
          }
        });
      }, [originalRomData, tableData, masterCharToHex, systemInfo, options.usePaddingByte, pointerGroups]);

      const postLiveRomWithState = useCallback((modifiedRomBytes, saveStateBytes, options = {}) => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow && !wasmPreviewUrl) return Promise.reject(new Error('WASM runtime iframe is not ready.'));
        const systemName = String(systemInfo?.name || 'Unknown');
        const core = getWasmCoreForSystem(systemName);
        const skipStateRestore = options?.skipStateRestore === true;
        const requestId = ++runtimeLoadRequestSeqRef.current;
        const sourceRom = modifiedRomBytes instanceof Uint8Array ? modifiedRomBytes : new Uint8Array(modifiedRomBytes || []);
        const sourceState = saveStateBytes instanceof Uint8Array ? saveStateBytes : (saveStateBytes ? new Uint8Array(saveStateBytes) : null);
        if (!(sourceRom instanceof Uint8Array) || sourceRom.byteLength <= 0) {
          return Promise.reject(new Error('Live sync ROM payload is empty.'));
        }
        const romBytes = new Uint8Array(sourceRom);
        const romBuffer = romBytes.buffer.slice(romBytes.byteOffset, romBytes.byteOffset + romBytes.byteLength);
        const saveStateBuffer =
          (!skipStateRestore && sourceState instanceof Uint8Array && sourceState.byteLength > 0)
            ? (new Uint8Array(sourceState)).buffer.slice(0)
            : null;
        return new Promise((resolve, reject) => {
          const requestTimeout = skipStateRestore ? 22000 : 42000;
          const timerId = setTimeout(() => {
            runtimeLoadPendingRef.current.delete(requestId);
            resolve({ ok: false, loadedBytes: 0, reason: 'state-load-timeout' });
          }, requestTimeout);
          runtimeLoadPendingRef.current.set(requestId, { resolve, reject, timerId, expectLoadState: true });
          if (runtimeWindow) {
            try {
              const postRomBuffer = romBuffer instanceof ArrayBuffer ? romBuffer.slice(0) : romBuffer;
              const postStateBuffer = saveStateBuffer instanceof ArrayBuffer ? saveStateBuffer.slice(0) : null;
              const transferList = [postRomBuffer];
              if (postStateBuffer instanceof ArrayBuffer) transferList.push(postStateBuffer);
              runtimeWindow.postMessage({
                source: 'pockettranslate',
                type: 'pt-runtime-hard-reset-and-load',
                payload: {
                  requestId,
                  system: systemName,
                  core,
                  romBuffer: postRomBuffer,
                  skipStateRestore,
                  ...(postStateBuffer instanceof ArrayBuffer ? { saveStateBuffer: postStateBuffer } : {})
                }
              }, '*', transferList);
              setWasmPreviewStatus(skipStateRestore ? 'Applying ROM to runtime (state restore skipped).' : 'Applying ROM + save state to runtime...');
              return;
            } catch (_) { }
          }
          runtimeLoadPendingRef.current.delete(requestId);
          clearTimeout(timerId);
          reject(new Error('WASM runtime iframe is not available for ROM/state sync.'));
        });
      }, [systemInfo, getWasmCoreForSystem, wasmPreviewUrl]);

      const waitForRuntimeIframeWindow = useCallback((timeoutMs = 18000, previousWindow = null) => {
        const started = Date.now();
        return new Promise((resolve) => {
          const tick = () => {
            const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
            if (runtimeWindow && runtimeWindow !== previousWindow) {
              resolve(true);
              return;
            }
            if ((Date.now() - started) >= Math.max(3000, Number(timeoutMs) || 18000)) {
              resolve(false);
              return;
            }
            setTimeout(tick, 80);
          };
          tick();
        });
      }, []);

      const remountRuntimeSlotForSync = useCallback(async () => {
        const previousWindow = scenePreviewIframeRef.current?.contentWindow || null;
        runtimeRemountSyncRef.current = true;
        pendingRuntimeLoadRef.current = { ts: Date.now(), mode: 'live-sync-remount' };
        wasmCoreReadyRef.current = false;
        setWasmPreviewStatus('Re-initializing WASM runtime slot for live sync...');
        setWasmIframeKey(prev => prev + 1);
        const hasWindow = await waitForRuntimeIframeWindow(22000, previousWindow);
        if (!hasWindow) {
          runtimeRemountSyncRef.current = false;
          pendingRuntimeLoadRef.current = null;
          return false;
        }
        const readyStarted = Date.now();
        let readyFlag = false;
        while ((Date.now() - readyStarted) < 15000) {
          const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
          if (runtimeWindow && runtimeWindow.__PT_RUNTIME_READY__ === true) {
            readyFlag = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 90));
        }
        if (!readyFlag) await new Promise(resolve => setTimeout(resolve, 900));
        return true;
      }, [waitForRuntimeIframeWindow]);

      const setRuntimeAudioMuted = useCallback((muted) => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return false;
        try {
          runtimeWindow.postMessage({
            source: 'pockettranslate',
            type: 'pt-runtime-set-audio',
            payload: { muted: !!muted }
          }, '*');
          return true;
        } catch (_) {
          return false;
        }
      }, []);

      const requestRuntimeSceneRedraw = useCallback((textIdOverride = null) => {
        const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
        if (!runtimeWindow) return Promise.resolve({ ok: false, reason: 'runtime-not-ready' });
        const requestId = ++runtimeRedrawSeqRef.current;
        return new Promise((resolve) => {
          const timerId = setTimeout(() => {
            runtimeRedrawPendingRef.current.delete(requestId);
            resolve({ ok: false, reason: 'redraw-timeout' });
          }, 1400);
          runtimeRedrawPendingRef.current.set(requestId, { resolve, timerId });
          try {
            runtimeWindow.postMessage({
              source: 'pockettranslate',
              type: 'pt-runtime-scene-redraw',
              payload: {
                requestId,
                textId: Number.isFinite(Number(textIdOverride)) ? Number(textIdOverride) : (Number(selectedTextId) || 0)
              }
            }, '*');
          } catch (_) {
            clearTimeout(timerId);
            runtimeRedrawPendingRef.current.delete(requestId);
            resolve({ ok: false, reason: 'postmessage-failed' });
          }
        });
      }, [selectedTextId]);

      const getLiveSyncProfile = useCallback(() => {
        const systemName = String(systemInfo?.name || '').toUpperCase();
        if (systemName.includes('GBA')) return { loadSettleMs: 90, redrawPasses: 1, redrawDelayMs: 35 };
        if (systemName.includes('SNES') || systemName.includes('GENESIS')) return { loadSettleMs: 120, redrawPasses: 1, redrawDelayMs: 40 };
        if (systemName.includes('NES') || systemName.includes('GAME BOY') || systemName.includes('GBC')) return { loadSettleMs: 90, redrawPasses: 1, redrawDelayMs: 35 };
        if (systemName.includes('NDS')) return { loadSettleMs: 180, redrawPasses: 2, redrawDelayMs: 60 };
        if (systemName.includes('PLAYSTATION 1') || systemName.includes('PS1')) return { loadSettleMs: 240, redrawPasses: 2, redrawDelayMs: 70 };
        if (systemName.includes('NINTENDO 64') || systemName.includes('N64')) return { loadSettleMs: 280, redrawPasses: 2, redrawDelayMs: 80 };
        if (systemName.includes('PLAYSTATION PORTABLE') || systemName.includes('PSP')) return { loadSettleMs: 320, redrawPasses: 2, redrawDelayMs: 90 };
        if (systemName.includes('NINTENDO 3DS') || systemName.includes('3DS')) return { loadSettleMs: 360, redrawPasses: 2, redrawDelayMs: 110 };
        return { loadSettleMs: 120, redrawPasses: 1, redrawDelayMs: 40 };
      }, [systemInfo]);

      const runLiveEmulatorSyncNow = useCallback(async (reason = 'manual-sync', forceLinked = false, override = null) => {
        if (!liveEmulatorLinked && !forceLinked) return;
        if (scenePreviewMode !== 'wasm') return;
        const sourceCount = Array.isArray(allTextsRef.current) ? allTextsRef.current.length : 0;
        if (!originalRomData || !tableData || sourceCount <= 0) return;
        if (liveBuildBusyRef.current) {
          liveBuildQueuedRef.current = true;
          liveSyncQueuedOverrideRef.current = override;
          return;
        }
        const overrideId = Number(override?.selectedId);
        const selectedIdForSync = Number.isFinite(overrideId) ? overrideId : Number(selectedTextId);
        const draftForSync = String(
          override && Object.prototype.hasOwnProperty.call(override, 'draftText')
            ? (override?.draftText || '')
            : (selectedLiveDraft || '')
        );
        liveBuildBusyRef.current = true;
        runtimeRemountSyncRef.current = true;
        setIsLiveSyncing(true);
        setRuntimeAudioMuted(true);
        const syncStarted = Date.now();
        try {
          const incrementalSnapshotTexts = buildLiveTextsSnapshot('selected-only', {
            selectedId: selectedIdForSync,
            draftText: draftForSync
          });
          const liveAppliedMap = new Map(liveAppliedTextsRef.current instanceof Map ? liveAppliedTextsRef.current : []);
          const sourceRows = Array.isArray(allTextsRef.current) ? allTextsRef.current : [];
          const sourceById = new Map();
          for (let i = 0; i < sourceRows.length; i++) {
            const row = sourceRows[i];
            const rowId = Number(row?.id);
            if (!Number.isFinite(rowId)) continue;
            sourceById.set(rowId, row);
          }
          const upsertAppliedText = (rowLike, textValue = null) => {
            const row = rowLike && typeof rowLike === 'object' ? rowLike : null;
            const rowId = Number(row?.id);
            if (!Number.isFinite(rowId)) return;
            const translated = textValue === null ? String(row?.translatedText || '') : String(textValue || '');
            if (!translated.trim()) {
              liveAppliedMap.delete(rowId);
              return;
            }
            const baseRow =
              sourceById.get(rowId) ||
              (allTextsByIdRef.current instanceof Map ? allTextsByIdRef.current.get(rowId) : null) ||
              liveAppliedMap.get(rowId) ||
              row ||
              { id: rowId, originalText: '', translatedText: '' };
            liveAppliedMap.set(rowId, { ...baseRow, id: rowId, translatedText: translated });
          };
          for (let i = 0; i < sourceRows.length; i++) {
            const row = sourceRows[i];
            if (!row || row.buildable === false) continue;
            upsertAppliedText(row, String(row?.translatedText || ''));
          }
          const liveQueuedMap = new Map(liveSyncTextsRef.current instanceof Map ? liveSyncTextsRef.current : []);
          liveQueuedMap.forEach((row) => {
            upsertAppliedText(row, String(row?.translatedText || ''));
          });
          if (Number.isFinite(selectedIdForSync)) {
            const selectedRow =
              sourceById.get(selectedIdForSync) ||
              (allTextsByIdRef.current instanceof Map ? allTextsByIdRef.current.get(selectedIdForSync) : null) ||
              liveAppliedMap.get(selectedIdForSync) ||
              null;
            if (selectedRow && String(draftForSync || '').trim()) {
              upsertAppliedText(selectedRow, String(draftForSync || ''));
            } else {
              liveAppliedMap.delete(selectedIdForSync);
            }
          }
          const appliedSnapshotTexts = Array.from(liveAppliedMap.values())
            .filter((row) => String(row?.translatedText || '').trim().length > 0)
            .map((row) => ({ ...row, id: Number(row?.id) }))
            .filter((row) => Number.isFinite(row.id))
            .sort((a, b) => Number(a.id) - Number(b.id));
          const buildPayloadTexts = appliedSnapshotTexts.length > 0 ? appliedSnapshotTexts : incrementalSnapshotTexts;
          setLiveEmulatorStatus(`Live sync running (${reason})... ${incrementalSnapshotTexts.length} changed text(s), ${appliedSnapshotTexts.length} total applied.`);
          const saveState = liveSaveStateRef.current;
          if (!(saveState instanceof Uint8Array) || saveState.byteLength === 0) {
            throw new Error('No runtime save state available. Capture Save State before Apply & Sync to keep scene-consistent sync.');
          }
          const baseRomForIncremental = originalRomData.data;
          const useSelectedOnly = false;
          const buildResult = await requestLiveBuildRom(buildPayloadTexts, {
            selectedOnly: useSelectedOnly,
            baseRomBytes: baseRomForIncremental
          });
          const liveRom = buildResult?.modifiedRom instanceof Uint8Array ? buildResult.modifiedRom : new Uint8Array(buildResult?.modifiedRom || []);
          if (liveRom.byteLength === 0) throw new Error('Silent live build returned empty ROM buffer.');
          const relocationLines = Array.isArray(buildResult?.relocationLog) ? buildResult.relocationLog : [];
          const relocationRisk = relocationLines.some((line) => /relocat|pointer|expand|moved|rewrite/i.test(String(line || '')));
          const preferSkipStateRestore = false;
          let runtimeLoadResult = await postLiveRomWithState(
            liveRom,
            preferSkipStateRestore ? null : saveState,
            { skipStateRestore: preferSkipStateRestore }
          );
          if (runtimeLoadResult?.ok !== true) {
            const failedReason = String(runtimeLoadResult?.reason || 'state-load-failed');
            const shouldRetryWithRemount =
              failedReason.includes('state-load-timeout') ||
              failedReason.includes('runtime-frame-timeout') ||
              failedReason.includes('runtime-boot-timeout');
            if (shouldRetryWithRemount) {
              setLiveEmulatorStatus('Runtime sync timeout. Re-initializing runtime slot and retrying...');
              const remountReady = await remountRuntimeSlotForSync();
              if (remountReady) {
                runtimeLoadResult = await postLiveRomWithState(
                  liveRom,
                  saveState,
                  { skipStateRestore: false }
                );
              }
            }
          }
          if (runtimeLoadResult?.ok !== true) {
            const failedReason = String(runtimeLoadResult?.reason || 'state-load-failed');
            const canFallbackNoState =
              !preferSkipStateRestore && (
                failedReason.includes('state-load-timeout') ||
                failedReason.includes('state-load-failed') ||
                failedReason.includes('hard-reset-state-load-failed')
              );
            if (canFallbackNoState) {
              setLiveEmulatorStatus('Runtime state restore timed out. Retrying sync without state restore...');
              runtimeLoadResult = await postLiveRomWithState(
                liveRom,
                null,
                { skipStateRestore: true }
              );
            }
          }
          if (runtimeLoadResult?.ok !== true) {
            const failedReason = String(runtimeLoadResult?.reason || 'state-load-failed');
            if (failedReason.includes('runtime-frame-timeout')) {
              setLiveEmulatorStatus('Runtime frame timeout. Running reset/redraw recovery...');
              try {
                await requestRuntimeControl('reset');
              } catch (_) { }
              await new Promise(resolve => setTimeout(resolve, 280));
              const redrawRecovery = await requestRuntimeSceneRedraw(Number(selectedIdForSync) || 0);
              if (redrawRecovery?.ok) {
                runtimeLoadResult = { ok: true, loadedBytes: 0, reason: 'runtime-frame-recovered' };
              }
            }
          }
          if (runtimeLoadResult?.ok !== true) {
            throw new Error(`Runtime state restore failed (${String(runtimeLoadResult?.reason || 'state-load-failed')}).`);
          }
          if (String(runtimeLoadResult?.reason || '').includes('runtime-frame-pending')) {
            try {
              await requestRuntimeControl('reset');
            } catch (_) { }
            await new Promise(resolve => setTimeout(resolve, 420));
            await requestRuntimeSceneRedraw(Number(selectedIdForSync) || 0).catch(() => ({ ok: false }));
            await new Promise(resolve => setTimeout(resolve, 240));
            await requestRuntimeSceneRedraw(Number(selectedIdForSync) || 0).catch(() => ({ ok: false }));
          }
          const profile = getLiveSyncProfile();
          await new Promise(resolve => setTimeout(resolve, Math.max(0, Number(profile.loadSettleMs) || 0)));
          postSceneToWasmRuntime(String(draftForSync || selectedPreviewText || ''));
          let redrawOkCount = 0;
          const canRedraw = runtimeLoadResult?.ok === true;
          const redrawPasses = canRedraw ? Math.max(1, Number(profile.redrawPasses) || 1) : 0;
          if (canRedraw) {
            for (let i = 0; i < redrawPasses; i++) {
              const redrawRes = await requestRuntimeSceneRedraw(Number(selectedIdForSync) || 0);
              if (redrawRes?.ok) redrawOkCount++;
              if (i !== redrawPasses - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.max(0, Number(profile.redrawDelayMs) || 0)));
              }
            }
          }
          const refreshedStateBytes = saveState.byteLength;
          const refreshedStateReason = 'manual-state-preserved';
          const elapsedMs = Date.now() - syncStarted;
          const loadSuffix = runtimeLoadResult?.ok === false
            ? `, state fallback (${String(runtimeLoadResult?.reason || 'state-load-failed')})`
            : (relocationRisk ? `, relocation sync mode (${String(runtimeLoadResult?.reason || 'ok')})` : '');
          if (runtimeLoadResult?.ok === true && Array.isArray(appliedSnapshotTexts)) {
            const nextApplied = new Map();
            for (let i = 0; i < appliedSnapshotTexts.length; i++) {
              const row = appliedSnapshotTexts[i];
              const rowId = Number(row?.id);
              const translated = String(row?.translatedText || '');
              if (!Number.isFinite(rowId)) continue;
              if (!translated.trim()) {
                nextApplied.delete(rowId);
              } else {
                nextApplied.set(rowId, { ...row, translatedText: translated });
              }
            }
            liveAppliedTextsRef.current = nextApplied;
            liveSyncTextsRef.current = new Map(nextApplied);
          }
          if (runtimeLoadResult?.ok === true) {
            liveRuntimeRomRef.current = new Uint8Array(liveRom);
          }
          const stateSuffix = refreshedStateBytes > 0
            ? `, state ${refreshedStateBytes}B`
            : `, state refresh skipped (${refreshedStateReason})`;
          setLiveEmulatorStatus(`Live sync complete (${Math.round(liveRom.byteLength / 1024)}KB, ${appliedSnapshotTexts.length} text(s), ${elapsedMs}ms, redraw ${redrawOkCount}/${redrawPasses}${stateSuffix}${loadSuffix}).`);
        } catch (err) {
          setLiveEmulatorStatus(`Live sync failed: ${err?.message || String(err)}`);
        } finally {
          runtimeRemountSyncRef.current = false;
          pendingRuntimeLoadRef.current = null;
          liveBuildBusyRef.current = false;
          setIsLiveSyncing(false);
          setRuntimeAudioMuted(true);
          if (liveBuildQueuedRef.current) {
            liveBuildQueuedRef.current = false;
            const queuedOverride = liveSyncQueuedOverrideRef.current;
            liveSyncQueuedOverrideRef.current = null;
            setTimeout(() => runLiveEmulatorSyncNow('queued', forceLinked, queuedOverride), 40);
          } else {
            liveSyncQueuedOverrideRef.current = null;
          }
        }
      }, [liveEmulatorLinked, scenePreviewMode, originalRomData, tableData, requestLiveBuildRom, postLiveRomWithState, buildLiveTextsSnapshot, setRuntimeAudioMuted, requestRuntimeSceneRedraw, postSceneToWasmRuntime, selectedLiveDraft, selectedPreviewText, getLiveSyncProfile, selectedTextId, requestRuntimeSaveState, requestRuntimeControl, remountRuntimeSlotForSync]);

      const ensureLiveEmulatorLinked = useCallback(async (reason = 'auto') => {
        if (liveEmulatorLinked) return true;
        if (liveLinkBusyRef.current) return false;
        if (scenePreviewMode !== 'wasm') return false;
        const sourceCount = Array.isArray(allTextsRef.current) ? allTextsRef.current.length : 0;
        if (!romData || !tableData || sourceCount <= 0) return false;
        if (scenePreviewIframeRef.current?.contentWindow && wasmCoreReadyRef.current) {
          setLiveEmulatorLinked(true);
          setRuntimeAudioMuted(true);
          setLiveEmulatorStatus('Live emulator linked (runtime already ready).');
          return true;
        }
        liveLinkBusyRef.current = true;
        try {
          if (!wasmPreviewUrl) handleStartWasmPreview();
          postRomToWasmRuntime(true);
          const expectedCore = getWasmCoreForSystem(String(systemInfo?.name || 'Unknown'));
          setLiveEmulatorStatus(`Auto-linking live emulator (${reason})...`);
          let runtimeReady = await waitForRuntimeCoreReady(2600, expectedCore);
          if (!runtimeReady) {
            setLiveEmulatorStatus('Runtime handshake delayed. Retrying with clean WASM remount...');
            runtimeRemountSyncRef.current = false;
            pendingRuntimeLoadRef.current = null;
            wasmRuntimeBootRef.current = { key: '', pending: false };
            wasmCoreReadyRef.current = false;
            setWasmIframeKey(prev => prev + 1);
            await new Promise(resolve => setTimeout(resolve, 120));
            postRomToWasmRuntime(true);
            runtimeReady = await waitForRuntimeCoreReady(2600, expectedCore);
          }
          if (!runtimeReady) {
            setLiveEmulatorStatus('Live emulator linked in fallback mode (runtime core readiness is delayed).');
          }
          liveSaveStateRef.current = null;
          setRuntimeSaveStateBytes(0);
          setRuntimePaused(false);
          setRuntimeFastForward(false);
          setLiveEmulatorStatus('Live emulator linked. Capture Save State manually, then use Apply & Sync to Game.');
          setRuntimeAudioMuted(true);
          if (romData?.data instanceof Uint8Array && romData.data.byteLength > 0) {
            liveRuntimeRomRef.current = new Uint8Array(romData.data);
          } else {
            liveRuntimeRomRef.current = null;
          }
          setLiveEmulatorLinked(true);
          return true;
        } catch (err) {
          const message = String(err?.message || err || 'unknown');
          setLiveEmulatorStatus(`Live emulator link failed: ${message}`);
          return false;
        } finally {
          liveLinkBusyRef.current = false;
        }
      }, [liveEmulatorLinked, scenePreviewMode, romData, tableData, wasmPreviewUrl, handleStartWasmPreview, postRomToWasmRuntime, waitForRuntimeCoreReady, getWasmCoreForSystem, systemInfo]);

      const handleLinkLiveEmulator = useCallback(async () => {
        if (liveEmulatorLinked) {
          setLiveEmulatorLinked(false);
          liveSaveStateRef.current = null;
          liveRuntimeRomRef.current = null;
          setRuntimeSaveStateBytes(0);
          setRuntimePaused(false);
          setRuntimeFastForward(false);
          setLiveEmulatorStatus('Live emulator link disabled.');
          return;
        }
        await ensureLiveEmulatorLinked('manual');
      }, [liveEmulatorLinked, ensureLiveEmulatorLinked]);

      const handleRuntimeSaveState = useCallback(async () => {
        if (!liveEmulatorLinked) {
          setError('Link Live Emulator first.');
          return;
        }
        setRuntimeControlBusy(prev => ({ ...prev, save: true }));
        try {
          const result = await requestRuntimeControl('save_state');
          if (!(result?.saveStateBytes instanceof Uint8Array) || result.saveStateBytes.byteLength <= 0) {
            throw new Error('Save state returned empty bytes.');
          }
          liveSaveStateRef.current = result.saveStateBytes;
          setRuntimeSaveStateBytes(result.saveStateBytes.byteLength);
          setLiveEmulatorStatus(`Runtime save state captured (${result.saveStateBytes.byteLength} bytes).`);
        } catch (err) {
          setLiveEmulatorStatus(`Save State failed: ${err?.message || String(err)}`);
        } finally {
          setRuntimeControlBusy(prev => ({ ...prev, save: false }));
        }
      }, [liveEmulatorLinked, requestRuntimeControl]);

      const handleRuntimeLoadState = useCallback(async () => {
        if (!liveEmulatorLinked) {
          setError('Link Live Emulator first.');
          return;
        }
        const stateBytes = liveSaveStateRef.current;
        if (!(stateBytes instanceof Uint8Array) || stateBytes.byteLength <= 0) {
          setError('No saved state available. Click Save State first.');
          return;
        }
        setRuntimeControlBusy(prev => ({ ...prev, load: true }));
        try {
          const result = await requestRuntimeControl('load_state', {
            saveStateBuffer: stateBytes.buffer.slice(stateBytes.byteOffset, stateBytes.byteOffset + stateBytes.byteLength)
          });
          if (!result?.ok) {
            throw new Error(String(result?.reason || 'load-state-failed'));
          }
          setLiveEmulatorStatus(`Runtime state loaded (${Number(result.loadedBytes) || 0} bytes).`);
          const redrawRes = await requestRuntimeSceneRedraw(Number(selectedTextId) || 0);
          if (!redrawRes?.ok) {
            setLiveEmulatorStatus(`Runtime state loaded (${Number(result.loadedBytes) || 0} bytes). Redraw fallback may be required.`);
          }
        } catch (err) {
          setLiveEmulatorStatus(`Load State failed: ${err?.message || String(err)}`);
        } finally {
          setRuntimeControlBusy(prev => ({ ...prev, load: false }));
        }
      }, [liveEmulatorLinked, requestRuntimeControl, requestRuntimeSceneRedraw, selectedTextId]);

      const handleRuntimePauseToggle = useCallback(async () => {
        if (!liveEmulatorLinked) {
          setError('Link Live Emulator first.');
          return;
        }
        setRuntimeControlBusy(prev => ({ ...prev, pause: true }));
        try {
          const result = await requestRuntimeControl('pause_toggle');
          const paused = !!result?.paused;
          setRuntimePaused(paused);
          setLiveEmulatorStatus(`Runtime ${paused ? 'paused' : 'resumed'}.`);
        } catch (err) {
          setLiveEmulatorStatus(`Pause toggle failed: ${err?.message || String(err)}`);
        } finally {
          setRuntimeControlBusy(prev => ({ ...prev, pause: false }));
        }
      }, [liveEmulatorLinked, requestRuntimeControl]);

      const handleRuntimeFastForwardToggle = useCallback(async () => {
        if (!liveEmulatorLinked) {
          setError('Link Live Emulator first.');
          return;
        }
        setRuntimeControlBusy(prev => ({ ...prev, fast: true }));
        try {
          const nextEnabled = !runtimeFastForward;
          const result = await requestRuntimeFastForward(nextEnabled);
          const active = result && Object.prototype.hasOwnProperty.call(result, 'fastForward')
            ? !!result.fastForward
            : nextEnabled;
          setRuntimeFastForward(active);
          setLiveEmulatorStatus(`Fast Forward ${active ? 'enabled' : 'disabled'}${result?.reason ? ` (${String(result.reason)})` : ''}.`);
        } catch (err) {
          setLiveEmulatorStatus(`Fast Forward toggle failed: ${err?.message || String(err)}`);
        } finally {
          setRuntimeControlBusy(prev => ({ ...prev, fast: false }));
        }
      }, [liveEmulatorLinked, requestRuntimeFastForward, runtimeFastForward]);

      const handleRuntimeReset = useCallback(async () => {
        if (!liveEmulatorLinked) {
          setError('Link Live Emulator first.');
          return;
        }
        setRuntimeControlBusy(prev => ({ ...prev, reset: true }));
        try {
          const result = await requestRuntimeControl('reset');
          if (!result?.ok) throw new Error(String(result?.reason || 'reset-failed'));
          setRuntimePaused(false);
          setRuntimeFastForward(false);
          setLiveEmulatorStatus('Runtime game reset completed.');
        } catch (err) {
          setLiveEmulatorStatus(`Reset failed: ${err?.message || String(err)}`);
        } finally {
          setRuntimeControlBusy(prev => ({ ...prev, reset: false }));
        }
      }, [liveEmulatorLinked, requestRuntimeControl]);

      const applyAndSyncLiveEmulator = useCallback(async (textId, draftText) => {
        const id = Number(textId);
        if (!Number.isFinite(id)) return;
        const nextText = String(draftText || '');
        const byId = allTextsByIdRef.current instanceof Map ? allTextsByIdRef.current : new Map();
        const sourceRow = byId.get(id);
        if (sourceRow) {
          const patched = { ...sourceRow, translatedText: nextText };
          byId.set(id, patched);
          allTextsByIdRef.current = byId;
          if (nextText.trim()) liveSyncTextsRef.current.set(id, patched);
          else liveSyncTextsRef.current.delete(id);
        }
        setHasUnsavedChanges(true);
        setSelectedTextId(id);
        setSelectedLiveDraft(nextText);
        if (scenePreviewMode !== 'wasm') setScenePreviewMode('wasm');
        const linked = await ensureLiveEmulatorLinked('apply-sync');
        if (!linked) return;
        await runLiveEmulatorSyncNow('apply-sync', true, { selectedId: id, draftText: nextText });
      }, [scenePreviewMode, ensureLiveEmulatorLinked, runLiveEmulatorSyncNow]);

      const handleApplySelectedAndSync = useCallback(async () => {
        let selectedId = Number(selectedTextId);
        const currentById = allTextsByIdRef.current instanceof Map ? allTextsByIdRef.current : new Map();
        let nextDraftRaw = String(selectedLiveDraft || '');
        const activeEl = document.activeElement;
        if (activeEl && String(activeEl.tagName || '').toUpperCase() === 'TEXTAREA') {
          const activeId = Number(activeEl.getAttribute?.('data-text-id'));
          if (Number.isFinite(activeId)) {
            selectedId = activeId;
            nextDraftRaw = String(activeEl.value ?? nextDraftRaw);
            try { activeEl.blur(); } catch (_) { }
          }
        }
        if (!Number.isFinite(selectedId)) return;
        const selectedEntry = currentById.get(selectedId);
        if (!selectedEntry || selectedEntry.buildable === false) return;
        const nextText = nextDraftRaw.trim();
        if (!nextText) {
          setError('Enter translation text first before syncing to runtime.');
          return;
        }
        if (selectedEntry) {
          const patched = { ...selectedEntry, translatedText: nextDraftRaw };
          currentById.set(selectedId, patched);
          allTextsByIdRef.current = currentById;
          liveSyncTextsRef.current.set(selectedId, patched);
        }
        try {
          const visibleTextareas = Array.from(document.querySelectorAll('.text-item textarea[data-text-id]'));
          if (visibleTextareas.length > 0) {
            for (let i = 0; i < visibleTextareas.length; i++) {
              const node = visibleTextareas[i];
              const rowId = Number(node.getAttribute('data-text-id'));
              if (!Number.isFinite(rowId)) continue;
              const row = currentById.get(rowId);
              if (!row) continue;
              const value = String(node.value || '');
              if (!value.trim()) {
                liveSyncTextsRef.current.delete(rowId);
                currentById.set(rowId, { ...row, translatedText: '' });
              } else {
                const patchedRow = { ...row, translatedText: value };
                liveSyncTextsRef.current.set(rowId, patchedRow);
                currentById.set(rowId, patchedRow);
              }
            }
          }
        } catch (_) { }
        const mergedLiveMap = new Map(liveSyncTextsRef.current instanceof Map ? liveSyncTextsRef.current : []);
        currentById.forEach((row, rowIdRaw) => {
          const rowId = Number(rowIdRaw);
          if (!Number.isFinite(rowId)) return;
          const translated = String(row?.translatedText || '');
          if (!translated.trim()) return;
          mergedLiveMap.set(rowId, { ...row, id: rowId, translatedText: translated });
        });
        liveSyncTextsRef.current = mergedLiveMap;
        allTextsByIdRef.current = currentById;
        setAllTexts((currentTexts) => currentTexts.map((row) => {
          const rowId = Number(row?.id);
          if (!Number.isFinite(rowId)) return row;
          const liveRow = liveSyncTextsRef.current.get(rowId);
          if (!liveRow) return row;
          return { ...row, translatedText: String(liveRow.translatedText || '') };
        }));
        setSelectedTextId(selectedId);
        queueTranslationUpdate(selectedId, nextDraftRaw, true);
        setSelectedLiveDraft(nextDraftRaw);
        setHasUnsavedChanges(true);
        if (!(liveSaveStateRef.current instanceof Uint8Array) || liveSaveStateRef.current.byteLength <= 0) {
          try {
            const captured = await requestRuntimeSaveState();
            if (!(captured instanceof Uint8Array) || captured.byteLength <= 0) {
              setError('Capture Save State first, then click Apply & Sync to Game.');
              return;
            }
          } catch (_) {
            setError('Capture Save State first, then click Apply & Sync to Game.');
            return;
          }
        }
        await applyAndSyncLiveEmulator(selectedId, nextDraftRaw);
      }, [selectedTextId, selectedLiveDraft, applyAndSyncLiveEmulator, queueTranslationUpdate, requestRuntimeSaveState]);

      const runTileEditorRender = useCallback(() => {
        if (!romData || !tileEditorWorker.current) {
          setError('Load a ROM before rendering tile editor.');
          return;
        }
        const tileOffset = parseNumericInput(tileEditorOffsetInput, 0);
        const mapOffsetText = String(tileEditorMapOffsetInput || '').trim();
        const mapOffset = mapOffsetText ? parseNumericInput(mapOffsetText, NaN) : NaN;
        const romBuffer = romData.data.buffer.slice(0);
        setIsProcessing(true);
        setProcessingText('Rendering tile editor...');
        setProgress(20);
        tileEditorWorker.current.postMessage({
          type: 'renderTileEditor',
          payload: {
            romBuffer,
            systemName: systemInfo?.name || 'Unknown',
            tileOffset,
            tileCount: tileEditorCount,
            tilesPerRow: tileEditorColumns,
            bppMode: tileEditorBppMode,
            mapOffset: Number.isFinite(mapOffset) ? mapOffset : null,
            mapWidth: tileEditorMapWidth,
            mapHeight: tileEditorMapHeight,
            mapEntrySize: tileEditorMapEntrySize,
            mapEndian: tileEditorMapEndian
          }
        }, [romBuffer]);
      }, [
        romData,
        systemInfo,
        tileEditorOffsetInput,
        tileEditorCount,
        tileEditorColumns,
        tileEditorBppMode,
        tileEditorMapOffsetInput,
        tileEditorMapWidth,
        tileEditorMapHeight,
        tileEditorMapEntrySize,
        tileEditorMapEndian,
        parseNumericInput
      ]);

      const handleTileSheetClick = useCallback((event) => {
        if (!tileEditorData || !tileSheetCanvasRef.current) return;
        const rect = tileSheetCanvasRef.current.getBoundingClientRect();
        const scaleX = tileEditorData.sheetWidth / Math.max(1, rect.width);
        const scaleY = tileEditorData.sheetHeight / Math.max(1, rect.height);
        const x = Math.max(0, Math.floor((event.clientX - rect.left) * scaleX));
        const y = Math.max(0, Math.floor((event.clientY - rect.top) * scaleY));
        const tileX = Math.floor(x / 8);
        const tileY = Math.floor(y / 8);
        const idx = tileY * Math.max(1, Number(tileEditorData.tilesPerRow) || 1) + tileX;
        setTileEditorSelectedTile(Math.max(0, Math.min((tileEditorData.tileCount || 1) - 1, idx)));
      }, [tileEditorData]);

      const handleTileMapClick = useCallback((event) => {
        if (!tileMapData?.mapPresent || !tileMapCanvasRef.current || !romData) return;
        const rect = tileMapCanvasRef.current.getBoundingClientRect();
        const mapW = Number(tileMapData.mapWidth) || 1;
        const mapH = Number(tileMapData.mapHeight) || 1;
        const scaleX = (mapW * 8) / Math.max(1, rect.width);
        const scaleY = (mapH * 8) / Math.max(1, rect.height);
        const x = Math.max(0, Math.floor((event.clientX - rect.left) * scaleX));
        const y = Math.max(0, Math.floor((event.clientY - rect.top) * scaleY));
        const cellX = Math.max(0, Math.min(mapW - 1, Math.floor(x / 8)));
        const cellY = Math.max(0, Math.min(mapH - 1, Math.floor(y / 8)));
        setTileEditorSelectedMapCell({ x: cellX, y: cellY });

        const mapOffset = parseNumericInput(tileEditorMapOffsetInput, NaN);
        if (!Number.isFinite(mapOffset)) return;
        const entrySize = Number(tileEditorMapEntrySize) === 2 ? 2 : 1;
        const entryIndex = cellY * mapW + cellX;
        const writeOffset = mapOffset + (entryIndex * entrySize);
        if (writeOffset < 0 || writeOffset + entrySize > romData.data.length) return;

        const tileIndex = Math.max(0, Number(tileEditorSelectedTile) || 0);
        const next = new Uint8Array(romData.data);
        if (entrySize === 1) {
          next[writeOffset] = tileIndex & 0xFF;
        } else if (String(tileEditorMapEndian || 'little').toLowerCase() === 'big') {
          next[writeOffset] = (tileIndex >> 8) & 0xFF;
          next[writeOffset + 1] = tileIndex & 0xFF;
        } else {
          next[writeOffset] = tileIndex & 0xFF;
          next[writeOffset + 1] = (tileIndex >> 8) & 0xFF;
        }
        setRomData(prev => prev ? { ...prev, data: next, size: next.length } : prev);
        setHasUnsavedChanges(true);
        if (tileEditorAutoRefresh) setTimeout(() => runTileEditorRender(), 0);
      }, [
        tileMapData,
        romData,
        tileEditorMapOffsetInput,
        tileEditorMapEntrySize,
        tileEditorMapEndian,
        tileEditorSelectedTile,
        tileEditorAutoRefresh,
        parseNumericInput,
        runTileEditorRender
      ]);

      const handleTileSelectedCanvasClick = useCallback((event) => {
        if (!romData || !tileEditorData || !tileSelectedCanvasRef.current) return;
        const rect = tileSelectedCanvasRef.current.getBoundingClientRect();
        const scaleX = 8 / Math.max(1, rect.width);
        const scaleY = 8 / Math.max(1, rect.height);
        const px = Math.max(0, Math.min(7, Math.floor((event.clientX - rect.left) * scaleX)));
        const py = Math.max(0, Math.min(7, Math.floor((event.clientY - rect.top) * scaleY)));
        const tileOffset = Number(tileEditorData.tileOffset) || 0;
        const bytesPerTile = Number(tileEditorData.bytesPerTile) || 16;
        const bpp = Number(tileEditorData.bpp) || 2;
        const base = tileOffset + (Math.max(0, Number(tileEditorSelectedTile) || 0) * bytesPerTile);
        if (base < 0 || base + bytesPerTile > romData.data.length) return;
        const color = Math.max(0, Number(tileEditorPaintColor) || 0);
        const next = new Uint8Array(romData.data);
        if (bpp === 2) {
          const bit = 7 - px;
          const p0Off = base + py;
          const p1Off = base + py + 8;
          if (color & 0x01) next[p0Off] |= (1 << bit); else next[p0Off] &= ~(1 << bit);
          if (color & 0x02) next[p1Off] |= (1 << bit); else next[p1Off] &= ~(1 << bit);
        } else {
          const row = base + (py * 4) + Math.floor(px / 2);
          const cur = next[row];
          const nib = color & 0x0F;
          next[row] = (px % 2 === 0) ? ((cur & 0xF0) | nib) : ((cur & 0x0F) | (nib << 4));
        }
        setRomData(prev => prev ? { ...prev, data: next, size: next.length } : prev);
        setHasUnsavedChanges(true);
        if (tileEditorAutoRefresh) setTimeout(() => runTileEditorRender(), 0);
      }, [romData, tileEditorData, tileEditorSelectedTile, tileEditorPaintColor, tileEditorAutoRefresh, runTileEditorRender]);

      const runUnitTestSuite = useCallback(() => {
        if (!unitTestWorker.current) {
          setError('Unit test worker is not available.');
          return;
        }
        setError('');
        setSuccess('');
        setUnitTestStatus('Running unit test suite...');
        setUnitTestResults([]);
        setUnitTestSummary(null);
        setIsProcessing(true);
        setProcessingText('Running unit test suite...');
        setProgress(15);
        unitTestWorker.current.postMessage({ type: 'runUnitTests' });
      }, []);

      const runPreviewPipelineTest = useCallback(async () => {
        const results = [];
        const push = (pass, name, info) => results.push({ pass: !!pass, name, info: info || '' });
        const normalizeCoreAlias = (value) => {
          const v = String(value || '').trim().toLowerCase();
          if (!v) return '';
          if (v === 'mgba' || v === 'gba' || v === 'gpsp') return 'gba';
          if (v === 'fceumm' || v === 'nestopia' || v === 'nes') return 'nes';
          if (v === 'snes9x' || v === 'mesen-s' || v === 'snes') return 'snes';
          if (v === 'gambatte' || v === 'sameboy' || v === 'gb') return 'gb';
          if (v === 'genesis_plus_gx' || v === 'segamd' || v === 'genesis') return 'genesis';
          if (v === 'desmume' || v === 'melonds' || v === 'nds') return 'nds';
          if (v === 'pcsx_rearmed' || v === 'swanstation' || v === 'psx' || v === 'ps1') return 'ps1';
          return v;
        };
        setError('');
        setSuccess('');
        setPreviewPipelineResults([]);
        setPreviewPipelineStatus('Running preview pipeline tests...');
        setIsProcessing(true);
        setProcessingText('Running preview pipeline tests...');
        setProgress(20);
        try {
          if (!romData) {
            push(false, 'ROM loaded', 'Load ROM first.');
            setPreviewPipelineResults(results);
            setPreviewPipelineStatus('Preview pipeline tests failed.');
            return;
          }
          if (scenePreviewMode !== 'wasm') setScenePreviewMode('wasm');
          if (!wasmPreviewUrl) {
            handleStartWasmPreview();
            await new Promise(resolve => setTimeout(resolve, 450));
          }
          const runtimeWindow = scenePreviewIframeRef.current?.contentWindow;
          if (!runtimeWindow) {
            push(false, 'WASM iframe', 'Runtime iframe not ready.');
            setPreviewPipelineResults(results);
            setPreviewPipelineStatus('Preview pipeline tests failed.');
            return;
          }
          push(true, 'WASM iframe', 'Runtime iframe is available.');
          const systemName = String(systemInfo?.name || 'Unknown');
          const core = getWasmCoreForSystem(systemName);
          const waitRuntimeMessage = (predicate, timeoutMs = 10000) => new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              window.removeEventListener('message', onMessage);
              reject(new Error('Runtime message timeout'));
            }, timeoutMs);
            const onMessage = (event) => {
              const data = event?.data;
              if (!data || typeof data !== 'object') return;
              if (data.source !== 'pt-wasm-runtime') return;
              try {
                if (!predicate(data)) return;
              } catch (_) {
                return;
              }
              clearTimeout(timeoutId);
              window.removeEventListener('message', onMessage);
              resolve(data);
            };
            window.addEventListener('message', onMessage);
          });
          const frameId = (Date.now() % 1000000000) + 1;
          const testText = `PT PREVIEW TEST ${frameId}`;
          const ackPayload = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              window.removeEventListener('message', onMessage);
              reject(new Error('ACK timeout'));
            }, 8000);
            const onMessage = (event) => {
              const data = event?.data;
              if (!data || typeof data !== 'object') return;
              if (data.source !== 'pt-wasm-runtime') return;
              if (data.type === 'pt-runtime-error') {
                clearTimeout(timeoutId);
                window.removeEventListener('message', onMessage);
                reject(new Error(String(data?.payload?.message || 'runtime error')));
                return;
              }
              if (data.type !== 'pt-runtime-ack') return;
              const payload = data.payload || {};
              if (Number(payload.frameId) !== frameId) return;
              clearTimeout(timeoutId);
              window.removeEventListener('message', onMessage);
              resolve(payload);
            };
            window.addEventListener('message', onMessage);
            runtimeWindow.postMessage({
              type: 'pt-runtime-scene',
              source: 'pockettranslate',
              payload: {
                frameId,
                text: testText,
                system: systemName,
                core,
                width: 640,
                height: 360,
                maxCols: 34,
                maxLines: 4
              }
            }, '*');
          });
          push(true, 'Runtime ACK', `ACK for frame #${ackPayload.frameId} received.`);
          if (previewAssertWorker.current) {
            const requestId = ++previewAssertSeqRef.current;
            const workerResult = await new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                previewAssertPendingRef.current.delete(requestId);
                reject(new Error('Preview assert worker timeout'));
              }, 5000);
              previewAssertPendingRef.current.set(requestId, {
                resolve: (payload) => {
                  clearTimeout(timer);
                  resolve(payload);
                },
                reject: (err) => {
                  clearTimeout(timer);
                  reject(err);
                }
              });
              previewAssertWorker.current.postMessage({
                type: 'assertPreviewAck',
                payload: {
                  requestId,
                  expectedFrameId: frameId,
                  expectedCore: core,
                  expectedText: testText,
                  ack: ackPayload
                }
              });
            });
            const details = workerResult?.details || {};
            const actualCoreLabel = details.ackCoreHint
              ? `${details.ackCore || ackPayload.core || 'n/a'} (hint: ${details.ackCoreHint})`
              : `${details.ackCore || ackPayload.core || 'n/a'}`;
            const expectedCoreNorm = normalizeCoreAlias(details.expectedCore || core);
            const ackCoreNorm = normalizeCoreAlias(details.ackCore || ackPayload.core || '');
            const ackHintNorm = normalizeCoreAlias(details.ackCoreHint || ackPayload.coreHint || '');
            const mergedAckNorm = normalizeCoreAlias((details.ackCoreHint || details.ackCore || ackPayload.coreHint || ackPayload.core || ''));
            const expectedRawNorm = normalizeCoreAlias(core);
            const expectedAliasSet = new Set([expectedCoreNorm, expectedRawNorm].filter(Boolean));
            const corePass =
              !!details.corePass ||
              expectedAliasSet.has(ackCoreNorm) ||
              expectedAliasSet.has(ackHintNorm) ||
              expectedAliasSet.has(mergedAckNorm);
            push(corePass, 'Core profile sync', `Expected ${details.expectedCore || core}, got ${actualCoreLabel}.`);
            push(!!details.digestPass, 'Text sync assertion', `Expected digest ${details.expectedDigest || 0}, got ${details.ackDigest || 0}.`);
          } else {
            const corePass =
              (ackPayload.core === core) ||
              (normalizeCoreAlias(ackPayload.core) === normalizeCoreAlias(core)) ||
              (normalizeCoreAlias(ackPayload.coreHint) === normalizeCoreAlias(core));
            const actualCoreLabel = ackPayload.coreHint
              ? `${ackPayload.core || 'n/a'} (hint: ${ackPayload.coreHint})`
              : `${ackPayload.core || 'n/a'}`;
            push(corePass, 'Core profile sync', `Expected ${core}, got ${actualCoreLabel}.`);
            push(false, 'Text sync assertion', 'Preview assert worker unavailable.');
          }
          push(true, 'Text sync dispatch', `Dispatched token "${testText}" to runtime.`);

          const saveStateReqId = (frameId + 77) >>> 0;
          let saveStateMsg = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const reqId = (saveStateReqId + attempt) >>> 0;
            runtimeWindow.postMessage({
              type: 'pt-runtime-req-save-state',
              source: 'pockettranslate',
              payload: { requestId: reqId }
            }, '*');
            try {
              saveStateMsg = await waitRuntimeMessage((data) =>
                data.type === 'pt-runtime-save-state-result' &&
                Number(data?.payload?.requestId) === reqId, 12000);
              if (saveStateMsg?.payload?.ok === true) break;
            } catch (_) {
              saveStateMsg = null;
            }
            await new Promise(resolve => setTimeout(resolve, 260 + (attempt * 120)));
          }
          const savePayload = saveStateMsg?.payload || {};
          const saveStateBuffer = (savePayload?.saveStateBuffer instanceof ArrayBuffer) ? savePayload.saveStateBuffer : null;
          const saveStateBytesLength = saveStateBuffer ? saveStateBuffer.byteLength : 0;
          push(savePayload.ok === true && saveStateBytesLength > 0,
            'Runtime save-state cycle',
            savePayload.ok === true
              ? `Saved ${saveStateBytesLength} bytes.`
              : `Save state unavailable (${String(savePayload.reason || 'unknown')}).`);

          if (saveStateBytesLength > 0) {
            try {
              let controlOk = false;
              let controlMsg = '';
              try {
                const directState = new Uint8Array(saveStateBuffer);
                const directResult = await requestRuntimeControl('load_state', {
                  saveStateBuffer: directState.buffer.slice(directState.byteOffset, directState.byteOffset + directState.byteLength)
                });
                controlOk = !!directResult?.ok;
                controlMsg = controlOk
                  ? `Runtime-control load_state ok (${Number(directResult.loadedBytes) || directState.byteLength} bytes).`
                  : `Runtime-control load_state failed (${String(directResult?.reason || 'unknown')}).`;
              } catch (directErr) {
                controlMsg = `Runtime-control load_state failed (${directErr?.message || String(directErr)}).`;
              }
              if (controlOk) {
                push(true, 'Runtime load-state cycle', controlMsg);
              } else {
                const liveRomCopy = new Uint8Array(romData.data);
                const liveStateCopy = new Uint8Array(saveStateBuffer);
                const loadPayload = await postLiveRomWithState(liveRomCopy, liveStateCopy);
                const loadReason = String(loadPayload?.reason || '');
                const nonFatalLoad = loadReason.includes('state-load-failed') || loadReason.includes('state-load-timeout') || loadReason.includes('no-state');
                if (loadPayload?.ok === true || nonFatalLoad) {
                  push(true, 'Runtime load-state cycle', `Hot-swap load state ok (${Number(loadPayload.loadedBytes) || 0} bytes).`);
                } else {
                  push(false, 'Runtime load-state cycle', `${controlMsg} | Hot-swap failed (${loadReason || 'unknown'}).`);
                }
              }
            } catch (err) {
              push(false, 'Runtime load-state cycle', err?.message || String(err));
            }
          } else {
            push(false, 'Runtime load-state cycle', 'Skipped because save state bytes were empty.');
          }
        } catch (err) {
          push(false, 'Preview pipeline', err?.message || String(err));
        } finally {
          const passed = results.filter(r => r.pass).length;
          const failed = results.length - passed;
          const summary = `Preview pipeline tests completed: ${passed}/${results.length} passed, ${failed} failed.`;
          const detailLines = results.map(r => `${r.pass ? 'PASS' : 'FAIL'} - ${r.name}${r.info ? ': ' + r.info : ''}`);
          setPreviewPipelineResults(results);
          setPreviewPipelineStatus(summary);
          const reportText = `Preview Pipeline Report\n${summary}\n${detailLines.join('\n')}`;
          if (failed > 0) {
            setSuccess('');
            setError('');
            setTimeout(() => setError(reportText), 0);
          } else {
            setError('');
            setSuccess('');
            setTimeout(() => setSuccess(reportText), 0);
          }
          if (results.length === 0) {
            setTimeout(() => setError('Preview Pipeline Report\nNo checks executed.'), 0);
          }
          setIsProcessing(false);
          setProcessingText('');
          setProgress(0);
        }
      }, [
        romData,
        scenePreviewMode,
        wasmPreviewUrl,
        systemInfo,
        handleStartWasmPreview,
        getWasmCoreForSystem,
        postLiveRomWithState,
        requestRuntimeControl
      ]);

      const runRomPreview = useCallback((explicitOffset = null) => {
        if (!romData || !romPreviewWorker.current) return;
        const selectedEntry = allTexts.find(t => Number.isFinite(t?.id) && t.id === selectedTextId) || null;
        const selectedOffset = selectedEntry?.startByte;
        let focus = 0;
        if (romPreviewMode === 'manual') {
          focus = parseNumericInput(romPreviewOffsetInput, 0);
        } else if (Number.isFinite(explicitOffset)) {
          focus = Math.max(0, Math.floor(Number(explicitOffset)));
        } else if (Number.isFinite(selectedOffset)) {
          focus = selectedOffset;
        } else if (Number.isFinite(pointerTargetOffset)) {
          focus = pointerTargetOffset;
        }
        const romBuffer = romData.data.buffer.slice(0);
        setRomPreviewStatus('Rendering ROM tile preview...');
        romPreviewWorker.current.postMessage({
          type: 'romPreview',
          payload: {
            romBuffer,
            systemName: systemInfo?.name || 'Unknown',
            focusOffset: focus
          }
        }, [romBuffer]);
      }, [romData, systemInfo, allTexts, selectedTextId, pointerTargetOffset, romPreviewMode, romPreviewOffsetInput, parseNumericInput]);

      useEffect(() => {
        if (!romPreviewData || !previewCanvasRef.current) return;
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = Math.max(8, Number(romPreviewData.width) || 160);
        const height = Math.max(8, Number(romPreviewData.height) || 144);
        canvas.width = width;
        canvas.height = height;
        const px = romPreviewData.pixels instanceof Uint8ClampedArray ? romPreviewData.pixels : new Uint8ClampedArray(width * height * 4);
        ctx.putImageData(new ImageData(px, width, height), 0, 0);
      }, [romPreviewData]);

      useEffect(() => {
        if (!runtimeVizData || !runtimeVizCanvasRef.current) return;
        const canvas = runtimeVizCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = Math.max(8, Number(runtimeVizData.width) || 256);
        const height = Math.max(8, Number(runtimeVizData.height) || 240);
        canvas.width = width;
        canvas.height = height;
        const px = runtimeVizData.pixels instanceof Uint8ClampedArray
          ? runtimeVizData.pixels
          : new Uint8ClampedArray(width * height * 4);
        ctx.putImageData(new ImageData(px, width, height), 0, 0);
      }, [runtimeVizData]);

      useEffect(() => {
        if (!scenePreviewWorker.current || !romData || !tableData) return;
        const romBuffer = romData.data.buffer.slice(0);
        const requestId = ++sceneFontSourceSeqRef.current;
        scenePreviewWorker.current.postMessage({
          type: 'setFontSource',
          payload: {
            requestId,
            romBuffer,
            singleByte: tableData.singleByte || {},
            multiByte: tableData.multiByte || {},
            systemName: systemInfo?.name || 'Unknown',
            sampleText: '',
            manualOffset: null,
            bpp: null,
            variant: 'auto',
            detectMode: 'auto',
            candidateOffsets: []
          }
        }, [romBuffer]);
      }, [
        romData,
        tableData,
        systemInfo,
        workerEpoch
      ]);

      useEffect(() => {
        if (!scenePreviewWorker.current) return;
        pushFontPreviewBackgroundToWorker(fontPreviewBackgroundRef.current);
      }, [workerEpoch, pushFontPreviewBackgroundToWorker, fontPreviewBackgroundMeta]);

      useEffect(() => {
        if (scenePreviewMode === 'wasm' && !wasmPreviewUrl && romData) {
          handleStartWasmPreview();
        }
      }, [scenePreviewMode, wasmPreviewUrl, romData, handleStartWasmPreview]);

      useEffect(() => {
        const prev = prevActiveTabRef.current;
        if (activeTab === 'extraction' && prev !== 'extraction') {
          setScenePreviewMode('font');
        }
        prevActiveTabRef.current = activeTab;
      }, [activeTab]);

      useEffect(() => {
        if (scenePreviewMode !== 'wasm') return;
        if (!wasmPreviewUrl || !romData) return;
        if (runtimeRemountSyncRef.current) return;
        const t = setTimeout(() => { postRomToWasmRuntime(true); }, 120);
        return () => clearTimeout(t);
      }, [scenePreviewMode, wasmPreviewUrl, romData, systemInfo, postRomToWasmRuntime]);

      useEffect(() => {
        if (scenePreviewMode !== 'wasm') return;
        if (!wasmPreviewUrl) return;
        if (runtimeRemountSyncRef.current) return;
        const timer = setTimeout(() => {
          if (!postSceneToWasmRuntime()) {
            setWasmPreviewStatus('WASM runtime iframe is loading...');
          }
        }, 120);
        return () => clearTimeout(timer);
      }, [scenePreviewMode, wasmPreviewUrl, selectedPreviewText, postSceneToWasmRuntime]);

      useEffect(() => {
        const onRuntimeMessage = (event) => {
          const data = event?.data;
          if (!data || typeof data !== 'object') return;
          if (data.source !== 'pt-wasm-runtime') return;
          const payload = data.payload || {};
          if (data.type === 'pt-runtime-ready') {
            wasmRuntimeBootRef.current.pending = false;
            wasmCoreReadyRef.current = true;
            setShowWasmRuntimeReport(true);
            setWasmPreviewStatus(`WASM runtime ready (${payload.system || 'Unknown'} -> ${payload.core || 'generic'}).`);
            return;
          }
          if (data.type === 'pt-runtime-core-ready') {
            wasmRuntimeBootRef.current.pending = false;
            wasmCoreReadyRef.current = true;
            setShowWasmRuntimeReport(true);
            setWasmPreviewStatus(`WASM core ready (${payload.system || 'Unknown'} -> ${payload.core || 'generic'}).`);
            return;
          }
          if (data.type === 'pt-runtime-ack') {
            const frameId = Number(payload.frameId) || 0;
            wasmCoreReadyRef.current = true;
            setWasmPreviewStatus(frameId > 0 ? `WASM runtime rendered frame #${frameId}.` : 'WASM runtime rendered frame.');
            return;
          }
          if (data.type === 'pt-runtime-audio-result') {
            const muted = !!payload.muted;
            setWasmPreviewStatus(`WASM runtime audio ${muted ? 'muted' : 'unmuted'}.`);
            return;
          }
          if (data.type === 'pt-runtime-control-result' || data.type === 'pt-runtime-fastforward-result') {
            const requestId = Number(payload.requestId) || 0;
            const pending = runtimeControlPendingRef.current.get(requestId);
            if (!pending) return;
            runtimeControlPendingRef.current.delete(requestId);
            clearTimeout(pending.timerId);
            if (payload.ok !== true) {
              pending.reject(new Error(String(payload.reason || `${pending.action || 'runtime-control'}-failed`)));
              return;
            }
            const result = { ...payload };
            if (payload.saveStateBuffer instanceof ArrayBuffer) {
              result.saveStateBytes = new Uint8Array(payload.saveStateBuffer);
            }
            if (payload.frameBuffer instanceof ArrayBuffer) {
              result.framePixels = new Uint8ClampedArray(payload.frameBuffer);
              result.frameWidth = Number(payload.frameWidth) || 0;
              result.frameHeight = Number(payload.frameHeight) || 0;
            }
            pending.resolve(result);
            return;
          }
          if (data.type === 'pt-runtime-scene-redraw-result') {
            const requestId = Number(payload.requestId) || 0;
            if (requestId > 0) {
              const pending = runtimeRedrawPendingRef.current.get(requestId);
              if (pending) {
                runtimeRedrawPendingRef.current.delete(requestId);
                clearTimeout(pending.timerId);
                pending.resolve({
                  ok: !!payload.ok,
                  reason: String(payload.reason || (payload.ok ? 'ok' : 'unavailable'))
                });
              }
            }
            const ok = !!payload.ok;
            setWasmPreviewStatus(ok ? 'Runtime scene redraw requested.' : 'Runtime scene redraw not available for current core.');
            return;
          }
          if (data.type === 'pt-runtime-save-state-result') {
            const requestId = Number(payload.requestId) || 0;
            const pending = liveSaveStatePendingRef.current.get(requestId);
            if (!pending) return;
            liveSaveStatePendingRef.current.delete(requestId);
            clearTimeout(pending.timerId);
            if (payload.ok !== true) {
              pending.reject(new Error(String(payload.reason || 'save-state-unavailable')));
              return;
            }
            const saveStateBuffer = payload.saveStateBuffer;
            const stateBytes = saveStateBuffer
              ? new Uint8Array(saveStateBuffer)
              : new Uint8Array(0);
            if (stateBytes.byteLength > 0) {
              liveSaveStateRef.current = stateBytes;
              setRuntimeSaveStateBytes(stateBytes.byteLength);
              setWasmPreviewStatus(`Runtime save state captured (${stateBytes.byteLength} bytes).`);
            }
            pending.resolve(stateBytes);
            return;
          }
          if (data.type === 'pt-runtime-load-state-result') {
            const requestId = Number(payload.requestId) || 0;
            const pending = runtimeLoadPendingRef.current.get(requestId);
            if (pending) {
              runtimeLoadPendingRef.current.delete(requestId);
              clearTimeout(pending.timerId);
              const reasonText = String(payload.reason || '');
              if (payload.ok === true) {
                pending.resolve({
                  ok: true,
                  loadedBytes: Number(payload.loadedBytes) || 0,
                  reason: reasonText || 'state-restored'
                });
              } else if (
                reasonText.includes('state-load-failed') ||
                reasonText.includes('no-state') ||
                reasonText.includes('state-load-timeout') ||
                reasonText.includes('runtime-boot-timeout')
              ) {
                pending.resolve({
                  ok: false,
                  loadedBytes: Number(payload.loadedBytes) || 0,
                  reason: reasonText || 'state-load-failed'
                });
              } else {
                pending.reject(new Error(reasonText || 'state-load-failed'));
              }
            }
            const loadedBytes = Number(payload.loadedBytes) || 0;
            const reason = String(payload.reason || '');
            setWasmPreviewStatus(
              payload.ok === true
                ? `Runtime ROM hot-swap complete${loadedBytes > 0 ? ` (${loadedBytes} state bytes restored)` : ''}.`
                : `Runtime ROM hot-swap failed: ${reason || 'state-load-failed'}`
            );
            runtimeRemountSyncRef.current = false;
            pendingRuntimeLoadRef.current = null;
            return;
          }
          if (data.type === 'pt-runtime-notify') {
            const msg = String(payload.message || '').trim();
            if (msg) setWasmPreviewStatus(msg);
            return;
          }
          if (data.type === 'pt-runtime-error') {
            wasmRuntimeBootRef.current.pending = false;
            wasmCoreReadyRef.current = false;
            runtimeRemountSyncRef.current = false;
            pendingRuntimeLoadRef.current = null;
            for (const [requestId, pending] of liveSaveStatePendingRef.current.entries()) {
              clearTimeout(pending.timerId);
              try { pending.reject(new Error(String(payload.message || 'runtime-error'))); } catch (_) { }
              liveSaveStatePendingRef.current.delete(requestId);
            }
            for (const [requestId, pending] of runtimeLoadPendingRef.current.entries()) {
              clearTimeout(pending.timerId);
              try { pending.reject(new Error(String(payload.message || 'runtime-error'))); } catch (_) { }
              runtimeLoadPendingRef.current.delete(requestId);
            }
            setShowWasmRuntimeReport(true);
            setWasmPreviewStatus(`WASM runtime error: ${String(payload.message || 'unknown')}`);
            setWasmPreviewWarning('WASM runtime adapter reported an error. Switch to Internal Font Renderer if needed.');
          }
        };
        window.addEventListener('message', onRuntimeMessage);
        return () => {
          window.removeEventListener('message', onRuntimeMessage);
          for (const pending of liveSaveStatePendingRef.current.values()) {
            clearTimeout(pending.timerId);
          }
          liveSaveStatePendingRef.current.clear();
          for (const pending of runtimeLoadPendingRef.current.values()) {
            clearTimeout(pending.timerId);
          }
          runtimeLoadPendingRef.current.clear();
          for (const pending of runtimeControlPendingRef.current.values()) {
            clearTimeout(pending.timerId);
          }
          runtimeControlPendingRef.current.clear();
          for (const pending of runtimeRedrawPendingRef.current.values()) {
            clearTimeout(pending.timerId);
            pending.resolve({ ok: false, reason: 'cleanup' });
          }
          runtimeRedrawPendingRef.current.clear();
        };
      }, []);

      useEffect(() => {
        if (!scenePreviewWorker.current) return;
        refreshScenePreviewLayout();
      }, [refreshScenePreviewLayout, selectedPreviewText, scenePreviewMode, sceneFontSourceMeta.offset]);

      useEffect(() => {
        if (!scenePreviewFrame || !scenePreviewCanvasRef.current) return;
        const canvas = scenePreviewCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = Math.max(16, Number(scenePreviewFrame.width) || 640);
        const h = Math.max(16, Number(scenePreviewFrame.height) || 360);
        canvas.width = w;
        canvas.height = h;
        const px = scenePreviewFrame.pixels instanceof Uint8ClampedArray
          ? scenePreviewFrame.pixels
          : new Uint8ClampedArray(w * h * 4);
        ctx.putImageData(new ImageData(px, w, h), 0, 0);
        if (scenePreviewMode === 'font') {
          const previewLines = Array.isArray(fontPreviewLayout?.lines) ? fontPreviewLayout.lines : [];
          const safePadding = Math.max(6, Math.min(72, Number(fontPreviewPadding) || 14));
          const lineHeight = Math.max(10, Math.min(42, Number(fontPreviewLineHeight) || 20));
          const renderLineHeight = lineHeight;
          const maxLines = Math.max(1, Number(fontPreviewLayout?.maxLines) || 4);
          const autoBoxHeight = Math.floor((renderLineHeight * maxLines) + (safePadding * 1.9) + 18);
          const minBoxHeight = Math.floor(h * 0.28);
          const maxBoxHeight = Math.floor(h * 0.72);
          const boxHeight = Math.max(minBoxHeight, Math.min(maxBoxHeight, autoBoxHeight));
          const boxY = Math.max(0, Math.min(h - boxHeight, h - boxHeight - safePadding));
          const textX = safePadding + Math.max(8, Math.floor(safePadding * 0.6));
          const textY = boxY + Math.max(12, Math.floor(safePadding * 0.78));
          const maxTextWidth = Math.max(32, w - (safePadding * 2) - 16);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.74)';
          ctx.fillRect(safePadding, boxY, Math.max(32, w - (safePadding * 2)), boxHeight);
          ctx.save();
          ctx.font = `bold ${Math.max(13, Math.floor(renderLineHeight * 1.02))}px "Consolas","Courier New",monospace`;
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(246, 248, 250, 0.98)';
          ctx.shadowColor = 'rgba(8, 12, 18, 0.82)';
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          for (let i = 0; i < previewLines.length && i < maxLines; i++) {
            ctx.fillText(String(previewLines[i] || ''), textX, textY + (i * renderLineHeight), maxTextWidth);
          }
          ctx.restore();
        }
        if (scenePreviewMode === 'wasm' && !runtimeRemountSyncRef.current) {
          postSceneToWasmRuntime();
        }
      }, [scenePreviewFrame, scenePreviewMode, postSceneToWasmRuntime, fontPreviewLayout, fontPreviewPadding, fontPreviewLineHeight]);

      useEffect(() => {
        if (!tileEditorData || !tileSheetCanvasRef.current) return;
        const canvas = tileSheetCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = Math.max(8, Number(tileEditorData.sheetWidth) || 8);
        const h = Math.max(8, Number(tileEditorData.sheetHeight) || 8);
        canvas.width = w;
        canvas.height = h;
        const px = tileEditorData.sheetPixels instanceof Uint8ClampedArray
          ? tileEditorData.sheetPixels
          : new Uint8ClampedArray(w * h * 4);
        ctx.putImageData(new ImageData(px, w, h), 0, 0);
        const cols = Math.max(1, Number(tileEditorData.tilesPerRow) || 1);
        const tile = Math.max(0, Number(tileEditorSelectedTile) || 0);
        const tx = (tile % cols) * 8;
        const ty = Math.floor(tile / cols) * 8;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 0.5, ty + 0.5, 7, 7);
      }, [tileEditorData, tileEditorSelectedTile]);

      useEffect(() => {
        if (!tileMapData || !tileMapCanvasRef.current) return;
        const canvas = tileMapCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const mapW = Math.max(1, Number(tileMapData.mapWidth) || 1);
        const mapH = Math.max(1, Number(tileMapData.mapHeight) || 1);
        const w = mapW * 8;
        const h = mapH * 8;
        canvas.width = w;
        canvas.height = h;
        if (tileMapData.mapPresent && tileMapData.mapPixels instanceof Uint8ClampedArray && tileMapData.mapPixels.length === w * h * 4) {
          ctx.putImageData(new ImageData(tileMapData.mapPixels, w, h), 0, 0);
        } else {
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, w, h);
        }
        if (tileEditorSelectedMapCell) {
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 1;
          ctx.strokeRect((tileEditorSelectedMapCell.x * 8) + 0.5, (tileEditorSelectedMapCell.y * 8) + 0.5, 7, 7);
        }
      }, [tileMapData, tileEditorSelectedMapCell]);

      useEffect(() => {
        if (!tileSelectedCanvasRef.current || !tileEditorData) return;
        const canvas = tileSelectedCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const logicalSize = 64;
        canvas.width = logicalSize;
        canvas.height = logicalSize;
        ctx.imageSmoothingEnabled = false;
        const tile = Math.max(0, Number(tileEditorSelectedTile) || 0);
        const cols = Math.max(1, Number(tileEditorData.tilesPerRow) || 1);
        const srcX = (tile % cols) * 8;
        const srcY = Math.floor(tile / cols) * 8;
        const temp = document.createElement('canvas');
        temp.width = Math.max(8, Number(tileEditorData.sheetWidth) || 8);
        temp.height = Math.max(8, Number(tileEditorData.sheetHeight) || 8);
        const tctx = temp.getContext('2d');
        if (!tctx) return;
        const px = tileEditorData.sheetPixels instanceof Uint8ClampedArray
          ? tileEditorData.sheetPixels
          : new Uint8ClampedArray(temp.width * temp.height * 4);
        tctx.putImageData(new ImageData(px, temp.width, temp.height), 0, 0);
        ctx.clearRect(0, 0, logicalSize, logicalSize);
        ctx.drawImage(temp, srcX, srcY, 8, 8, 0, 0, logicalSize, logicalSize);
        ctx.strokeStyle = '#2a2a2a';
        for (let i = 0; i <= 8; i++) {
          const p = i * 8;
          ctx.beginPath(); ctx.moveTo(p + 0.5, 0); ctx.lineTo(p + 0.5, logicalSize); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, p + 0.5); ctx.lineTo(logicalSize, p + 0.5); ctx.stroke();
        }
      }, [tileEditorData, tileEditorSelectedTile]);

      useEffect(() => {
        if (!romPreviewAutoRefresh) return;
        if (activeTab !== 'extraction' && activeTab !== 'pointer') return;
        if (!romData) return;
        runRomPreview();
      }, [romPreviewAutoRefresh, romData, selectedTextId, pointerTargetOffset, romPreviewMode, romPreviewOffsetInput, runRomPreview, activeTab]);

      const livePreviewAddressHint = useMemo(() => {
        if (!romData) return null;
        const selectedEntry = allTexts.find(t => Number.isFinite(t?.id) && t.id === selectedTextId) || null;
        if (!selectedEntry) return null;
        const textOffset = parseNumericInput(selectedEntry.offset, NaN);
        const manualOffset = parseNumericInput(romPreviewOffsetInput, NaN);
        let focus = Number.isFinite(textOffset) ? textOffset : 0;
        if (romPreviewMode === 'manual' && Number.isFinite(manualOffset)) focus = manualOffset;
        const systemName = String(systemInfo?.name || '').toLowerCase();
        let bytesPerTile = 16;
        let vramBase = 0x00000000;
        if (systemName.includes('gba')) { bytesPerTile = 32; vramBase = 0x06000000; }
        else if (systemName.includes('nds')) { bytesPerTile = 32; vramBase = 0x06000000; }
        else if (systemName.includes('3ds')) { bytesPerTile = 32; vramBase = 0x18000000; }
        else if (systemName.includes('snes')) { bytesPerTile = 32; vramBase = 0x00000000; }
        else if (systemName.includes('nes')) { bytesPerTile = 16; vramBase = 0x00000000; }
        else if (systemName.includes('game boy') || systemName.includes('gbc')) { bytesPerTile = 16; vramBase = 0x8000; }
        else if (systemName.includes('genesis')) { bytesPerTile = 32; vramBase = 0x00000000; }
        else if (systemName.includes('playstation')) { bytesPerTile = 32; vramBase = 0x00000000; }
        const tileIndex = Math.floor(Math.max(0, focus) / bytesPerTile);
        const paletteSlot = tileIndex % 16;
        const vramAddress = (vramBase + (tileIndex * bytesPerTile)) >>> 0;
        return {
          focus,
          tileIndex,
          paletteSlot,
          vramAddress
        };
      }, [romData, allTexts, selectedTextId, romPreviewMode, romPreviewOffsetInput, parseNumericInput, systemInfo]);

      const getHexViewConfig = useCallback(() => {
        const viewColumns = Math.max(HEX_MIN_COLUMNS, Math.min(HEX_MAX_COLUMNS, parseNumericInput(hexViewColumns, 16)));
        const safeRowLimit = Math.max(HEX_MIN_ROWS, Math.min(HEX_MAX_ROWS, parseNumericInput(hexRowLimit, 1024)));
        const requestedLength = Math.max(HEX_MIN_WINDOW_BYTES, parseNumericInput(hexViewLength, 4096));
        const maxByRows = safeRowLimit * viewColumns;
        const viewLength = Math.max(HEX_MIN_WINDOW_BYTES, Math.min(HEX_MAX_WINDOW_BYTES, maxByRows, requestedLength));
        return { viewColumns, safeRowLimit, requestedLength, viewLength };
      }, [
        parseNumericInput,
        hexViewColumns,
        hexRowLimit,
        hexViewLength,
        HEX_MIN_COLUMNS,
        HEX_MAX_COLUMNS,
        HEX_MIN_ROWS,
        HEX_MAX_ROWS,
        HEX_MIN_WINDOW_BYTES,
        HEX_MAX_WINDOW_BYTES
      ]);

      const runHexView = useCallback((focusOffset = null, explicitStart = null) => {
        if (!romData) { setError("No ROM loaded. Please load a ROM file first."); return; }
        if (!hexWorker.current) { setError("Hex worker is not available. Please refresh and try again."); return; }
        const romLength = romData.data.length;
        const { viewColumns, safeRowLimit, requestedLength, viewLength } = getHexViewConfig();
        let viewStart = Math.max(0, Math.min(romLength - 1, parseNumericInput(hexViewStart, 0)));
        if (Number.isFinite(explicitStart)) {
          viewStart = Math.max(0, Math.min(romLength - 1, Math.floor(Number(explicitStart))));
          setHexViewStart(`0x${viewStart.toString(16).toUpperCase().padStart(6, '0')}`);
        } else if (Number.isFinite(focusOffset)) {
          viewStart = Math.max(0, Math.min(romLength - 1, Math.floor(Number(focusOffset) - viewLength / 4)));
          setHexViewStart(`0x${viewStart.toString(16).toUpperCase().padStart(6, '0')}`);
        }
        setHexViewLength(viewLength);
        setHexViewColumns(viewColumns);
        setHexRowLimit(safeRowLimit);
        if (viewLength < requestedLength) {
          setHexStatus(`Requested ${requestedLength.toLocaleString()} bytes, clipped to ${viewLength.toLocaleString()} bytes for UI stability.`);
        }
        setIsProcessing(true);
        setProcessingText('Rendering hex view...');
        setProgress(5);
        const romBuffer = romData.data.buffer.slice(0);
        hexWorker.current.postMessage({
          type: 'hexView',
          payload: {
            romBuffer,
            start: viewStart,
            length: viewLength,
            columns: viewColumns,
            rowLimit: safeRowLimit,
            searchHex: hexSearchHex,
            maxMatches: 2000
          }
        }, [romBuffer]);
      }, [romData, hexViewStart, hexSearchHex, parseNumericInput, getHexViewConfig]);

      const formatHexByte = useCallback((value) => (Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0'), []);

      const moveHexWindow = useCallback((direction) => {
        if (!romData) return;
        const romLength = romData.data.length;
        const { viewLength } = getHexViewConfig();
        const currentStart = Math.max(0, Math.min(romLength - 1, parseNumericInput(hexViewStart, 0)));
        const nextStart = Math.max(0, Math.min(romLength - 1, currentStart + (direction * viewLength)));
        runHexView(null, nextStart);
      }, [romData, hexViewStart, parseNumericInput, runHexView, getHexViewConfig]);

      const selectHexByte = useCallback((offset, value) => {
        if (!Number.isFinite(offset)) return;
        setHexSelectedOffset(offset);
        setHexSelectedValue(formatHexByte(value));
        setHexNibbleBuffer('');
        setPointerMatches([]);
        setPointerStatus(`Selected 0x${offset.toString(16).toUpperCase().padStart(6, '0')}. Run pointer scan to inspect references.`);
      }, [formatHexByte]);

      const applyHexByteAtOffset = useCallback((offset, rawValue, autoAdvance = true, recordHistory = true) => {
        if (!romData || !Number.isFinite(offset)) return false;
        const cleaned = String(rawValue || '').trim().replace(/^0x/i, '').toUpperCase();
        if (!/^[0-9A-F]{2}$/.test(cleaned)) return false;
        const parsed = parseInt(cleaned, 16) & 0xFF;
        const nextData = new Uint8Array(romData.data);
        if (offset < 0 || offset >= nextData.length) return false;
        const previousValue = nextData[offset] & 0xFF;
        if (previousValue === parsed) {
          setHexSelectedOffset(offset);
          setHexSelectedValue(cleaned);
          return true;
        }
        nextData[offset] = parsed;
        if (recordHistory) {
          setHexUndoStack(prev => {
            const next = [...prev, { offset, before: previousValue, after: parsed }];
            return next.length > HEX_HISTORY_LIMIT ? next.slice(next.length - HEX_HISTORY_LIMIT) : next;
          });
          setHexRedoStack([]);
        }
        setRomData(prev => prev ? { ...prev, data: nextData, size: nextData.length } : prev);
        setModifiedRom(null);
        setHasUnsavedChanges(true);
        setHexRows(prevRows => prevRows.map((row) => {
          const rowStart = row.offset;
          const rowEnd = row.offset + ((row.bytes && row.bytes.length) || 0);
          if (offset < rowStart || offset >= rowEnd) return row;
          const nextBytes = Array.isArray(row.bytes) ? [...row.bytes] : [];
          nextBytes[offset - rowStart] = parsed;
          const nextAscii = nextBytes.map((b) => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
          const nextHex = nextBytes.map((b) => formatHexByte(b)).join(' ');
          return { ...row, bytes: nextBytes, ascii: nextAscii, hex: nextHex };
        }));
        if (autoAdvance) {
          const nextOffset = Math.min(nextData.length - 1, offset + 1);
          setHexSelectedOffset(nextOffset);
          setHexSelectedValue(formatHexByte(nextData[nextOffset]));
          if (nextOffset < hexWindowStart || nextOffset >= hexWindowEnd) {
            runHexView(nextOffset);
          }
        } else {
          setHexSelectedOffset(offset);
          setHexSelectedValue(cleaned);
        }
        return true;
      }, [romData, formatHexByte, hexWindowStart, hexWindowEnd, runHexView, HEX_HISTORY_LIMIT]);

      const undoHexEdit = useCallback(() => {
        if (hexUndoStack.length === 0) return;
        const last = hexUndoStack[hexUndoStack.length - 1];
        const applied = applyHexByteAtOffset(last.offset, formatHexByte(last.before), false, false);
        if (!applied) return;
        setHexUndoStack(prev => prev.slice(0, -1));
        setHexRedoStack(prev => {
          const next = [...prev, last];
          return next.length > HEX_HISTORY_LIMIT ? next.slice(next.length - HEX_HISTORY_LIMIT) : next;
        });
      }, [hexUndoStack, applyHexByteAtOffset, formatHexByte, HEX_HISTORY_LIMIT]);

      const redoHexEdit = useCallback(() => {
        if (hexRedoStack.length === 0) return;
        const last = hexRedoStack[hexRedoStack.length - 1];
        const applied = applyHexByteAtOffset(last.offset, formatHexByte(last.after), false, false);
        if (!applied) return;
        setHexRedoStack(prev => prev.slice(0, -1));
        setHexUndoStack(prev => {
          const next = [...prev, last];
          return next.length > HEX_HISTORY_LIMIT ? next.slice(next.length - HEX_HISTORY_LIMIT) : next;
        });
      }, [hexRedoStack, applyHexByteAtOffset, formatHexByte, HEX_HISTORY_LIMIT]);

      const jumpToHexOffset = useCallback((offset, preservePointerContext = false) => {
        if (!romData || !Number.isFinite(offset)) return;
        const clamped = Math.max(0, Math.min(romData.data.length - 1, Math.floor(offset)));
        setHexSelectedOffset(clamped);
        setHexSelectedValue(formatHexByte(romData.data[clamped]));
        setHexNibbleBuffer('');
        if (!preservePointerContext) {
          setPointerMatches([]);
          setHexPointerHighlights([]);
          setPointerStatus(`Selected 0x${clamped.toString(16).toUpperCase().padStart(6, '0')}. Run pointer scan to inspect references.`);
        } else {
          setPointerStatus(prev => prev || `Selected 0x${clamped.toString(16).toUpperCase().padStart(6, '0')}.`);
        }
        runHexView(clamped);
      }, [romData, formatHexByte, runHexView]);

      const addHexBookmark = useCallback(() => {
        if (!Number.isFinite(hexSelectedOffset)) return;
        const target = Math.floor(hexSelectedOffset);
        setHexBookmarks(prev => {
          if (prev.some(item => item.offset === target)) return prev;
          const next = [...prev, { offset: target, label: `0x${target.toString(16).toUpperCase().padStart(6, '0')}` }];
          return next.length > HEX_BOOKMARK_LIMIT ? next.slice(next.length - HEX_BOOKMARK_LIMIT) : next;
        });
      }, [hexSelectedOffset, HEX_BOOKMARK_LIMIT]);

      const removeHexBookmark = useCallback((offset) => {
        setHexBookmarks(prev => prev.filter(item => item.offset !== offset));
      }, []);

      const scanPointersAtOffset = useCallback((targetOffset, sourceLabel = 'Selection') => {
        if (!romData) { setError("No ROM loaded. Please load a ROM file first."); return false; }
        if (!pointerWorker.current) { setError("Pointer worker is not available. Please refresh and try again."); return false; }
        if (!Number.isFinite(targetOffset)) { setError("Invalid pointer target offset."); return false; }
        const clampedOffset = Math.max(0, Math.min(romData.data.length - 1, Math.floor(targetOffset)));
        setHexSelectedOffset(clampedOffset);
        setHexSelectedValue(formatHexByte(romData.data[clampedOffset]));
        setHexNibbleBuffer('');
        setPointerTargetOffset(clampedOffset);
        setHexPointerHighlights([]);
        setIsProcessing(true);
        setProcessingText('Scanning pointers...');
        setProgress(10);
        setPointerStatus(`Scanning pointers for 0x${clampedOffset.toString(16).toUpperCase().padStart(6, '0')} (${sourceLabel})...`);
        const romBuffer = romData.data.buffer.slice(0);
        pointerWorker.current.postMessage({
          type: 'pointerScan',
          payload: {
            romBuffer,
            targetOffset: clampedOffset,
            system: systemInfo || {},
            maxMatches: 2000
          }
        }, [romBuffer]);
        return true;
      }, [romData, systemInfo, formatHexByte]);

      const scanPointersForSelection = useCallback(() => {
        if (!Number.isFinite(hexSelectedOffset)) { setError("Select a byte first before scanning pointers."); return; }
        scanPointersAtOffset(hexSelectedOffset, 'Hex Editor');
      }, [hexSelectedOffset, scanPointersAtOffset]);

      const scanPointersFromPointerLab = useCallback(() => {
        const selectedTextId = parseNumericInput(pointerLabTextId, NaN);
        if (Number.isFinite(selectedTextId)) {
          const targetText = allTexts.find(t => t.id === selectedTextId);
          if (targetText) {
            const parsedOffset = parseNumericInput(targetText.offset, NaN);
            if (Number.isFinite(parsedOffset)) {
              setPointerLabOffsetInput(`0x${parsedOffset.toString(16).toUpperCase().padStart(6, '0')}`);
              scanPointersAtOffset(parsedOffset, `Text ID ${selectedTextId}`);
              return;
            }
          }
        }
        const parsedManualOffset = parseNumericInput(pointerLabOffsetInput, NaN);
        if (!Number.isFinite(parsedManualOffset)) {
          setError("Pointer offset is invalid. Use format like 0x00EA860.");
          return;
        }
        scanPointersAtOffset(parsedManualOffset, 'Pointer Target');
      }, [pointerLabTextId, pointerLabOffsetInput, allTexts, parseNumericInput, scanPointersAtOffset]);

      const locateTextInHex = useCallback((textEntry) => {
        const parsedOffset = parseNumericInput(textEntry?.offset, NaN);
        if (!Number.isFinite(parsedOffset)) {
          setError(`Cannot open Hex for text ID ${textEntry?.id ?? 'N/A'}: invalid offset.`);
          return;
        }
        setSelectedTextId(Number.isFinite(textEntry?.id) ? textEntry.id : null);
        const linkedGroup = pointerGroups.find(group =>
          (Number.isFinite(group.textId) && group.textId === textEntry.id) ||
          (Number.isFinite(group.targetOffset) && group.targetOffset === parsedOffset)
        );
        if (linkedGroup && Array.isArray(linkedGroup.pointers)) {
          setHexPointerHighlights(linkedGroup.pointers.map(p => p.ptrOffset).filter(v => Number.isFinite(v)));
        } else {
          setHexPointerHighlights([]);
        }
        jumpToHexOffset(parsedOffset);
        setActiveTab('hex');
      }, [parseNumericInput, jumpToHexOffset, pointerGroups]);

      const locateTextPointers = useCallback((textEntry) => {
        const parsedOffset = parseNumericInput(textEntry?.offset, NaN);
        if (!Number.isFinite(parsedOffset)) {
          setError(`Cannot scan pointer for text ID ${textEntry?.id ?? 'N/A'}: invalid offset.`);
          return;
        }
        setSelectedTextId(Number.isFinite(textEntry?.id) ? textEntry.id : null);
        setPointerLabTextId(String(textEntry.id ?? ''));
        setPointerLabOffsetInput(`0x${parsedOffset.toString(16).toUpperCase().padStart(6, '0')}`);
        scanPointersAtOffset(parsedOffset, `Text ID ${textEntry.id ?? 'N/A'}`);
        setActiveTab('hex');
      }, [parseNumericInput, scanPointersAtOffset]);

      const handleSelectTextEntry = useCallback((textId) => {
        const numericId = Number(textId);
        if (!Number.isFinite(numericId)) return;
        setSelectedTextId(numericId);
        const entry = allTexts.find(t => t.id === numericId);
        if (!entry) return;
        const parsedOffset = parseNumericInput(entry.offset, NaN);
        if (Number.isFinite(parsedOffset)) {
          setHexSelectedOffset(parsedOffset);
          if (romData?.data && parsedOffset >= 0 && parsedOffset < romData.data.length) {
            setHexSelectedValue((romData.data[parsedOffset] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
          }
        }
        const linkedGroup = pointerGroups.find(group =>
          (Number.isFinite(group.textId) && group.textId === numericId) ||
          (Number.isFinite(parsedOffset) && Number.isFinite(group.targetOffset) && group.targetOffset === parsedOffset)
        );
        if (linkedGroup && Array.isArray(linkedGroup.pointers)) {
          setHexPointerHighlights(linkedGroup.pointers.map(p => p.ptrOffset).filter(v => Number.isFinite(v)));
        }
      }, [allTexts, parseNumericInput, romData, pointerGroups]);

      const openTextEntryByTargetOffset = useCallback((targetOffset) => {
        if (!Number.isFinite(targetOffset)) return;
        const entry = allTexts.find(t => parseNumericInput(t.offset, NaN) === targetOffset);
        if (!entry) return;
        handleSelectTextEntry(entry.id);
        setPointerLabTextId(String(entry.id));
        setSearchTerm(String(entry.id));
        setActiveTab('extraction');
      }, [allTexts, parseNumericInput, handleSelectTextEntry]);

      const handleRuntimeDumpLoad = useCallback(async (event) => {
        try {
          const file = event?.target?.files?.[0];
          if (!file) return;
          const buffer = await file.arrayBuffer();
          const dump = new Uint8Array(buffer);
          setRuntimeRamData(dump);
          setRuntimeRamName(file.name || 'ram_dump.bin');
          setRuntimeRamHits([]);
          setRuntimeRamStatus(`RAM dump loaded: ${(file.name || 'ram_dump.bin')} (${dump.length.toLocaleString()} bytes).`);
        } catch (loadError) {
          console.error('Runtime RAM load failed:', loadError);
          setError(`Runtime RAM load failed: ${loadError.message || 'Unknown error'}`);
        } finally {
          if (event?.target) event.target.value = '';
        }
      }, []);

      const runRuntimeRamSearchForSelectedText = useCallback(async () => {
        try {
          if (!runtimeRamData || runtimeRamData.length === 0) {
            setError('Load a RAM dump first.');
            return;
          }
          if (!tokenizer || !masterCharToHex || masterCharToHex.size === 0) {
            setError('Load a valid table first to encode search bytes.');
            return;
          }
          const selectedEntry = allTexts.find(t => Number.isFinite(t?.id) && t.id === selectedTextId);
          if (!selectedEntry) {
            setError('Select a text entry first.');
            return;
          }
          const searchText = String(selectedEntry.translatedText || '').trim() || String(selectedEntry.originalText || '').trim();
          if (!searchText) {
            setError('Selected text entry is empty.');
            return;
          }
          const encoded = smartTextParse(searchText, tokenizer, masterCharToHex, options.usePaddingByte);
          if (!encoded || encoded.length < 2) {
            setError('Selected text cannot be encoded with current table.');
            return;
          }
          if (!runtimeRamWorker.current) {
            setError('Runtime RAM worker is not available. Please refresh and try again.');
            return;
          }
          const ramBuffer = runtimeRamData.buffer.slice(0);
          const queryBuffer = encoded.buffer.slice(0);
          setRuntimeRamStatus(`Scanning runtime RAM for Text ID ${selectedEntry.id}...`);
          setIsProcessing(true);
          setProcessingText('Scanning runtime RAM...');
          setProgress(0);
          runtimeRamWorker.current.postMessage({
            type: 'runtimeSearch',
            payload: {
              ramBuffer,
              queryBuffer,
              limit: 2048,
              textId: selectedEntry.id
            }
          }, [ramBuffer, queryBuffer]);
        } catch (scanError) {
          console.error('Runtime RAM scan failed:', scanError);
          setError(`Runtime RAM scan failed: ${scanError.message || 'Unknown error'}`);
        }
      }, [runtimeRamData, tokenizer, masterCharToHex, allTexts, selectedTextId, options.usePaddingByte]);

      const handleRuntimeDomainLoad = useCallback(async (event) => {
        try {
          const file = event?.target?.files?.[0];
          if (!file) return;
          const buffer = await file.arrayBuffer();
          const dump = new Uint8Array(buffer);
          setRuntimeDomainDump(dump);
          setRuntimeDomainName(file.name || 'runtime_domain.bin');
          setRuntimeVizData(null);
          setRuntimeVizStatus(`Runtime domain dump loaded: ${(file.name || 'runtime_domain.bin')} (${dump.length.toLocaleString()} bytes).`);
        } catch (loadError) {
          console.error('Runtime domain load failed:', loadError);
          setError(`Runtime domain load failed: ${loadError.message || 'Unknown error'}`);
        } finally {
          if (event?.target) event.target.value = '';
        }
      }, []);

      const runRuntimeDomainRender = useCallback(() => {
        if (!runtimeDomainDump || runtimeDomainDump.length === 0) {
          setError('Load a runtime domain dump first.');
          return;
        }
        if (!runtimeVizWorker.current) {
          setError('Runtime Viz worker is not available. Please refresh and try again.');
          return;
        }
        const selectedSystem = runtimeDomainSystem === 'auto'
          ? (systemInfo?.name || 'NES')
          : runtimeDomainSystem;
        setIsProcessing(true);
        setProcessingText('Rendering runtime domain preview...');
        setProgress(8);
        const dumpBuffer = runtimeDomainDump.buffer.slice(0);
        runtimeVizWorker.current.postMessage({
          type: 'runtimeVizRender',
          payload: {
            dumpBuffer,
            systemName: selectedSystem,
            domainMode: runtimeDomainSystem
          }
        }, [dumpBuffer]);
      }, [runtimeDomainDump, runtimeDomainSystem, systemInfo]);

      const handleHexCustomTableLoad = useCallback(async (event) => {
        try {
          const file = event?.target?.files?.[0];
          if (!file) return;
          const content = await file.text();
          const lines = String(content || '').replace(/\r/g, '').split('\n');
          const singleByte = {};
          const multiByte = {};
          lines.forEach(rawLine => {
            if (!rawLine) return;
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith('//')) return;
            const commentIndex = rawLine.indexOf(';');
            const line = commentIndex > -1 ? rawLine.substring(0, commentIndex) : rawLine;
            const splitIndex = line.indexOf('=');
            if (splitIndex <= 0) return;
            const hexStr = line.substring(0, splitIndex).replace(/\s+/g, '').toUpperCase();
            if (!/^[0-9A-F]+$/.test(hexStr) || (hexStr.length % 2) !== 0) return;
            let char = line.substring(splitIndex + 1);
            if (char === undefined) char = '';
            char = String(char).replace(/^\s+/, '');
            if (char.trim() === '') return;
            if (char.trim() === '[SPACE]') char = ' ';
            const byteLen = hexStr.length / 2;
            if (byteLen === 1) singleByte[parseInt(hexStr, 16)] = char;
            else multiByte[hexStr] = char;
          });
          setHexCustomTableData({
            name: file.name || 'custom.tbl',
            singleByte,
            multiByte
          });
          setHexCustomTableName(file.name || 'custom.tbl');
          setSuccess(`Hex custom table loaded: ${file.name || 'custom.tbl'}`);
        } catch (loadError) {
          setError(`Hex custom table load failed: ${loadError.message || 'Unknown error'}`);
        } finally {
          if (event?.target) event.target.value = '';
        }
      }, []);

      const hexDecodeMap = useMemo(() => {
        if (hexAsciiMode === 'ascii') return new Map();
        const source = hexAsciiMode === 'project_table' ? tableData : hexCustomTableData;
        if (!source || !source.singleByte) return new Map();
        const map = new Map();
        Object.entries(source.singleByte).forEach(([k, v]) => {
          const key = Number(k);
          if (!Number.isFinite(key)) return;
          map.set(key & 0xFF, String(v ?? ''));
        });
        return map;
      }, [hexAsciiMode, tableData, hexCustomTableData]);

      const decodeHexViewChar = useCallback((byteVal) => {
        const byte = Number(byteVal) & 0xFF;
        if (hexAsciiMode === 'ascii') {
          if (byte >= 0x20 && byte <= 0x7E) return { ch: String.fromCharCode(byte), label: String.fromCharCode(byte) };
          return { ch: '.', label: '.' };
        }
        const mapped = hexDecodeMap.get(byte);
        if (!mapped) return { ch: '.', label: '.' };
        const token = String(mapped);
        if (token === ' ') return { ch: '·', label: '[SPACE]' };
        const upper = token.toUpperCase();
        if (upper === '[LINE]' || token === '/' || token === '\\n') return { ch: '?', label: token };
        if (/^\[[^\]]+\]$/.test(token)) return { ch: '¤', label: token };
        return { ch: token.length > 0 ? token[0] : '.', label: token.length > 0 ? token : '.' };
      }, [hexAsciiMode, hexDecodeMap]);

      const hexMatchCoverage = useMemo(() => {
        const set = new Set();
        const len = Math.max(1, hexMatchLength || 1);
        for (const start of hexMatches) {
          for (let i = 0; i < len; i++) set.add(start + i);
        }
        return set;
      }, [hexMatches, hexMatchLength]);

      const hexPointerHighlightSet = useMemo(() => {
        return new Set((hexPointerHighlights || []).filter(v => Number.isFinite(v)));
      }, [hexPointerHighlights]);

      useEffect(() => {
        if (activeTab === 'hex' && romData && hexRows.length === 0 && !isProcessing) {
          runHexView();
        }
      }, [activeTab, romData, hexRows.length, isProcessing, runHexView]);

      useEffect(() => {
        if (activeTab !== 'hex') return;
        const handleHexKeys = (ev) => {
          const lowerKey = String(ev.key || '').toLowerCase();
          if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
            if (lowerKey === 'z') {
              ev.preventDefault();
              if (ev.shiftKey) redoHexEdit();
              else undoHexEdit();
              return;
            }
            if (lowerKey === 'y') {
              ev.preventDefault();
              redoHexEdit();
              return;
            }
          }
          if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
          const tag = String(ev.target?.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
          if (!Number.isFinite(hexSelectedOffset) || !romData) return;
          const romLen = romData.data.length;
          const columns = Math.max(8, Math.min(32, parseNumericInput(hexViewColumns, 16)));
          const key = String(ev.key || '').toUpperCase();
          const moveSelection = (nextOffset) => {
            const clamped = Math.max(0, Math.min(romLen - 1, nextOffset));
            setHexSelectedOffset(clamped);
            setHexSelectedValue(formatHexByte(romData.data[clamped]));
            setHexNibbleBuffer('');
            setPointerMatches([]);
            setPointerStatus(`Selected 0x${clamped.toString(16).toUpperCase().padStart(6, '0')}. Run pointer scan to inspect references.`);
            if (clamped < hexWindowStart || clamped >= hexWindowEnd) runHexView(clamped);
          };
          if (/^[0-9A-F]$/.test(key)) {
            ev.preventDefault();
            const nextBuffer = (hexNibbleBuffer + key).slice(-2);
            setHexNibbleBuffer(nextBuffer);
            if (nextBuffer.length === 2) {
              applyHexByteAtOffset(hexSelectedOffset, nextBuffer, true);
              setHexNibbleBuffer('');
            }
            return;
          }
          if (key === 'BACKSPACE') {
            ev.preventDefault();
            setHexNibbleBuffer(prev => prev.length > 0 ? prev.slice(0, -1) : '');
            return;
          }
          if (key === 'ARROWRIGHT') { ev.preventDefault(); moveSelection(hexSelectedOffset + 1); return; }
          if (key === 'ARROWLEFT') { ev.preventDefault(); moveSelection(hexSelectedOffset - 1); return; }
          if (key === 'ARROWDOWN') { ev.preventDefault(); moveSelection(hexSelectedOffset + columns); return; }
          if (key === 'ARROWUP') { ev.preventDefault(); moveSelection(hexSelectedOffset - columns); return; }
        };
        window.addEventListener('keydown', handleHexKeys);
        return () => window.removeEventListener('keydown', handleHexKeys);
      }, [activeTab, hexSelectedOffset, romData, hexViewColumns, parseNumericInput, formatHexByte, hexWindowStart, hexWindowEnd, runHexView, hexNibbleBuffer, applyHexByteAtOffset, undoHexEdit, redoHexEdit]);

      const startRelativeSearch = useCallback(() => {
        if (!romData) { setError("No ROM loaded. Please load a ROM file first."); return; }
        if (!relativeSearchWorker.current) { setError("Generate table worker is not available. Please refresh and try again."); return; }
        if (relativeSearchMode === 'text' && !relativeSearchQuery.trim()) { setError("Search text is empty."); return; }
        if (relativeSearchMode === 'hex' && !relativeSearchHex.trim()) { setError("Hex query is empty."); return; }
        let tableQueryBytes = null;
        const tableQueryCandidates = [];
        let preSearchWarning = '';
        if (relativeSearchMode === 'text') {
          if (tableData && tokenizer && masterCharToHex && masterCharToHex.size > 0) {
            const variants = [];
            const pushVariant = (text) => {
              const value = String(text || '');
              if (!value) return;
              if (!variants.includes(value)) variants.push(value);
            };
            const toTitleCaseWords = (value) => String(value || '').replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
            const normalizedQuery = relativeSearchQuery.trim();
            pushVariant(normalizedQuery);
            pushVariant(normalizedQuery.toLowerCase());
            pushVariant(normalizedQuery.toUpperCase());
            if (normalizedQuery.length > 0) {
              pushVariant(normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1).toLowerCase());
              pushVariant(toTitleCaseWords(normalizedQuery.toLowerCase()));
            }
            if (normalizedQuery.includes(' ')) {
              const words = normalizedQuery.split(/\s+/).filter(w => w && w.length >= 3);
              for (const word of words) {
                pushVariant(word);
                pushVariant(word.toLowerCase());
                pushVariant(word.toUpperCase());
                pushVariant(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
              }
            }
            for (const variant of variants) {
              const encoded = smartTextParse(variant, tokenizer, masterCharToHex, false);
              if (encoded && encoded.length >= 2) {
                const bytes = Array.from(encoded);
                if (!tableQueryBytes) tableQueryBytes = bytes;
                tableQueryCandidates.push({ text: variant, bytes, source: `table:${variant}` });
              }
            }
          }
          if (!tableQueryBytes || tableQueryBytes.length < 2) {
            preSearchWarning = 'Warning: query could not be fully encoded by the table. Falling back to ASCII/retro search.';
          }
        }
        setIsProcessing(true); setProcessingText('Running generate table search...'); setProgress(0);
        setRelativeSearchStatus(preSearchWarning);
        const romBuffer = romData.data.buffer.slice(0);
        relativeSearchWorker.current.postMessage({
          type: 'relativeSearch',
          payload: {
            romBuffer,
            query: relativeSearchQuery,
            hexQuery: relativeSearchHex,
            mode: relativeSearchMode,
            paddingMode: relativeSearchPadding,
            queryBytes: tableQueryBytes,
            queryCandidates: tableQueryCandidates,
            systemName: systemInfo?.name || '',
            maxResults: 200
          }
        }, [romBuffer]);
      }, [romData, relativeSearchMode, relativeSearchQuery, relativeSearchHex, relativeSearchPadding, tableData, tokenizer, masterCharToHex, systemInfo]);

      const createTableFromRelativeResult = useCallback(() => {
        if (!romData || !relativeSearchSelected) { setError("No search result selected."); return; }
        if (relativeSearchMode !== 'text') { setError("Generate table is only available for text search."); return; }
        const query = relativeSearchQuery;
        if (!query || query.length < 2) { setError("Search text is too short."); return; }
        const { offsetGuess, mode } = relativeSearchSelected;
        if (offsetGuess === undefined || offsetGuess === null || Number.isNaN(offsetGuess)) {
          setError("Selected result does not have a valid offset guess.");
          return;
        }
        if (tableContent && tableContent.trim().length > 0) {
          const ok = window.confirm("Replace current table with the generated table?");
          if (!ok) return;
        }
        const formatHex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
        const entries = [];
        const retroAlphaNumeric = " 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const useRetroCharset = systemInfo?.name === "NES" || systemInfo?.name === "SNES" || systemInfo?.name === "Game Boy" || systemInfo?.name === "GBC";
        if (useRetroCharset) {
          for (let idx = 0; idx < retroAlphaNumeric.length; idx++) {
            const b = (idx + offsetGuess) & 0xFF;
            const key = mode === 'none'
              ? formatHex(b)
              : (mode === 'le' ? (formatHex(b) + '00') : ('00' + formatHex(b)));
            const keyValue = parseInt(key, 16);
            entries.push({ key, char: retroAlphaNumeric[idx], keyValue });
          }
        } else {
          for (let c = 0x20; c <= 0x7E; c++) {
            const b = (c + offsetGuess) & 0xFF;
            const key = mode === 'none'
              ? formatHex(b)
              : (mode === 'le' ? (formatHex(b) + '00') : ('00' + formatHex(b)));
            const keyValue = parseInt(key, 16);
            entries.push({ key, char: String.fromCharCode(c), keyValue });
          }
        }
        entries.sort((a, b) => a.keyValue - b.keyValue);
        const existingKeys = new Set(entries.map(e => e.key));
        const makeControlKey = (byteVal) => {
          const hex = formatHex(byteVal);
          if (mode === 'none') return hex;
          return mode === 'le' ? (hex + '00') : ('00' + hex);
        };
        const controlLines = [];
        let guessedLineByte = 0x0A;
        let guessedEndByte = 0x00;
        if (mode === 'none' && romData?.data && Number.isFinite(relativeSearchSelected.offset)) {
          const printableBytes = new Set(entries.map(e => parseInt(e.key, 16) & 0xFF));
          const scanStart = Math.max(0, relativeSearchSelected.offset - 0x2000);
          const scanEnd = Math.min(romData.data.length - 2, relativeSearchSelected.offset + 0x8000);
          const scoreLineByte = (byteVal) => {
            let score = 0;
            for (let i = scanStart + 1; i <= scanEnd; i++) {
              if (romData.data[i] !== byteVal) continue;
              const prev = romData.data[i - 1];
              const next = romData.data[i + 1];
              if (printableBytes.has(next)) score += 3;
              if (printableBytes.has(prev)) score += 1;
              if (next === 0x00) score -= 1;
            }
            return score;
          };
          const scoreEndByte = (byteVal) => {
            let score = 0;
            for (let i = scanStart; i <= scanEnd; i++) {
              if (romData.data[i] !== byteVal) continue;
              const next = romData.data[i + 1];
              if (!printableBytes.has(next)) score += 2;
              if (next === 0x00) score += 1;
            }
            return score;
          };
          const lineCandidates = [0x06, 0x0A, 0x0D, 0xFE];
          const endCandidates = [0x00, 0x0A, 0xFF];
          let bestLineScore = -Infinity;
          for (const b of lineCandidates) {
            const s = scoreLineByte(b);
            if (s > bestLineScore) {
              bestLineScore = s;
              guessedLineByte = b;
            }
          }
          let bestEndScore = -Infinity;
          for (const b of endCandidates) {
            const s = scoreEndByte(b);
            if (s > bestEndScore) {
              bestEndScore = s;
              guessedEndByte = b;
            }
          }
        }
        if (guessedLineByte === guessedEndByte) {
          guessedLineByte = guessedLineByte === 0x0A ? 0x06 : guessedLineByte;
          if (guessedLineByte === guessedEndByte) {
            guessedEndByte = guessedEndByte === 0x00 ? 0xFF : 0x00;
          }
        }
        const lineKey = makeControlKey(guessedLineByte);
        const endKey = makeControlKey(guessedEndByte);
        if (!existingKeys.has(lineKey)) controlLines.push(`${lineKey}=[LINE]`);
        if (!existingKeys.has(endKey)) controlLines.push(`${endKey}=[END]`);
        const lines = entries.map(e => `${e.key}=${e.char}`);
        const nextContent = controlLines.concat(lines).join('\n');
        const normalized = ensureControlTokensInContent(nextContent, mode, { lineByte: guessedLineByte, endByte: guessedEndByte });
        setTableContent(normalized.content);
        parseAndSetTable(normalized.content, 'relative-search.tbl');
        setSuccess(`Generate table complete (offset ${offsetGuess}, mode ${mode.toUpperCase()}).`);
      }, [romData, relativeSearchSelected, relativeSearchMode, relativeSearchQuery, tableContent, parseAndSetTable, ensureControlTokensInContent, systemInfo]);

      const applySystemExtractionPreset = useCallback(() => {
        if (!systemInfo?.name) {
          setError("Load a ROM first to apply extraction preset.");
          return;
        }
        const presets = {
          "NES": { minLength: 3, maxLength: 512, asciiFallback: false, strictExtractorMode: true, strictSceneProfile: 'default' },
          "SNES": { minLength: 3, maxLength: 768, asciiFallback: false, strictExtractorMode: true, strictSceneProfile: 'default' },
          "Game Boy": { minLength: 3, maxLength: 512, asciiFallback: false, strictExtractorMode: true, strictSceneProfile: 'default' },
          "GBC": { minLength: 3, maxLength: 640, asciiFallback: false, strictExtractorMode: true, strictSceneProfile: 'default' },
          "GBA": { minLength: 4, maxLength: 1024, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'khcom_castlevania' },
          "NDS": { minLength: 4, maxLength: 1400, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' },
          "Nintendo 3DS": { minLength: 4, maxLength: 2048, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' },
          "Nintendo 64": { minLength: 4, maxLength: 1200, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' },
          "Sega Genesis/MD": { minLength: 3, maxLength: 900, asciiFallback: true, strictExtractorMode: true, strictSceneProfile: 'default' },
          "PlayStation Portable": { minLength: 4, maxLength: 1800, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' },
          "PlayStation 1": { minLength: 4, maxLength: 1400, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' },
          "default": { minLength: 4, maxLength: 1024, asciiFallback: true, strictExtractorMode: false, strictSceneProfile: 'default' }
        };
        const preset = presets[systemInfo.name] || presets.default;
        setOptions(prev => ({ ...prev, ...preset }));
        setSuccess(`Extraction preset applied for ${systemInfo.name}: min ${preset.minLength}, max ${preset.maxLength}, ASCII ${preset.asciiFallback ? 'ON' : 'OFF'}, strict ${preset.strictExtractorMode ? 'ON' : 'OFF'}.`);
      }, [systemInfo]);

      const saveExtractionProfileForSystem = useCallback(() => {
        if (!systemInfo?.name) {
          setError("Load a ROM first.");
          return;
        }
        const profile = {
          minLength: Math.max(0, Number(options.minLength) || 0),
          maxLength: Math.max(32, Number(options.maxLength) || 1024),
          asciiFallback: !!options.asciiFallback,
          usePaddingByte: !!options.usePaddingByte,
          strictExtractorMode: !!options.strictExtractorMode,
          strictSceneProfile: String(options.strictSceneProfile || 'default')
        };
        setExtractionProfiles(prev => ({ ...prev, [systemInfo.name]: profile }));
        setSuccess(`Saved extraction profile for ${systemInfo.name}.`);
      }, [systemInfo, options]);

      const applySavedExtractionProfile = useCallback((systemNameOverride = null) => {
        const targetSystem = systemNameOverride || systemInfo?.name;
        if (!targetSystem) return false;
        const saved = extractionProfiles[targetSystem];
        if (!saved || typeof saved !== 'object') return false;
        setOptions(prev => ({
          ...prev,
          minLength: Math.max(0, Number(saved.minLength) || prev.minLength),
          maxLength: Math.max(32, Number(saved.maxLength) || prev.maxLength),
          asciiFallback: saved.asciiFallback !== false,
          usePaddingByte: saved.usePaddingByte === true,
          strictExtractorMode: saved.strictExtractorMode === true,
          strictSceneProfile: String(saved.strictSceneProfile || prev.strictSceneProfile || 'default')
        }));
        return true;
      }, [systemInfo, extractionProfiles]);

      useEffect(() => {
        if (!extractionProfileLock) return;
        if (!systemInfo?.name) return;
        const applied = applySavedExtractionProfile(systemInfo.name);
        if (applied) {
          setSuccess(`Loaded locked extraction profile for ${systemInfo.name}.`);
        }
      }, [extractionProfileLock, systemInfo, applySavedExtractionProfile]);

      const handleExtractTexts = useCallback(() => {
        if (!romData || !tableData || tableData.entryCount === 0) { setError("Load a ROM and a valid Table file first."); return; }
        extractionBufferRef.current = [];
        setIsProcessing(true); setProcessingText('Extracting text strings...'); setProgress(10); setAllTexts([]); setFilteredTexts([]); setSelectedTextId(null);
        const extractionPipelineMap = {
          "NES": "pipeline_nes",
          "SNES": "pipeline_snes",
          "Game Boy": "pipeline_gb",
          "GBC": "pipeline_gbc",
          "GBA": "pipeline_gba",
          "NDS": "pipeline_nds",
          "Nintendo 3DS": "pipeline_3ds",
          "Nintendo 64": "pipeline_n64",
          "Sega Genesis/MD": "pipeline_genesis",
          "PlayStation Portable": "pipeline_psp",
          "PlayStation 1": "pipeline_ps1"
        };
        const extractionOptions = {
          ...options,
          system: systemInfo,
          systemPipeline: extractionPipelineMap[systemInfo?.name] || "pipeline_generic"
        };
        const strictTableSystems = new Set(["NES", "SNES", "Game Boy", "GBC"]);
        if (strictTableSystems.has(systemInfo?.name) && extractionOptions.asciiFallback) {
          extractionOptions.asciiFallback = false;
        }
        if (textExtractorWorker.current) {
          const romBuffer = romData.data.buffer.slice(0);
          textExtractorWorker.current.postMessage({ romBuffer, tableData: { singleByte: tableData.singleByte, multiByte: tableData.multiByte }, options: extractionOptions }, [romBuffer]);
        }
      }, [romData, tableData, options, systemInfo]);

      const updateTranslation = useCallback((textId, newTranslation) => {
        setAllTexts((currentTexts) => {
          const idx = currentTexts.findIndex(text => text.id === textId);
          if (idx < 0) return currentTexts;
          const prev = currentTexts[idx];
          if ((prev?.translatedText || '') === newTranslation) return currentTexts;
          const next = currentTexts.slice();
          next[idx] = { ...prev, translatedText: newTranslation };
          return next;
        });
        setHasUnsavedChanges(true);
      }, []);

      const handleAutoTranslate = useCallback(async (text) => {
        setTranslatingId(text.id); setProcessingText(`Translating ID ${text.id}...`); setProgress(0); setError('');
        try {
          const translated = await aiTranslateText(text.originalText, sourceLang, targetLang, setProgress);
          setSuccess(`Text ID ${text.id} translated.`); return translated;
        } catch (err) {
          setError(`AI translation failed for ID ${text.id}:\n${err.message}`); return null;
        } finally { setTranslatingId(null); setProcessingText(''); setProgress(0); }
      }, [sourceLang, targetLang]);

      const exportControlCodeDictionary = useCallback(() => {
        const payload = {
          aliases: controlCodeDict?.aliases && typeof controlCodeDict.aliases === 'object' ? controlCodeDict.aliases : {},
          ignoreTokens: Array.isArray(controlCodeDict?.ignoreTokens) ? controlCodeDict.ignoreTokens : []
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(romData?.name || 'project').split('.')[0]}_control_codes.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSuccess('Control code dictionary exported.');
      }, [controlCodeDict, romData]);

      const handleImportControlCodeDictionary = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const aliasesRaw = parsed?.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {};
          const aliases = {};
          Object.entries(aliasesRaw).forEach(([k, v]) => {
            const key = String(k || '').trim();
            const value = String(v || '').trim();
            if (!key || !value) return;
            aliases[key] = value;
          });
          const ignoreTokens = Array.isArray(parsed?.ignoreTokens) ? parsed.ignoreTokens.map(v => String(v || '').trim()).filter(Boolean) : [];
          setControlCodeDict({ aliases, ignoreTokens });
          setSuccess(`Control code dictionary loaded from ${file.name}.`);
        } catch (err) {
          setError(`Control dictionary import failed: ${err.message}`);
        } finally {
          if (event.target) event.target.value = '';
        }
      }, []);

      const handleImportCSV = useCallback((event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (allTexts.length === 0) {
          setError("Cannot import CSV. Please extract texts from the ROM first.");
          if (event.target) event.target.value = '';
          return;
        }
        setIsProcessing(true); setProcessingText('Importing CSV...'); setProgress(30);
        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              setProgress(70);
              const result = e.target?.result; if (typeof result !== 'string') throw new Error("Failed to read CSV file as text.");
              const translationsMap = parseCSV(result); if (translationsMap.size === 0) throw new Error("CSV file is empty or in an incorrect format.");
              let updatedCount = 0;
              setAllTexts(currentTexts => currentTexts.map(text => {
                if (translationsMap.has(text.id)) { updatedCount++; return { ...text, translatedText: translationsMap.get(text.id) }; }
                return text;
              }));
              setSuccess(`Successfully imported ${updatedCount} translations from ${file.name}.`); setProgress(100);
              setHasUnsavedChanges(true);
            } catch (err) {
              setError(`CSV Import Error:\n${err.message}`);
            } finally { setTimeout(() => { setIsProcessing(false); setProcessingText(''); setProgress(0); }, 500); }
          };
          reader.readAsText(file, 'UTF-8');
        } catch (err) {
          setError(`CSV Import Error:\n${err.message}`);
          setIsProcessing(false); setProcessingText(''); setProgress(0);
        } finally { if (event.target) event.target.value = ''; }
      }, [allTexts]);

      const handleExportCSV = useCallback(async () => {
        if (allTexts.length === 0) { setError("No text to export."); return; }
        setIsProcessing(true); setProcessingText('Exporting CSV...'); setProgress(30);
        try {
          const fileName = `${(romData?.name || 'project').split('.')[0]}_translation.csv`;
          await new Promise(res => setTimeout(res, 50));
          exportCSV(allTexts, fileName);
          setProgress(100); setSuccess(`Successfully exported to ${fileName}.`);
        } catch (e) {
          setError(`CSV Export Error: ${e.message}`);
        } finally { setTimeout(() => { setIsProcessing(false); setProcessingText(''); setProgress(0); }, 500); }
      }, [allTexts, romData]);

      const runPointerReplayTest = useCallback(() => {
        if (!originalRomData || allTexts.length === 0 || !tableData || !buildWorker.current) {
          setError("Cannot run pointer replay. Ensure ROM, text, and table are loaded.");
          return;
        }
        if (pointerReplayRunning) return;
        setPointerReplayRunning(true);
        setIsProcessing(true);
        setProcessingText('Running pointer replay test...');
        setProgress(10);
        const payload = {
          originalRom: originalRomData.data.buffer.slice(0),
          allTexts,
          tableData: { masterCharToHex: Object.fromEntries(masterCharToHex) },
          system: systemInfo,
          usePaddingByte: options.usePaddingByte,
          pointerGroups: Array.isArray(pointerGroups) ? pointerGroups : []
        };
        buildWorker.current.postMessage({ type: 'pointerReplay', payload }, [payload.originalRom]);
      }, [originalRomData, allTexts, tableData, buildWorker, masterCharToHex, systemInfo, options.usePaddingByte, pointerGroups, pointerReplayRunning]);

      const buildModifiedRom = useCallback(() => {
        if (!originalRomData || allTexts.length === 0 || !tableData || !buildWorker.current) { setError("Cannot build ROM. Ensure ROM, text, and table are loaded."); return; }
        const validation = runPreBuildValidation();
        setPointerValidationReport(validation.report || '');
        if (!validation.ok && validation.severity === 'block') {
          setError(`Pre-build validation blocked.\n${validation.report}`);
          return;
        }
        if (validation.severity === 'warn') {
          setSuccess(`Pre-build validation advisory:\n${validation.report}`);
        }
        setIsProcessing(true); setProcessingText('Building modified ROM...'); setProgress(10); setError('');
        if (validation.severity !== 'warn') setSuccess('');

        const payload = {
          originalRom: originalRomData.data.buffer.slice(0),
          allTexts,
          tableData: {
            masterCharToHex: Object.fromEntries(masterCharToHex),
          },
          system: systemInfo,
          usePaddingByte: options.usePaddingByte,
          pointerGroups: Array.isArray(pointerGroups) ? pointerGroups : []
        };

        buildWorker.current.postMessage({ type: 'buildRom', payload }, [payload.originalRom]);
      }, [
        originalRomData,
        allTexts,
        tableData,
        systemInfo,
        masterCharToHex,
        options.usePaddingByte,
        pointerGateEnabled,
        pointerGateMode,
        pointerGroups,
        pointerRuleTemplateKey,
        pointerRuleOverride,
        parseNumericInput,
        getTranslatedByteLength
      ]);

      const exportPatchedFile = useCallback(async (type) => {
        if (!modifiedRom || !originalRomData || !buildWorker.current) { setError("No modified ROM data to export. Build ROM first."); return; }

        if (type === 'ips') {
          setIsProcessing(true); setProcessingText('Generating IPS...'); setProgress(10);
          const payload = {
            originalData: originalRomData.data.buffer.slice(0),
            modifiedData: modifiedRom.buffer.slice(0)
          };
          buildWorker.current.postMessage({ type: 'generateIps', payload }, [payload.originalData, payload.modifiedData]);
        } else {
          setIsProcessing(true); setProcessingText('Exporting ROM...'); setProgress(50);
          const baseName = (romData?.name || 'translated').split('.').slice(0, -1).join('.') || romData.name;
          const fileName = `${baseName}_translated.${(romData?.name || 'rom').split('.').pop()}`;
          const blob = new Blob([modifiedRom], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob); const link = document.createElement('a');
          link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
          setSuccess(`Successfully exported to ${fileName}.`);
          setProgress(100);
          setTimeout(() => { setIsProcessing(false); setProcessingText(''); setProgress(0); }, 500);
        }
      }, [modifiedRom, originalRomData, romData]);

      const handlePatchLoad = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!originalRomData) {
          setError("CRITICAL ERROR:\nCannot apply patch because the original ROM is not loaded. Please load the base ROM file first.");
          if (event.target) event.target.value = '';
          return;
        }
        setIsProcessing(true); setProcessingText(`Applying patch: ${file.name}...`); setProgress(30);
        try {
          const patchData = new Uint8Array(await file.arrayBuffer()); setProgress(60);
          const patchType = file.name.split('.').pop()?.toLowerCase() || '';
          const patchedRom = applyPatch(originalRomData.data, patchData, patchType);
          const { system, method } = detectSystem(romData?.name || file.name, patchedRom);
          const newRomInfo = { name: `${romData.name} (patched)`, size: patchedRom.length, data: patchedRom, system };
          setRomData(newRomInfo);
          setModifiedRom(patchedRom);
          setSystemInfo(system);
          setAllTexts([]); setFilteredTexts([]);
          setProgress(100);
          setSuccess(`Patch ${file.name} applied successfully.\nSystem detected as ${system.name} via ${method}.\nPlease re-extract texts from the patched ROM.`);
          setActiveTab('extraction');
          setHasUnsavedChanges(true);
        } catch (err) {
          setError(`Failed to apply patch:\n${err.message}.`);
        } finally { setIsProcessing(false); setProcessingText(''); setProgress(0); if (event.target) event.target.value = ''; }
      }, [originalRomData, romData]);

      const restoreOriginalRom = useCallback(() => {
        if (!originalRomData) return;
        if (!window.confirm("This will revert all changes, including any applied patches and translations. Are you sure?")) return;
        const freshCopy = new Uint8Array(originalRomData.data);
        setRomData({ ...originalRomData, data: freshCopy });
        setSystemInfo(originalRomData.system);
        setAllTexts([]);
        setFilteredTexts([]);
        setModifiedRom(null);
        setHexRows([]);
        setHexMatches([]);
        setHexStatus("ROM has been restored. Re-run Hex View to inspect bytes.");
        setHexViewStart('0x000000'); setHexViewLength(4096); setHexViewColumns(16); setHexRowLimit(1024); setHexSearchHex('');
        setHexWindowStart(0); setHexWindowEnd(0); setHexTotalBytes(0);
        setHexSelectedOffset(null); setHexSelectedValue('');
        setHexMatchLength(1); setHexNibbleBuffer('');
        setHexUndoStack([]); setHexRedoStack([]); setHexAsciiMode('ascii'); setHexCustomTableData(null); setHexCustomTableName('');
        setPointerStatus('Select a byte to inspect pointers.'); setPointerMatches([]); setPointerTargetOffset(null);
        setPointerLabOffsetInput(''); setPointerLabTextId('');
        setPointerGroups([]); setSelectedPointerGroupId(''); setPointerGroupName(''); setPointerGroupNotes('');
        setPointerRuleTemplateKey('Auto'); setPointerRuleOverride({ minPointers: '', minConfidence: '', containerGap: '', coverageThreshold: '' });
        setPointerGateEnabled(true); setPointerGateMode('advisory'); setPointerValidationReport(''); setPointerReplayRunning(false);
        setSelectedTextId(null); setSceneSpeakerName(''); setContainerMapEnabled(false);
        setSegmentConfidenceThreshold(0);
        setRomPreviewData(null); setRomPreviewStatus('ROM tile preview idle.'); setRomPreviewMode('auto'); setRomPreviewOffsetInput(''); setRomPreviewAutoRefresh(true);
        setRuntimeRamData(null); setRuntimeRamName(''); setRuntimeRamHits([]); setRuntimeRamStatus('Load a RAM dump to inspect live dialogue buffers.');
        setRuntimeDomainSystem('auto');
        setRuntimeDomainDump(null); setRuntimeDomainName(''); setRuntimeVizData(null); setRuntimeVizStatus('Load a VRAM/PPU dump to render off-main-thread preview.');
        setControlCodeDict({ aliases: {}, ignoreTokens: [] });
        setHexPointerHighlights([]);
        extractionBufferRef.current = [];
        setSuccess("ROM has been restored to its original state.");
        setActiveTab('extraction');
        setHasUnsavedChanges(false);
      }, [originalRomData]);

      const displayedTexts = useMemo(() => {
        return debouncedSearchTerm.trim() ? filteredTexts : allTexts;
      }, [debouncedSearchTerm, filteredTexts, allTexts]);
      const totalPages = Math.ceil(displayedTexts.length / textsPerPage);
      const currentTexts = useMemo(() => displayedTexts.slice((currentPage - 1) * textsPerPage, currentPage * textsPerPage), [displayedTexts, currentPage]);
      useEffect(() => {
        const safePages = Math.max(1, Math.ceil(displayedTexts.length / textsPerPage));
        if (currentPage > safePages) setCurrentPage(safePages);
      }, [displayedTexts.length, currentPage, textsPerPage]);
      const stats = useMemo(() => {
        if (allTexts.length === 0) return { total: 0, translated: 0 };
        const playerFacingTexts = allTexts.filter(t => ['dialogue', 'menu', 'system'].includes(t.textType));
        const translatedCount = playerFacingTexts.filter(t => t.translatedText?.trim()).length;
        return { total: playerFacingTexts.length, translated: translatedCount };
      }, [allTexts]);

      const getSystemRuleKey = useCallback(() => {
        if (!systemInfo?.name) return 'Auto';
        return POINTER_RULE_TEMPLATES[systemInfo.name] ? systemInfo.name : 'Auto';
      }, [systemInfo, POINTER_RULE_TEMPLATES]);

      const activePointerRule = useMemo(() => {
        const baseKey = pointerRuleTemplateKey === 'Auto' ? getSystemRuleKey() : pointerRuleTemplateKey;
        const template = POINTER_RULE_TEMPLATES[baseKey] || POINTER_RULE_TEMPLATES.Auto;
        const toNum = (value, fallback) => {
          const parsed = parseFloat(String(value ?? '').trim());
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        return {
          key: baseKey,
          minPointers: Math.max(1, Math.floor(toNum(pointerRuleOverride.minPointers, template.minPointers))),
          minConfidence: Math.max(0, Math.min(1, toNum(pointerRuleOverride.minConfidence, template.minConfidence))),
          containerGap: Math.max(0x40, Math.floor(toNum(pointerRuleOverride.containerGap, template.containerGap))),
          coverageThreshold: Math.max(0, Math.min(100, toNum(pointerRuleOverride.coverageThreshold, template.coverageThreshold))),
          requireAbsolute: !!template.requireAbsolute,
          bankConstraint: template.bankConstraint || 'auto'
        };
      }, [pointerRuleTemplateKey, pointerRuleOverride, POINTER_RULE_TEMPLATES, getSystemRuleKey]);

      const scorePointerConfidence = useCallback((ptr) => {
        const type = String(ptr?.type || '').toLowerCase();
        if (type.includes('file_offset') || type.includes('base_plus')) return 0.95;
        if (type.includes('raw24')) return 0.75;
        if (type.includes('relative')) return 0.72;
        return 0.6;
      }, []);

      const getTextEntryOffset = useCallback((textEntry) => {
        if (!textEntry) return NaN;
        return parseNumericInput(textEntry.offset, NaN);
      }, [parseNumericInput]);

      const pointerMatchesValidated = useMemo(() => {
        return (pointerMatches || []).map((ptr, idx) => {
          const confidence = Number.isFinite(ptr.confidence) ? ptr.confidence : scorePointerConfidence(ptr);
          const ptrOffset = Number(ptr.ptrOffset);
          const offsetValid = Number.isFinite(ptrOffset) && ptrOffset >= 0 && (!romData || ptrOffset < romData.data.length);
          const valid = offsetValid && confidence >= activePointerRule.minConfidence;
          return {
            ...ptr,
            confidence,
            valid,
            validationReason: valid ? 'OK' : (!offsetValid ? 'Pointer offset out of range' : `Low confidence (${confidence.toFixed(2)})`),
            id: `${ptrOffset}-${idx}`
          };
        });
      }, [pointerMatches, scorePointerConfidence, romData, activePointerRule.minConfidence]);

      const textById = useMemo(() => {
        const map = new Map();
        for (const t of allTexts || []) {
          if (Number.isFinite(t?.id)) map.set(t.id, t);
        }
        return map;
      }, [allTexts]);

      const selectedText = useMemo(() => {
        if (!Number.isFinite(selectedTextId)) return null;
        return textById.get(selectedTextId) || null;
      }, [selectedTextId, textById]);

      useEffect(() => {
        if (!selectedText) {
          setSelectedLiveDraft('');
          return;
        }
        setSelectedLiveDraft(String(selectedText.translatedText || ''));
      }, [selectedTextId, selectedText?.translatedText]);

      useEffect(() => {
        if (liveAutoSyncTimerRef.current) clearTimeout(liveAutoSyncTimerRef.current);
      }, [selectedTextId, selectedLiveDraft, scenePreviewMode, liveEmulatorLinked]);

      const buildTokenUsageMap = useCallback((textValue) => {
        const usage = new Map();
        if (!textValue) return usage;
        const tokens = String(textValue).match(/\[[^\]]+\]|\/|\n/g) || [];
        tokens.forEach(token => {
          const normalized = normalizeControlToken(token);
          if (!normalized) return;
          if (controlIgnoreSet.has(normalized)) return;
          usage.set(normalized, (usage.get(normalized) || 0) + 1);
        });
        return usage;
      }, [normalizeControlToken, controlIgnoreSet]);

      const encodingCoverage = useCallback((textValue) => {
        if (!tokenizer || !masterCharToHex || masterCharToHex.size === 0) return { unknownCount: 0, unknownTokens: [] };
        const tokens = String(textValue || '').match(tokenizer) || [];
        const unknown = [];
        tokens.forEach(token => {
          const normalized = normalizeControlToken(token);
          if (!normalized) return;
          if (controlIgnoreSet.has(normalized)) return;
          const upper = normalized.toUpperCase();
          if (masterCharToHex.has(normalized)) return;
          if (masterCharToHex.has(upper)) return;
          if (/^\[[^\]]+\]$/.test(normalized)) unknown.push(normalized);
        });
        return { unknownCount: unknown.length, unknownTokens: Array.from(new Set(unknown)).slice(0, 10) };
      }, [tokenizer, masterCharToHex, normalizeControlToken, controlIgnoreSet]);

      const computeWordDiff = useCallback((a, b) => {
        const tokenize = (v) => String(v || '').split(/(\s+|\n)/).filter(Boolean);
        const A = tokenize(a).slice(0, 220);
        const B = tokenize(b).slice(0, 220);
        const n = A.length;
        const m = B.length;
        if (n === 0 && m === 0) return [];
        if (n === 0) return B.map(text => ({ type: 'add', text }));
        if (m === 0) return A.map(text => ({ type: 'rem', text }));
        const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
          for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = A[i] === B[j] ? (dp[i + 1][j + 1] + 1) : Math.max(dp[i + 1][j], dp[i][j + 1]);
          }
        }
        const out = [];
        let i = 0; let j = 0;
        while (i < n && j < m) {
          if (A[i] === B[j]) {
            out.push({ type: 'same', text: A[i] });
            i++; j++;
          } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ type: 'rem', text: A[i++] });
          } else {
            out.push({ type: 'add', text: B[j++] });
          }
          if (out.length > 700) break;
        }
        while (i < n && out.length <= 700) out.push({ type: 'rem', text: A[i++] });
        while (j < m && out.length <= 700) out.push({ type: 'add', text: B[j++] });
        return out;
      }, []);

      const translationQA = useMemo(() => {
        if (!selectedText || !tokenizer || !tableData) return null;
        const original = selectedText.originalText || '';
        const translated = selectedText.translatedText || '';
        const originalBytes = smartTextParse(original, tokenizer, masterCharToHex, options.usePaddingByte, { enableDteMte: options.enableDteMteCompression, strategy: options.compressionStrategy });
        const translatedBytes = smartTextParse(translated, tokenizer, masterCharToHex, options.usePaddingByte, { enableDteMte: options.enableDteMteCompression, strategy: options.compressionStrategy });
        const maxLen = Math.max(originalBytes.length, translatedBytes.length);
        const diffItems = [];
        for (let i = 0; i < maxLen && i < 512; i++) {
          const o = i < originalBytes.length ? originalBytes[i] : null;
          const t = i < translatedBytes.length ? translatedBytes[i] : null;
          if (o === t && o !== null) diffItems.push({ type: 'same', value: o });
          else {
            if (o !== null) diffItems.push({ type: 'rem', value: o });
            if (t !== null) diffItems.push({ type: 'add', value: t });
          }
        }
        const originalTokens = buildTokenUsageMap(original);
        const translatedTokens = buildTokenUsageMap(translated);
        const controlMismatches = [];
        const controlSet = new Set([...originalTokens.keys(), ...translatedTokens.keys()]);
        controlSet.forEach(token => {
          const a = originalTokens.get(token) || 0;
          const b = translatedTokens.get(token) || 0;
          if (a !== b) controlMismatches.push(`${token}: ${a} -> ${b}`);
        });
        const coverage = encodingCoverage(translated);
        const terminatorRisk = translated.includes('[END]') || translated.includes('[NULL]');
        const textDiffItems = computeWordDiff(original, translated);
        return {
          originalBytes,
          translatedBytes,
          diffItems,
          textDiffItems,
          overflow: translatedBytes.length > (selectedText.byteLength || 0),
          controlMismatches,
          unknownCount: coverage.unknownCount,
          unknownTokens: coverage.unknownTokens,
          terminatorRisk
        };
      }, [selectedText, tokenizer, tableData, masterCharToHex, options.usePaddingByte, options.enableDteMteCompression, options.compressionStrategy, buildTokenUsageMap, encodingCoverage, computeWordDiff]);

      const scriptContainers = useMemo(() => {
        if (!containerMapEnabled) return [];
        if (!allTexts || allTexts.length === 0) return [];
        const scanLimit = 80000;
        const sourceTexts = allTexts.length > scanLimit ? allTexts.slice(0, scanLimit) : allTexts;
        const entries = sourceTexts
          .map(t => ({ text: t, offsetNum: parseNumericInput(t.offset, NaN) }))
          .filter(v => Number.isFinite(v.offsetNum))
          .sort((a, b) => a.offsetNum - b.offsetNum);
        if (entries.length === 0) return [];
        const gap = activePointerRule.containerGap;
        const containers = [];
        let current = {
          id: 'ctr-1',
          start: entries[0].offsetNum,
          end: entries[0].offsetNum,
          texts: [entries[0].text]
        };
        for (let i = 1; i < entries.length; i++) {
          const prev = entries[i - 1];
          const curr = entries[i];
          if ((curr.offsetNum - prev.offsetNum) > gap) {
            containers.push(current);
            current = { id: `ctr-${containers.length + 2}`, start: curr.offsetNum, end: curr.offsetNum, texts: [curr.text] };
          } else {
            current.end = curr.offsetNum;
            current.texts.push(curr.text);
          }
        }
        containers.push(current);
        return containers.map(container => {
          const groups = pointerGroups.filter(group => Number.isFinite(group.targetOffset) && group.targetOffset >= container.start && group.targetOffset <= container.end);
          const validGroups = groups.filter(g => (g.validCount || 0) >= activePointerRule.minPointers);
          const pointerQuality = groups.length === 0 ? 0 : (validGroups.length / Math.max(1, groups.length));
          const printableRatio = container.texts.length === 0
            ? 0
            : (container.texts.reduce((acc, t) => {
              const s = String(t?.originalText || '');
              if (!s) return acc;
              const printable = (s.match(/[A-Za-z0-9\s.,!?'":;()\-\/]/g) || []).length;
              return acc + (printable / Math.max(1, s.length));
            }, 0) / container.texts.length);
          const overflowIds = container.texts.filter(textItem => {
            if (!textItem || !String(textItem.translatedText || '').trim()) return false;
            const translatedLen = getTranslatedByteLength(textItem.translatedText || '');
            return translatedLen > (textItem.byteLength || 0);
          });
          const coverage = overflowIds.length === 0 ? 100 : Math.round((Math.min(validGroups.length, overflowIds.length) / overflowIds.length) * 100);
          const overflowPenalty = Math.min(1, overflowIds.length / Math.max(1, container.texts.length));
          const confidenceScore = Math.round(Math.max(0, Math.min(100, ((pointerQuality * 0.55) + (printableRatio * 0.35) + ((1 - overflowPenalty) * 0.10)) * 100)));
          return {
            id: container.id,
            start: container.start,
            end: container.end,
            textCount: container.texts.length,
            groupCount: groups.length,
            validGroupCount: validGroups.length,
            overflowCount: overflowIds.length,
            coverage,
            confidenceScore,
            partial: sourceTexts.length < allTexts.length
          };
        });
      }, [containerMapEnabled, allTexts, pointerGroups, parseNumericInput, activePointerRule.containerGap, activePointerRule.minPointers, getTranslatedByteLength]);

      const filteredScriptContainers = useMemo(() => {
        const threshold = Math.max(0, Math.min(100, Number(segmentConfidenceThreshold) || 0));
        if (threshold <= 0) return scriptContainers;
        return scriptContainers.filter(c => Number(c.confidenceScore || 0) >= threshold);
      }, [scriptContainers, segmentConfidenceThreshold]);

      const pointerDiffSummary = useMemo(() => {
        if (!selectedText) return null;
        const selectedOffset = parseNumericInput(selectedText.offset, NaN);
        const group = pointerGroups.find(g =>
          (Number.isFinite(g.textId) && g.textId === selectedText.id) ||
          (Number.isFinite(selectedOffset) && Number.isFinite(g.targetOffset) && g.targetOffset === selectedOffset)
        ) || null;
        const snapshotSet = new Set((group?.pointers || []).map(p => Number(p?.ptrOffset)).filter(v => Number.isFinite(v)));
        const liveSet = new Set(
          (Number.isFinite(pointerTargetOffset) && Number.isFinite(selectedOffset) && pointerTargetOffset === selectedOffset
            ? (pointerMatchesValidated || []).map(p => Number(p?.ptrOffset))
            : []
          ).filter(v => Number.isFinite(v))
        );
        const added = [];
        const removed = [];
        liveSet.forEach(v => { if (!snapshotSet.has(v)) added.push(v); });
        snapshotSet.forEach(v => { if (!liveSet.has(v)) removed.push(v); });
        return {
          hasGroup: !!group,
          groupName: group?.name || '',
          snapshotCount: snapshotSet.size,
          liveCount: liveSet.size,
          added: added.slice(0, 40),
          removed: removed.slice(0, 40)
        };
      }, [selectedText, pointerGroups, parseNumericInput, pointerTargetOffset, pointerMatchesValidated]);

      const runPreBuildValidation = useCallback(() => {
        if (!pointerGateEnabled) return { ok: true, severity: 'off', report: 'Pointer validation gate is disabled.' };
        const overflowTexts = allTexts.filter(text => {
          if (text && text.buildable === false) return false;
          const translated = String(text.translatedText || '');
          if (!translated.trim()) return false;
          const translatedLen = getTranslatedByteLength(translated);
          return translatedLen > (text.byteLength || 0);
        });
        if (overflowTexts.length === 0) {
          return { ok: true, severity: 'ok', report: 'Validation: no overflow texts detected; pointer relocation gate passed.' };
        }
        const details = [];
        let validCount = 0;
        let groupedCount = 0;
        let unresolvedCount = 0;
        overflowTexts.forEach(text => {
          const offsetNum = parseNumericInput(text.offset, NaN);
          const group = pointerGroups.find(g =>
            (Number.isFinite(g.textId) && g.textId === text.id) ||
            (Number.isFinite(offsetNum) && Number.isFinite(g.targetOffset) && g.targetOffset === offsetNum)
          );
          if (!group) {
            unresolvedCount++;
            details.push(`ID ${text.id} @ ${text.offset} -> NO GROUP (fallback to heuristic pointer search at build).`);
            return;
          }
          groupedCount++;
          const valid = (group.validCount || 0) >= activePointerRule.minPointers && (group.coverage || 0) >= activePointerRule.coverageThreshold;
          if (valid) validCount++;
          details.push(`ID ${text.id} @ ${text.offset} -> ${valid ? 'OK' : 'LOW'} (group: ${group.name}, valid ${group.validCount}/${group.pointerCount}, coverage ${group.coverage}%)`);
        });
        const groupedCoverage = groupedCount === 0 ? 100 : Math.round((validCount / groupedCount) * 100);
        const overallCoverage = Math.round((validCount / Math.max(1, overflowTexts.length)) * 100);
        const strict = pointerGateMode === 'strict';
        const block = strict && groupedCount > 0 && groupedCoverage < activePointerRule.coverageThreshold;
        const severity = block ? 'block' : ((groupedCoverage < activePointerRule.coverageThreshold || unresolvedCount > 0) ? 'warn' : 'ok');
        const report = [
          `Pointer Validation Gate (${activePointerRule.key})`,
          `Mode: ${pointerGateMode.toUpperCase()}`,
          `Overflow texts: ${overflowTexts.length}`,
          `Grouped texts: ${groupedCount}`,
          `Ungrouped texts: ${unresolvedCount}`,
          `Validated texts: ${validCount}`,
          `Coverage (grouped): ${groupedCoverage}% (required >= ${activePointerRule.coverageThreshold}%)`,
          `Coverage (overall): ${overallCoverage}%`,
          `Origin/Target validation: pointer group validation + confidence threshold ${activePointerRule.minConfidence.toFixed(2)}`,
          ...details.slice(0, 20)
        ].join('\n');
        return { ok: !block, severity, report };
      }, [pointerGateEnabled, pointerGateMode, allTexts, getTranslatedByteLength, pointerGroups, parseNumericInput, activePointerRule]);

      const runPointerGateCheck = useCallback(() => {
        const validation = runPreBuildValidation();
        setPointerValidationReport(validation.report || '');
        setPointerValidationVisible(true);
        if (validation.ok) {
          setSuccess(validation.severity === 'warn'
            ? 'Pointer gate advisory check completed.'
            : 'Pointer gate check passed.');
        } else {
          setError(`Pointer gate check failed.\n${validation.report}`);
        }
      }, [runPreBuildValidation]);

      const buildPointerGroupFromCurrentScan = useCallback(() => {
        if (!Number.isFinite(pointerTargetOffset)) {
          setError('No pointer scan target available. Scan pointers first.');
          return;
        }
        const pointerList = pointerMatchesValidated || [];
        if (pointerList.length === 0) {
          setError('No pointer candidates to save. Run pointer scan first.');
          return;
        }
        const textIdNum = parseNumericInput(pointerLabTextId, NaN);
        const validCount = pointerList.filter(p => p.valid).length;
        const coverage = Math.round((validCount / Math.max(1, pointerList.length)) * 100);
        const newGroup = {
          id: `group-${Date.now()}`,
          name: pointerGroupName.trim() || `Group 0x${pointerTargetOffset.toString(16).toUpperCase()}`,
          notes: pointerGroupNotes.trim(),
          systemName: systemInfo?.name || 'Unknown',
          textId: Number.isFinite(textIdNum) ? textIdNum : null,
          targetOffset: pointerTargetOffset,
          createdAt: new Date().toISOString(),
          templateKey: activePointerRule.key,
          pointerCount: pointerList.length,
          validCount,
          coverage,
          pointers: pointerList.map(p => ({
            ptrOffset: p.ptrOffset,
            type: p.type,
            valueHex: p.valueHex,
            bytesHex: p.bytesHex,
            confidence: p.confidence,
            valid: p.valid,
            validationReason: p.validationReason
          }))
        };
        setPointerGroups(prev => {
          const merged = [...prev.filter(g => g.id !== newGroup.id), newGroup];
          return merged.slice(-500);
        });
        setSelectedPointerGroupId(newGroup.id);
        setPointerValidationReport(`Saved pointer group "${newGroup.name}" (${newGroup.validCount}/${newGroup.pointerCount} valid, coverage ${newGroup.coverage}%).`);
        setPointerValidationVisible(true);
        setSuccess(`Pointer group saved: ${newGroup.name}`);
      }, [pointerTargetOffset, pointerMatchesValidated, parseNumericInput, pointerLabTextId, pointerGroupName, pointerGroupNotes, systemInfo, activePointerRule]);

      const exportPointerGroups = useCallback((format = 'json') => {
        if (!pointerGroups.length) { setError('No pointer groups to export.'); return; }
        try {
          let blob;
          let fileName;
          if (format === 'csv') {
            const lines = ['group_id,group_name,system,text_id,target_offset,ptr_offset,type,confidence,valid,reason'];
            pointerGroups.forEach(group => {
              (group.pointers || []).forEach(ptr => {
                lines.push([
                  group.id,
                  `"${String(group.name || '').replace(/"/g, '""')}"`,
                  `"${String(group.systemName || '').replace(/"/g, '""')}"`,
                  group.textId ?? '',
                  `0x${Number(group.targetOffset || 0).toString(16).toUpperCase()}`,
                  `0x${Number(ptr.ptrOffset || 0).toString(16).toUpperCase()}`,
                  ptr.type || '',
                  Number.isFinite(ptr.confidence) ? ptr.confidence.toFixed(4) : '',
                  ptr.valid ? '1' : '0',
                  `"${String(ptr.validationReason || '').replace(/"/g, '""')}"`
                ].join(','));
              });
            });
            blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
            fileName = 'pointer_groups.csv';
          } else {
            blob = new Blob([JSON.stringify(pointerGroups, null, 2)], { type: 'application/json' });
            fileName = 'pointer_groups.json';
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          setSuccess(`Pointer groups exported as ${fileName}.`);
        } catch (err) {
          setError(`Pointer export failed: ${err.message}`);
        }
      }, [pointerGroups]);

      const handlePointerGroupImport = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const ext = (file.name.split('.').pop() || '').toLowerCase();
          let imported = [];
          if (ext === 'json') {
            const parsed = JSON.parse(text);
            imported = Array.isArray(parsed) ? parsed : [];
          } else if (ext === 'csv') {
            const rows = text.replace(/\r/g, '').split('\n').filter(Boolean);
            if (rows.length > 1) {
              const grouped = new Map();
              for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',');
                if (cols.length < 10) continue;
                const groupId = cols[0];
                const groupName = cols[1]?.replace(/^"|"$/g, '').replace(/""/g, '"');
                const systemName = cols[2]?.replace(/^"|"$/g, '').replace(/""/g, '"');
                const textId = parseNumericInput(cols[3], NaN);
                const targetOffset = parseNumericInput(cols[4], NaN);
                const ptrOffset = parseNumericInput(cols[5], NaN);
                const ptrType = cols[6];
                const confidence = parseFloat(cols[7]);
                const valid = cols[8] === '1';
                const reason = (cols[9] || '').replace(/^"|"$/g, '').replace(/""/g, '"');
                if (!grouped.has(groupId)) {
                  grouped.set(groupId, {
                    id: groupId || `group-${Date.now()}-${i}`,
                    name: groupName || `Imported ${i}`,
                    systemName: systemName || 'Unknown',
                    textId: Number.isFinite(textId) ? textId : null,
                    targetOffset: Number.isFinite(targetOffset) ? targetOffset : 0,
                    pointers: []
                  });
                }
                grouped.get(groupId).pointers.push({ ptrOffset, type: ptrType, confidence, valid, validationReason: reason });
              }
              imported = Array.from(grouped.values()).map(g => {
                const pointerCount = (g.pointers || []).length;
                const validCount = (g.pointers || []).filter(p => p.valid).length;
                return { ...g, pointerCount, validCount, coverage: Math.round((validCount / Math.max(1, pointerCount)) * 100), createdAt: new Date().toISOString(), templateKey: activePointerRule.key };
              });
            }
          } else {
            throw new Error('Unsupported pointer group format. Use .json or .csv');
          }
          if (!imported.length) throw new Error('No valid pointer groups found in file.');
          setPointerGroups(prev => [...prev, ...imported].slice(-500));
          setSuccess(`Imported ${imported.length} pointer group(s) from ${file.name}.`);
        } catch (err) {
          setError(`Pointer import failed: ${err.message}`);
        } finally {
          if (event.target) event.target.value = '';
        }
      }, [activePointerRule.key, parseNumericInput]);

      const selectPointerGroup = useCallback((group) => {
        if (!group) return;
        setSelectedPointerGroupId(group.id);
        setPointerLabTextId(Number.isFinite(group.textId) ? String(group.textId) : '');
        setPointerLabOffsetInput(Number.isFinite(group.targetOffset) ? `0x${group.targetOffset.toString(16).toUpperCase().padStart(6, '0')}` : '');
        setPointerTargetOffset(Number.isFinite(group.targetOffset) ? group.targetOffset : null);
        if (Number.isFinite(group.textId)) setSelectedTextId(group.textId);
        else if (Number.isFinite(group.targetOffset)) {
          const linkedText = allTexts.find(t => parseNumericInput(t.offset, NaN) === group.targetOffset);
          if (linkedText) setSelectedTextId(linkedText.id);
        }
        const list = Array.isArray(group.pointers) ? group.pointers : [];
        setPointerMatches(list);
        setHexPointerHighlights(list.map(p => p.ptrOffset).filter(v => Number.isFinite(v)));
        if (Number.isFinite(group.targetOffset)) {
          setHexSelectedOffset(group.targetOffset);
          if (romData?.data && group.targetOffset >= 0 && group.targetOffset < romData.data.length) {
            setHexSelectedValue((romData.data[group.targetOffset] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
          }
        }
      }, [romData, allTexts, parseNumericInput]);

      useEffect(() => {
        if (allTexts.length === 0) {
          if (pointerLabTextId !== '') setPointerLabTextId('');
          if (selectedTextId !== null) setSelectedTextId(null);
          return;
        }
        const parsed = parseNumericInput(pointerLabTextId, NaN);
        const exists = Number.isFinite(parsed) && allTexts.some(t => t.id === parsed);
        if (!exists) setPointerLabTextId(String(allTexts[0].id));
        const selectedExists = Number.isFinite(selectedTextId) && allTexts.some(t => t.id === selectedTextId);
        if (!selectedExists) setSelectedTextId(allTexts[0].id);
      }, [allTexts, pointerLabTextId, selectedTextId, parseNumericInput]);

      useEffect(() => {
        if (!Number.isFinite(selectedTextId)) return;
        const selectedTextEntry = allTexts.find(t => t.id === selectedTextId);
        if (!selectedTextEntry) return;
        const selectedOffset = parseNumericInput(selectedTextEntry.offset, NaN);
        const linkedGroup = pointerGroups.find(group =>
          (Number.isFinite(group.textId) && group.textId === selectedTextId) ||
          (Number.isFinite(selectedOffset) && Number.isFinite(group.targetOffset) && group.targetOffset === selectedOffset)
        );
        if (linkedGroup && Array.isArray(linkedGroup.pointers)) {
          setHexPointerHighlights(linkedGroup.pointers.map(p => p.ptrOffset).filter(v => Number.isFinite(v)));
        } else setHexPointerHighlights([]);
      }, [selectedTextId, allTexts, pointerGroups, parseNumericInput]);

      const handleWorkspaceScroll = useCallback((ev) => {
        const y = Number(ev?.target?.scrollTop) || 0;
        const compact = y > 48;
        setTopCompact(prev => (prev === compact ? prev : compact));
      }, []);

      const getTranslationWorkspaceGridStyle = useCallback(() => {
        if (!isMobileLayout) return {};
        return {
          gridTemplateColumns: '1fr',
          gridTemplateAreas: '"center" "right"',
          gap: '8px'
        };
      }, [isMobileLayout]);

      const getHexLayoutStyle = useCallback(() => {
        if (!isMobileLayout) return {};
        return {
          gridTemplateColumns: '1fr',
          gap: '8px'
        };
      }, [isMobileLayout]);

      const getTileToolsLayoutStyle = useCallback(() => {
        if (!isMobileLayout) return {};
        return {
          gridTemplateColumns: '1fr',
          gap: '8px'
        };
      }, [isMobileLayout]);

      const shouldRenderHexRows = activeTab === 'hex';
      const tileToolsLayoutClass = 'tiletools-layout';
      const modalReport = error
        ? { type: 'error', text: `ERROR: ${error}` }
        : (success ? { type: 'success', text: success } : null);

      return e('div', { className: `app-shell ${workspaceEngaged ? 'workspace-engaged' : ''}` },
        (isProcessing || progress > 0) && e('div', { className: 'progress-bar', style: { width: `${progress}%` } }),
        e('input', { type: 'file', ref: fileInputRef, onChange: handleFileUpload, style: { display: 'none' }, accept: ".nes,.snes,.gb,.gbc,.gba,.nds,.3ds,.cci,.cxi,.cia,.smc,.sfc,.fig,.gen,.md,.smd,.pce,.n64,.z64,.v64,.bin,.iso,.cso,.pbp,.elf,.img,.psx,.srl" }),
        e('input', { type: 'file', ref: tableInputRef, onChange: handleTableLoad, style: { display: 'none' }, accept: ".tbl" }),
        e('input', { type: 'file', ref: patchInputRef, onChange: handlePatchLoad, style: { display: 'none' }, accept: ".ips" }),
        e('input', { type: 'file', ref: csvImportRef, onChange: handleImportCSV, style: { display: 'none' }, accept: ".csv" }),
        e('input', { type: 'file', ref: projectImportRef, onChange: (ev) => handleProjectImport(ev), style: { display: 'none' }, accept: ".ptproj,.json" }),
        e('input', { type: 'file', ref: pointerImportRef, onChange: (ev) => handlePointerGroupImport(ev), style: { display: 'none' }, accept: ".json,.csv" }),
        e('input', { type: 'file', ref: controlDictInputRef, onChange: (ev) => handleImportControlCodeDictionary(ev), style: { display: 'none' }, accept: ".json" }),
        e('input', { type: 'file', ref: hexCustomTableInputRef, onChange: (ev) => handleHexCustomTableLoad(ev), style: { display: 'none' }, accept: ".tbl" }),
        e('input', { type: 'file', ref: fontBackgroundInputRef, onChange: (ev) => handleFontBackgroundUpload(ev), style: { display: 'none' }, accept: ".png,.jpg,.jpeg,.webp,.bmp" }),
        e('div', { className: `app-top-shell ${topCompact ? 'compact' : ''} ${workspaceEngaged ? 'workspace-engaged' : ''}` },
          e('div', { className: 'tabs' },
            e('div', { className: `tab ${activeTab === 'extraction' ? 'active' : ''}`, onClick: () => setActiveTab('extraction') }, 'Translation & Table'),
            e('div', { className: `tab ${activeTab === 'hex' ? 'active' : ''}`, onClick: () => setActiveTab('hex') }, 'Hex Editor & Pointer'),
            ENABLE_RUNTIME_TILE_TOOLS && e('div', { className: `tab ${activeTab === 'pointer' ? 'active' : ''}`, onClick: () => setActiveTab('pointer') }, 'Runtime & Tile Tools'),
            e('div', { className: `tab ${activeTab === 'patching' ? 'active' : ''}`, onClick: () => setActiveTab('patching') }, 'Patching & Export'),
            e('div', { className: `tab ${activeTab === 'tests' ? 'active' : ''}`, onClick: () => setActiveTab('tests') }, 'Unit Tests')
          ),
          isProcessing && e('div', { className: 'top-progress-notice' },
            `${processingText || 'Processing...'} | ${Math.max(0, Math.min(100, progress))}%${processingElapsedSec > 0 ? ` | Elapsed: ${processingElapsedSec}s` : ''}${progress > 0 && progress < 100 && processingElapsedSec > 1 ? ` | ETA: ${Math.max(0, Math.round((processingElapsedSec / Math.max(progress, 1)) * (100 - progress)))}s` : ''}`
          ),
          bootDiagnosticMode && e('div', { className: 'terminal-card', style: { marginBottom: '12px', borderColor: '#2c4d2c' } },
            e('h3', null, 'Boot Diagnostic Mode'),
            e('div', { className: 'hex-status' }, 'Use ?diag=1 for trace mode, or ?diag=fresh for safe boot (skip session restore).'),
            e('div', { className: 'hex-side-list', style: { maxHeight: '140px' } },
              ...(bootDiagnostics.length > 0
                ? bootDiagnostics.slice(-40).map((line, idx) => e('div', { key: `bootdiag-${idx}`, className: 'hex-side-item' }, line))
                : [e('div', { key: 'bootdiag-empty', className: 'hex-side-item' }, 'No diagnostics recorded yet.')])
            )
          )
        ),
        e('div', {
          className: 'app-workspace',
          ref: workspaceScrollRef,
          onScroll: handleWorkspaceScroll,
          onMouseEnter: () => {
            setWorkspaceEngaged(true);
            setTopCompact(true);
          },
          onMouseLeave: (ev) => {
            if (typeof document !== 'undefined' && !document.hasFocus()) return;
            if (!ev || !ev.relatedTarget) return;
            setWorkspaceEngaged(false);
            const y = Number(workspaceScrollRef.current?.scrollTop) || 0;
            if (y <= 4) setTopCompact(false);
          }
        },
          e('div', { className: `tab-content ${activeTab === 'extraction' ? 'active' : ''}` },
            e('div', { className: 'terminal-card workspace-card' },
              e('h3', null, 'Translation & Table Workspace'),
              e('div', { className: 'workspace-layout' },
                e('div', { className: `panel-shell${isPanelMinimized('translation-left') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('translation-left') }, isPanelMinimized('translation-left') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'workspace-controls-panel panel-content' },
                    e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Setup'),
                      e('div', { className: 'grid grid-2', style: { alignItems: 'center' } },
                        renderTaskButton({
                          label: romData ? 'Load New ROM' : 'Select ROM File',
                          token: 'Analyzing ROM',
                          onClick: () => fileInputRef.current?.click(),
                          className: 'btn'
                        }),
                        renderTaskButton({
                          label: 'Load Table File',
                          token: 'Loading table',
                          onClick: () => tableInputRef.current?.click(),
                          disabled: !romData,
                          className: 'btn'
                        })
                      ),
                      e('div', { className: 'grid grid-2', style: { alignItems: 'center', marginTop: '6px' } },
                        e('button', { className: 'btn', onClick: handleProjectExport, disabled: isProcessing || !romData }, 'Export Project'),
                        e('button', { className: 'btn', onClick: () => projectImportRef.current?.click(), disabled: isProcessing }, 'Import Project')
                      )
                    ),
                    romData && e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'ROM Information'),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'File Name:'), e('span', { style: { maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, romData.name)),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'System:'), e('span', null, systemInfo?.name || 'Unknown')),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'ROM Size:'), e('span', null, `${Math.round(romData.size / 1024)}KB (${romData.size.toLocaleString()} bytes)`)),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'Pointer Size:'), e('span', null, `${systemInfo?.pointerSize || 'N/A'} bytes`)),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'Pointer Endian:'), e('span', null, systemInfo?.pointerEndianness || 'N/A')),
                      e('div', { className: 'rom-info-row' }, e('span', null, 'Pointer Base:'), e('span', null, systemInfo?.pointerBase ? `0x${systemInfo.pointerBase.toString(16).toUpperCase()}` : 'N/A'))
                    ),
                    romData && e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Table Editor'),
                      e('textarea', { className: 'tbl-editor', value: tableContent, onChange: handleTableContentChange, placeholder: "Edit table generated from Generate Table..." }),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '10px' } },
                        e('button', { className: 'btn btn-small', onClick: handleTableDownload, disabled: !tableContent }, 'Download .tbl')
                      )
                    ),
                    romData && e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Generate Table'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Mode:'),
                        e('select', { className: 'select', value: relativeSearchMode, onChange: ev => setRelativeSearchMode(ev.target.value), style: { width: '180px' } },
                          e('option', { value: 'text' }, 'Relative Search'),
                          e('option', { value: 'hex' }, 'Value Scan Relative')
                        )
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Padding:'),
                        e('select', { className: 'select', value: relativeSearchPadding, onChange: ev => setRelativeSearchPadding(ev.target.value), style: { width: '180px' } },
                          e('option', { value: 'auto' }, 'Auto'),
                          e('option', { value: 'none' }, 'None'),
                          e('option', { value: 'le' }, 'LE (char,00)'),
                          e('option', { value: 'be' }, 'BE (00,char)')
                        )
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Search:'),
                        relativeSearchMode === 'text'
                          ? e('input', { className: 'input', style: { flex: 1 }, placeholder: 'Search text in-game to generate table', value: relativeSearchQuery, onChange: ev => setRelativeSearchQuery(ev.target.value) })
                          : e('input', { className: 'input', style: { flex: 1 }, placeholder: 'Hex bytes (example: 53 4F ?? 41)', value: relativeSearchHex, onChange: ev => setRelativeSearchHex(ev.target.value) })
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px' } },
                        renderTaskButton({
                          label: 'Search',
                          token: 'generate table search',
                          onClick: startRelativeSearch,
                          disabled: !romData,
                          className: 'btn btn-small'
                        }),
                        e('button', { className: 'btn btn-small', onClick: createTableFromRelativeResult, disabled: isProcessing || !relativeSearchSelected || relativeSearchMode !== 'text' }, 'Generate Table')
                      ),
                      relativeSearchStatus && e('div', { className: 'hex-status' }, relativeSearchStatus),
                      relativeSearchResults.length > 0
                        ? e('div', { className: 'hex-side-list', style: { maxHeight: '180px' } },
                          ...relativeSearchResults.map((res, idx) =>
                            e('div', {
                              key: `rel-${idx}`,
                              className: `hex-side-item${relativeSearchSelected === res ? ' active' : ''}`,
                              onClick: () => {
                                setRelativeSearchSelected(res);
                                setHexViewStart(`0x${Math.max(0, res.offset - 128).toString(16).toUpperCase().padStart(6, '0')}`);
                              }
                            }, `0x${res.offset.toString(16).toUpperCase().padStart(6, '0')} | ${res.mode.toUpperCase()} | off ${res.offsetGuess}${res.source ? ' | ' + res.source : ''}`)
                          )
                        )
                        : e('div', { style: { fontSize: '10px', color: '#555', textAlign: 'center', marginTop: '6px' } }, 'No results yet.')
                    ),
                    romData && e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Extraction'),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Min Length:'), e('input', { className: 'input', type: 'number', value: options.minLength, onChange: (ev) => setOptions(p => ({ ...p, minLength: parseInt(ev.target.value) || 0 })), style: { width: '100px' } })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Max Length:'), e('input', { className: 'input', type: 'number', value: options.maxLength, onChange: (ev) => setOptions(p => ({ ...p, maxLength: parseInt(ev.target.value) || 0 })), style: { width: '100px' } })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'ASCII Fallback:'), e('input', { type: 'checkbox', checked: options.asciiFallback, onChange: (ev) => setOptions(p => ({ ...p, asciiFallback: ev.target.checked })) })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Strict Mode:'), e('input', { type: 'checkbox', checked: !!options.strictExtractorMode, onChange: (ev) => setOptions(p => ({ ...p, strictExtractorMode: ev.target.checked })), title: 'More aggressive noise filtering for retro systems (NES/SNES/GB/GBC).' })),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Scene OCR Profile:'),
                        e('select', {
                          className: 'select',
                          value: options.strictSceneProfile || 'default',
                          onChange: (ev) => setOptions(p => ({ ...p, strictSceneProfile: ev.target.value || 'default' })),
                          style: { width: '230px' }
                        },
                          e('option', { value: 'default' }, 'Default'),
                          e('option', { value: 'khcom_castlevania' }, 'Castlevania/KHCOM Strict Bounds')
                        )
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '2px' } }, 'Strict Mode reduces noisy/control-like strings. Recommended for NES/SNES/GB/GBC.'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Text Decompression:'),
                        e('input', { type: 'checkbox', checked: options.enableTextDecompression !== false, onChange: (ev) => setOptions(p => ({ ...p, enableTextDecompression: ev.target.checked })) })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Decompress Mode:'),
                        e('select', {
                          className: 'select',
                          value: options.decompressionMode || 'auto',
                          onChange: ev => setOptions(p => ({ ...p, decompressionMode: ev.target.value })),
                          style: { width: '170px' },
                          disabled: options.enableTextDecompression === false
                        },
                          e('option', { value: 'auto' }, 'Auto (LZ10/LZ11/RLE/Yaz0/Huffman/MIO0/Yay0)'),
                          e('option', { value: 'lz10' }, 'LZ10 / GBA LZ77'),
                          e('option', { value: 'lz11' }, 'LZ11 / NDS Variant'),
                          e('option', { value: 'huffman' }, 'Huffman (GBA/Nintendo)'),
                          e('option', { value: 'huff4' }, 'Huffman-4 (GBA)'),
                          e('option', { value: 'huff8' }, 'Huffman-8 (GBA)'),
                          e('option', { value: 'rle' }, 'RLE (Nintendo RL)'),
                          e('option', { value: 'yaz0' }, 'Yaz0'),
                          e('option', { value: 'mio0' }, 'MIO0 (N64)'),
                          e('option', { value: 'yay0' }, 'Yay0 (N64)'),
                          e('option', { value: 'none' }, 'Disabled')
                        )
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Compressed Entries:'),
                        e('input', { type: 'checkbox', checked: options.includeCompressedReadOnly !== false, onChange: (ev) => setOptions(p => ({ ...p, includeCompressedReadOnly: ev.target.checked })), disabled: options.enableTextDecompression === false })
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '2px' } }, 'Cross-system decompression supports LZ10, LZ11, Huffman, Nintendo RLE, Yaz0, MIO0, and Yay0 source scanning.'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'DTE/MTE Optimizer:'),
                        e('input', { type: 'checkbox', checked: options.enableDteMteCompression !== false, onChange: (ev) => setOptions(p => ({ ...p, enableDteMteCompression: ev.target.checked })) })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Compression Strategy:'),
                        e('select', {
                          className: 'select',
                          value: options.compressionStrategy || 'optimal',
                          onChange: ev => setOptions(p => ({ ...p, compressionStrategy: ev.target.value })),
                          style: { width: '170px' },
                          disabled: options.enableDteMteCompression === false
                        },
                          e('option', { value: 'optimal' }, 'Optimal DP Encoding'),
                          e('option', { value: 'legacy' }, 'Legacy Tokenizer')
                        )
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '2px' } }, 'DTE/MTE uses loaded table tokens (single and multi-byte) and chooses minimal byte cost in optimal mode.'),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'DWE Padding:'), e('input', { type: 'checkbox', checked: options.usePaddingByte, onChange: (ev) => setOptions(p => ({ ...p, usePaddingByte: ev.target.checked })), title: "Treat 0x00 as a padding byte after a valid character. Common in tools like DWE." })),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Profile Lock:'),
                        e('input', { type: 'checkbox', checked: extractionProfileLock, onChange: ev => setExtractionProfileLock(ev.target.checked), title: 'Lock extraction profile per system for this project.' })
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px' } },
                        e('button', { className: 'btn btn-small', onClick: applySystemExtractionPreset, disabled: isProcessing || !romData }, 'Apply System Preset'),
                        e('button', { className: 'btn btn-small', onClick: saveExtractionProfileForSystem, disabled: isProcessing || !romData || !systemInfo?.name }, 'Save Profile'),
                        e('button', { className: 'btn btn-small', onClick: () => { if (applySavedExtractionProfile()) setSuccess(`Applied saved profile for ${systemInfo?.name || 'system'}.`); else setError('No saved extraction profile for this system.'); }, disabled: isProcessing || !romData }, 'Load Profile')
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '4px' } }, `Saved extraction profiles: ${Object.keys(extractionProfiles || {}).length}`),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' } },
                        e('button', { className: 'btn btn-small', onClick: () => controlDictInputRef.current?.click(), disabled: isProcessing }, 'Import Control Dict'),
                        e('button', { className: 'btn btn-small', onClick: exportControlCodeDictionary, disabled: isProcessing }, 'Export Control Dict'),
                        e('button', {
                          className: 'btn btn-small',
                          onClick: () => {
                            setControlCodeDict({ aliases: {}, ignoreTokens: [] });
                            setSuccess('Control code dictionary cleared.');
                          },
                          disabled: isProcessing
                        }, 'Clear Dict')
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '4px' } }, `Control aliases: ${Object.keys(controlCodeDict?.aliases || {}).length} | Ignore tokens: ${(controlCodeDict?.ignoreTokens || []).length}`),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '10px' } },
                        renderTaskButton({
                          label: 'Extract All Texts',
                          token: 'Extracting text strings',
                          onClick: handleExtractTexts,
                          disabled: !romData || !tableData,
                          className: 'btn'
                        })
                      )
                    ))
                ),
                e('div', { className: `workspace-main-panel${allTexts.length > 0 ? ' workspace-main-panel-active' : ' workspace-main-panel-empty'}` },
                  allTexts.length > 0
                    ? e(React.Fragment, null,
                      e('div', { className: 'hex-section-title' }, 'Translation Workspace'),
                      e('div', { className: 'translation-workspace-grid', style: getTranslationWorkspaceGridStyle() },
                        e('div', { className: `panel-shell translation-center-panel${isPanelMinimized('translation-center') ? ' minimized' : ''}` },
                          e('div', { className: 'panel-min-wrap' },
                            e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('translation-center') }, isPanelMinimized('translation-center') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                          ),
                          e('div', { className: 'panel-content' },
                            e('div', { className: 'translation-center-header' },
                              e('div', { className: 'search-container' },
                                e('input', {
                                  ref: searchInputRef,
                                  type: 'text',
                                  className: 'input',
                                  placeholder: 'Search original, translation, or offset...',
                                  value: searchTerm,
                                  onChange: ev => handleSearchTermInput(ev),
                                  onSelect: ev => recordSearchSelection(ev.target),
                                  onClick: ev => recordSearchSelection(ev.target),
                                  onKeyUp: ev => recordSearchSelection(ev.target)
                                })
                              ),
                              e('div', { className: 'translation-toolbar-row' },
                                e('div', { className: 'flex translation-toolbar-left' },
                                  renderTaskButton({
                                    label: 'Import CSV',
                                    token: 'Importing CSV',
                                    onClick: () => csvImportRef.current?.click(),
                                    className: 'btn btn-small'
                                  }),
                                  renderTaskButton({
                                    label: 'Export CSV',
                                    token: 'Exporting CSV',
                                    onClick: handleExportCSV,
                                    className: 'btn btn-small'
                                  })
                                ),
                                e('div', { className: 'flex translation-lang-controls translation-toolbar-center' },
                                  e('span', { style: { fontSize: 10, color: '#888' } }, 'From:'),
                                  e('select', { className: 'select', value: sourceLang, onChange: ev => setSourceLang(ev.target.value), style: { width: '130px' }, disabled: !!translatingId }, ...LANGUAGES.map(lang => e('option', { key: `src-${lang.code}`, value: lang.code }, lang.name))),
                                  e('span', { style: { fontSize: 10, color: '#888' } }, 'To:'),
                                  e('select', { className: 'select', value: targetLang, onChange: ev => setTargetLang(ev.target.value), style: { width: '130px' }, disabled: !!translatingId }, ...LANGUAGES.map(lang => e('option', { key: `tgt-${lang.code}`, value: lang.code }, lang.name)))
                                ),
                                e('div', { className: 'translation-toolbar-right' },
                                  e('div', { className: 'stats' },
                                    e('div', { className: 'stat-item' },
                                      e('span', { className: 'stat-inline-label' }, 'Total'),
                                      e('span', { className: 'stat-inline-value' }, stats.total)
                                    ),
                                    e('div', { className: 'stat-item' },
                                      e('span', { className: 'stat-inline-label' }, 'Done'),
                                      e('span', { className: 'stat-inline-value' }, stats.translated)
                                    ),
                                    e('div', { className: 'stat-item' },
                                      e('span', { className: 'stat-inline-label' }, 'Progress'),
                                      e('span', {
                                        className: 'stat-inline-value',
                                        style: { color: stats.total > 0 && stats.translated === stats.total ? '#00ff41' : '#ffff00' }
                                      }, `${stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0}%`)
                                    )
                                  )
                                )
                              )
                            ),
                            displayedTexts.length === 0 && debouncedSearchTerm
                              ? e('div', { className: 'not-found-message' }, `Text not found for "${debouncedSearchTerm}"`)
                              : e('div', { className: 'workspace-scroll' },
                                displayedTexts.length > 0
                                  ? currentTexts.map(text => e(TextItem, {
                                    key: text.id,
                                    text,
                                    onUpdate: updateTranslation,
                                    onQueueUpdate: queueTranslationUpdate,
                                    onLiveDraftChange: handleLiveDraftChange,
                                    onAutoTranslate: handleAutoTranslate,
                                    isTranslating: translatingId === text.id,
                                    getTranslatedByteLength: getTranslatedByteLength,
                                    liveEditMode,
                                    onLocateHex: locateTextInHex,
                                    onLocatePointers: locateTextPointers,
                                    onSelect: handleSelectTextEntry,
                                    isSelected: selectedTextId === text.id
                                  }))
                                  : e('div', { style: { color: '#666' } }, 'No extracted texts yet.')
                              ),
                            pointerValidationReport && pointerValidationVisible && e('div', { className: 'qa-panel translation-validation-report' },
                              e('div', { className: 'qa-panel-header' },
                                e('div', { className: 'hex-section-title', style: { marginBottom: 0 } }, 'Validation Report'),
                                e('button', {
                                  className: 'qa-close-btn',
                                  title: 'Close report',
                                  onClick: () => setPointerValidationVisible(false)
                                }, '×')
                              ),
                              e('div', { className: 'qa-report-body' },
                                e('pre', null, pointerValidationReport)
                              )
                            ),
                            e('div', { className: 'translation-bottom-actions' },
                              e('div', { className: 'translation-actions-left' },
                                e('button', {
                                  className: 'btn btn-small',
                                  onClick: runPointerGateCheck,
                                  disabled: !romData || !allTexts.length
                                }, 'Run Gate Check'),
                                renderTaskButton({
                                  label: 'Pointer Replay Test',
                                  token: 'pointer replay test',
                                  onClick: runPointerReplayTest,
                                  disabled: pointerReplayRunning || !allTexts.some(t => t.translatedText && t.buildable !== false),
                                  className: 'btn btn-small'
                                }),
                                renderTaskButton({
                                  label: 'Build Modified ROM',
                                  token: 'Building modified ROM',
                                  onClick: buildModifiedRom,
                                  disabled: !allTexts.some(t => t.translatedText && t.buildable !== false),
                                  className: 'btn btn-small'
                                })
                              ),
                              e('div', { className: 'pagination pagination-inline translation-pagination' },
                                e('button', { className: 'pagination-btn', onClick: () => setCurrentPage(1), disabled: totalPages <= 1 || currentPage === 1 }, '<<'),
                                e('button', { className: 'pagination-btn', onClick: () => setCurrentPage(p => p - 1), disabled: totalPages <= 1 || currentPage === 1 }, '<'),
                                e('span', { style: { padding: '0 6px', alignSelf: 'center', fontSize: '10px' } }, `${currentPage}/${Math.max(1, totalPages)}`),
                                e('button', { className: 'pagination-btn', onClick: () => setCurrentPage(p => p + 1), disabled: totalPages <= 1 || currentPage === totalPages }, '>'),
                                e('button', { className: 'pagination-btn', onClick: () => setCurrentPage(totalPages), disabled: totalPages <= 1 || currentPage === totalPages }, '>>')
                              )
                            )
                          )),
                        e('div', { className: `translation-side-column panel-shell${isPanelMinimized('translation-right') ? ' minimized' : ''}` },
                          e('div', { className: 'panel-min-wrap' },
                            e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('translation-right') }, isPanelMinimized('translation-right') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                          ),
                          e('div', { className: 'panel-content' },
                            e('div', { className: 'qa-panel translation-live-preview-panel' },
                              e('div', { className: 'hex-section-title' }, 'Scene Preview'),
                              e('div', { className: 'flex', style: { justifyContent: 'center', marginBottom: '6px', flexWrap: 'wrap' } },
                                e('button', {
                                  className: `btn btn-small${scenePreviewMode === 'font' ? ' active' : ''}`,
                                  onClick: () => setScenePreviewMode('font'),
                                  disabled: isProcessing
                                }, 'Internal Font Renderer'),
                                e('button', {
                                  className: `btn btn-small${scenePreviewMode === 'wasm' ? ' active' : ''}`,
                                  onClick: () => setScenePreviewMode('wasm'),
                                  disabled: isProcessing
                                }, 'WASM Runtime')
                              ),
                              scenePreviewMode === 'wasm'
                                ? e(React.Fragment, null,
                                  e('div', { className: 'flex', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '6px', flexWrap: 'wrap' } },
                                    e('button', {
                                      className: `btn btn-small${liveEmulatorLinked ? ' active' : ''}`,
                                      onClick: handleLinkLiveEmulator,
                                      disabled: isProcessing || !romData || !tableData || !allTexts.length
                                    }, liveEmulatorLinked ? 'Unlink Live Emulator' : 'Link Live Emulator'),
                                    e('button', {
                                      className: 'btn btn-small',
                                      onClick: () => setShowWasmRuntimeSlot(v => !v),
                                      disabled: isProcessing
                                    }, showWasmRuntimeSlot ? 'Hide Runtime Slot' : 'Show Runtime Slot')
                                  ),
                                  e('div', { className: 'flex', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '6px', flexWrap: 'wrap' } },
                                    e('button', {
                                      className: 'btn btn-small',
                                      onClick: handleApplySelectedAndSync,
                                      disabled: isProcessing || !liveEmulatorLinked || !selectedText || selectedText.buildable === false || !String(selectedLiveDraft || '').trim() || isLiveSyncing || runtimeSaveStateBytes <= 0
                                    }, isLiveSyncing ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' Syncing...') : 'Apply & Sync to Game'),
                                    e('div', { style: { fontSize: '10px', color: '#7fcf9a' } },
                                      selectedText
                                        ? `Selected ID ${selectedText.id} @ ${selectedText.offset}`
                                        : 'Select a text row to sync.'
                                    )
                                  ),
                                  e('div', {
                                    style: {
                                      fontSize: '10px',
                                      color: '#ffdd66',
                                      background: 'rgba(90,70,0,0.22)',
                                      border: '1px solid rgba(190,150,30,0.6)',
                                      borderRadius: '4px',
                                      padding: '6px',
                                      marginBottom: '6px'
                                    }
                                  }, 'Crucial: Take the Save State BEFORE triggering the dialogue in-game, otherwise the VRAM will still hold the old text.'),
                                  e('div', { className: 'bridge-live-meta', style: { marginBottom: '6px' } }, liveEmulatorStatus),
                                  e('div', {
                                    className: 'bridge-live-view',
                                    style: {
                                      aspectRatio: wasmPreviewAspectRatio,
                                      minHeight: isMobileLayout ? '220px' : '260px'
                                    }
                                  },
                                    wasmPreviewUrl
                                      ? e(React.Fragment, null,
                                        e('iframe', {
                                          key: `wasm-slot-${wasmIframeKey}`,
                                          ref: scenePreviewIframeRef,
                                          src: wasmPreviewUrl,
                                          title: 'WASM Emulator Runtime',
                                          style: { width: '100%', height: '100%', border: '0', background: '#050505', display: showWasmRuntimeSlot ? 'block' : 'none' },
                                          onLoad: () => {
                                            setWasmPreviewStatus('WASM runtime loaded. If core is unavailable, use Internal Font Renderer mode.');
                                            const browserRisk = (typeof wasmBrowserRisk === 'boolean') ? wasmBrowserRisk : false;
                                            setWasmPreviewWarning(prev => prev || (browserRisk ? 'Browser/device is under heavy profile. Renderer mode is recommended for stability.' : ''));
                                            if (runtimeRemountSyncRef.current || pendingRuntimeLoadRef.current) {
                                              setWasmPreviewStatus('WASM runtime slot remounted for live sync.');
                                              return;
                                            }
                                            setTimeout(() => {
                                              postRomToWasmRuntime(true);
                                              postSceneToWasmRuntime();
                                            }, 80);
                                          },
                                          onError: () => {
                                            setWasmPreviewStatus('WASM runtime failed to load. Check runtime slot and try again.');
                                          }
                                        }),
                                        !showWasmRuntimeSlot && e('div', { className: 'bridge-live-placeholder' }, 'WASM runtime slot is hidden. Click "Show Runtime Slot" to display emulator.')
                                      )
                                      : e('div', { className: 'bridge-live-placeholder' }, 'WASM runtime is initializing automatically...')
                                  ),
                                  e('div', { className: 'flex', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto' } },
                                    e('button', {
                                      className: 'btn btn-small',
                                      onClick: handleRuntimeSaveState,
                                      disabled: isProcessing || !liveEmulatorLinked || runtimeControlBusy.save
                                    }, runtimeControlBusy.save ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' Saving...') : 'Save State'),
                                    e('button', {
                                      className: 'btn btn-small',
                                      onClick: handleRuntimeLoadState,
                                      disabled: isProcessing || !liveEmulatorLinked || runtimeControlBusy.load || runtimeSaveStateBytes <= 0
                                    }, runtimeControlBusy.load ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' Loading...') : 'Load State'),
                                    e('button', {
                                      className: `btn btn-small${runtimePaused ? ' active' : ''}`,
                                      onClick: handleRuntimePauseToggle,
                                      disabled: isProcessing || !liveEmulatorLinked || runtimeControlBusy.pause
                                    }, runtimeControlBusy.pause ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' ...') : (runtimePaused ? 'Resume' : 'Pause')),
                                    e('button', {
                                      className: `btn btn-small${runtimeFastForward ? ' active' : ''}`,
                                      onClick: handleRuntimeFastForwardToggle,
                                      disabled: isProcessing || !liveEmulatorLinked || runtimeControlBusy.fast
                                    }, runtimeControlBusy.fast ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' ...') : (runtimeFastForward ? 'Fast Fwd On' : 'Fast Fwd Off')),
                                    e('button', {
                                      className: 'btn btn-small',
                                      onClick: handleRuntimeReset,
                                      disabled: isProcessing || !liveEmulatorLinked || runtimeControlBusy.reset
                                    }, runtimeControlBusy.reset ? e(React.Fragment, null, e('span', { className: 'btn-spinner' }), ' ...') : 'Reset Game')
                                  ),
                                  e('div', { style: { fontSize: '10px', color: '#7fcf9a', marginBottom: '6px' } },
                                    runtimeSaveStateBytes > 0
                                      ? `Saved state: ${runtimeSaveStateBytes} bytes`
                                      : 'Saved state: not captured'
                                  ),
                                  showWasmRuntimeReport && e('div', { className: 'qa-panel', style: { marginTop: '6px' } },
                                    e('div', { className: 'qa-panel-header' },
                                      e('div', { className: 'hex-section-title', style: { marginBottom: 0 } }, 'WASM Runtime Status'),
                                      e('button', {
                                        className: 'qa-close-btn',
                                        onClick: () => setShowWasmRuntimeReport(false),
                                        title: 'Hide runtime report'
                                      }, '×')
                                    ),
                                    wasmPreviewWarning && e('div', { className: 'qa-warn' }, wasmPreviewWarning),
                                    e('div', { className: 'bridge-live-meta', style: { marginBottom: 0 } }, wasmPreviewStatus)
                                  )
                                )
                                : e(React.Fragment, null,
                                  e('div', { style: { fontSize: '10px', color: '#9ad79a', marginBottom: '6px', lineHeight: 1.35 } }, 'Internal Font Renderer: preview text inside dialog box.'),
                                  e('div', {
                                    className: 'bridge-live-view bridge-live-view-font',
                                    style: {
                                      aspectRatio: fontPreviewAspectRatio
                                    }
                                  },
                                    e('canvas', {
                                      ref: scenePreviewCanvasRef,
                                      className: 'scene-preview-canvas',
                                      width: 256,
                                      height: 160,
                                      style: { width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }
                                    })
                                  ),
                                  e('div', { className: 'bridge-live-meta' }, fontPreviewStatus),
                                  fontPreviewWarning && e('div', { className: 'qa-warn' }, fontPreviewWarning)
                                ),
                              e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '6px' } },
                                selectedText
                                  ? `Selected text ID ${selectedText.id} | offset ${selectedText.offset}`
                                  : 'Select a text entry to preview translation scene.'
                              )
                            ),
                            e('div', { className: 'qa-panel' },
                              e('div', { className: 'hex-section-title' }, 'Visual Translation QA'),
                              selectedText
                                ? e(React.Fragment, null,
                                  e('div', { style: { fontSize: '10px', color: '#9ad79a' } }, `Selected Text ID: ${selectedText.id} @ ${selectedText.offset}`),
                                  translationQA && e(React.Fragment, null,
                                    translationQA.overflow && e('div', { className: 'qa-warn' }, `Overflow risk: ${translationQA.translatedBytes.length}/${selectedText.byteLength} bytes`),
                                    translationQA.controlMismatches.length > 0 && e('div', { className: 'qa-warn' }, `Control-code mismatch: ${translationQA.controlMismatches.slice(0, 3).join(' | ')}`),
                                    translationQA.unknownCount > 0 && e('div', { className: 'qa-warn' }, `Unknown token(s): ${translationQA.unknownTokens.join(', ')}`),
                                    translationQA.terminatorRisk && e('div', { className: 'qa-warn' }, 'Terminator risk: translated text contains [END]/[NULL].'),
                                    e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '6px' } }, 'Text Diff (Original vs Translation)'),
                                    e('div', { className: 'qa-text-diff' },
                                      ...(translationQA.textDiffItems || []).slice(0, 500).map((item, idx) =>
                                        e('span', {
                                          key: `text-diff-${idx}`,
                                          className: item.type === 'add' ? 'qa-token-add' : item.type === 'rem' ? 'qa-token-rem' : ''
                                        }, item.text)
                                      )
                                    ),
                                    pointerDiffSummary && e('div', { className: 'qa-warn' },
                                      pointerDiffSummary.hasGroup
                                        ? `Pointer diff (${pointerDiffSummary.groupName}): snapshot ${pointerDiffSummary.snapshotCount}, live ${pointerDiffSummary.liveCount}, +${pointerDiffSummary.added.length}, -${pointerDiffSummary.removed.length}`
                                        : 'Pointer diff: no saved pointer group for this text.'
                                    ),
                                    pointerDiffSummary && pointerDiffSummary.hasGroup && e('div', { className: 'qa-bytes', style: { maxHeight: '70px' } },
                                      `+ ${pointerDiffSummary.added.map(v => '0x' + Number(v).toString(16).toUpperCase()).join(', ') || '-'}\n- ${pointerDiffSummary.removed.map(v => '0x' + Number(v).toString(16).toUpperCase()).join(', ') || '-'}`
                                    ),
                                    e('div', { className: 'qa-bytes' },
                                      ...translationQA.diffItems.map((item, idx) =>
                                        e('span', {
                                          key: `diff-byte-${idx}`,
                                          className: item.type === 'add' ? 'qa-byte-add' : item.type === 'rem' ? 'qa-byte-rem' : ''
                                        }, `${Number(item.value || 0).toString(16).toUpperCase().padStart(2, '0')} `)
                                      )
                                    )
                                  )
                                )
                                : e('div', { style: { color: '#666', fontSize: '10px' } }, 'Select a text entry to inspect QA.')
                            ),
                            e('div', { className: 'qa-panel' },
                              e('div', { className: 'hex-section-title' }, 'Container Mapping Snapshot'),
                              e('div', { className: 'flex', style: { justifyContent: 'center', marginBottom: '6px' } },
                                e('button', { className: 'btn btn-small', onClick: () => setContainerMapEnabled(prev => !prev) }, containerMapEnabled ? 'Disable Snapshot' : 'Enable Snapshot')
                              ),
                              e('div', { className: 'option-row' },
                                e('span', { className: 'option-label' }, 'Min Confidence:'),
                                e('input', { className: 'input', type: 'number', min: 0, max: 100, value: segmentConfidenceThreshold, onChange: ev => setSegmentConfidenceThreshold(Math.max(0, Math.min(100, parseInt(ev.target.value, 10) || 0))), style: { width: '80px' } })
                              ),
                              e('div', { style: { fontSize: '10px', color: '#9ad79a', marginBottom: '6px' } }, `Containers: ${filteredScriptContainers.length}/${scriptContainers.length} | Rule: ${activePointerRule.key}`),
                              containerMapEnabled && filteredScriptContainers.length > 0
                                ? e('div', { className: 'hex-side-list', style: { maxHeight: '140px' } },
                                  ...filteredScriptContainers.slice(0, 80).map(container =>
                                    e('div', { key: container.id, className: 'hex-side-item' },
                                      `${container.id}: 0x${container.start.toString(16).toUpperCase()}-0x${container.end.toString(16).toUpperCase()} | conf ${container.confidenceScore}% | text ${container.textCount} | ptr ${container.validGroupCount}/${container.groupCount} | coverage ${container.coverage}%${container.partial ? ' | partial scan' : ''}`
                                    )
                                  )
                                )
                                : e('div', { style: { color: '#666', fontSize: '10px' } }, containerMapEnabled ? 'Container map will appear after extraction.' : 'Enable snapshot to compute container mapping.')
                            ),

                          ))
                      ),

                    )
                    : e('div', { className: 'workspace-empty-state' }, romData ? 'Run extraction first to open translation workspace.' : 'Load a ROM and table file to start or Import Project to continue work on previous project.')
                )
              )
            )
          ),
          ENABLE_RUNTIME_TILE_TOOLS && e('div', { className: `tab-content ${activeTab === 'pointer' ? 'active' : ''}` },
            e('div', { className: 'terminal-card workspace-card' },
              e('h3', null, 'Runtime & Tile Tools'),
              e('div', { className: tileToolsLayoutClass, style: getTileToolsLayoutStyle() },
                e('div', { className: `tiletools-column left panel-shell${isPanelMinimized('tile-left') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('tile-left') }, isPanelMinimized('tile-left') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'panel-content' },
                    e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Tile Source'),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Tile Offset:'), e('input', { className: 'input', value: tileEditorOffsetInput, onChange: ev => setTileEditorOffsetInput(ev.target.value), placeholder: '0x000000' })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Tile Count:'), e('input', { className: 'input', type: 'number', min: 1, max: 4096, value: tileEditorCount, onChange: ev => setTileEditorCount(parseInt(ev.target.value, 10) || 256), style: { width: '110px' } })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Tiles / Row:'), e('input', { className: 'input', type: 'number', min: 1, max: 64, value: tileEditorColumns, onChange: ev => setTileEditorColumns(parseInt(ev.target.value, 10) || 16), style: { width: '110px' } })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'BPP Mode:'), e('select', { className: 'select', value: tileEditorBppMode, onChange: ev => setTileEditorBppMode(ev.target.value), style: { width: '150px' } }, e('option', { value: 'auto' }, 'Auto'), e('option', { value: '2bpp' }, '2bpp'), e('option', { value: '4bpp' }, '4bpp'))),
                      e('div', { className: 'flex', style: { justifyContent: 'center', flexWrap: 'wrap' } },
                        renderTaskButton({ label: 'Render Tiles', token: 'Rendering tile editor', onClick: () => runTileEditorRender(), disabled: !romData, className: 'btn btn-small' }),
                        e('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9ad79a' } }, e('input', { type: 'checkbox', checked: tileEditorAutoRefresh, onChange: ev => setTileEditorAutoRefresh(ev.target.checked) }), 'Auto refresh')
                      ),
                      e('div', { className: 'hex-status' }, tileEditorStatus),
                      tileEditorData && e('div', { className: 'hex-status' }, `Tiles: ${tileEditorData.tileCount} | BPP: ${tileEditorData.bpp} | Bytes/Tile: ${tileEditorData.bytesPerTile}`)
                    ),
                    e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Tilemap Editor'),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Map Offset:'), e('input', { className: 'input', value: tileEditorMapOffsetInput, onChange: ev => setTileEditorMapOffsetInput(ev.target.value), placeholder: '0x000000 (optional)' })),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Map Size:'),
                        e('div', { className: 'flex', style: { gap: '4px' } },
                          e('input', { className: 'input', type: 'number', min: 1, max: 256, value: tileEditorMapWidth, onChange: ev => setTileEditorMapWidth(parseInt(ev.target.value, 10) || 32), style: { width: '78px' } }),
                          e('span', null, 'x'),
                          e('input', { className: 'input', type: 'number', min: 1, max: 256, value: tileEditorMapHeight, onChange: ev => setTileEditorMapHeight(parseInt(ev.target.value, 10) || 30), style: { width: '78px' } })
                        )
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Entry:'),
                        e('select', { className: 'select', value: String(tileEditorMapEntrySize), onChange: ev => setTileEditorMapEntrySize(parseInt(ev.target.value, 10) === 2 ? 2 : 1), style: { width: '100px' } }, e('option', { value: '1' }, '8-bit'), e('option', { value: '2' }, '16-bit')),
                        e('select', { className: 'select', value: tileEditorMapEndian, onChange: ev => setTileEditorMapEndian(ev.target.value === 'big' ? 'big' : 'little'), style: { width: '110px' }, disabled: Number(tileEditorMapEntrySize) !== 2 }, e('option', { value: 'little' }, 'Little'), e('option', { value: 'big' }, 'Big'))
                      ),
                      e('div', { style: { fontSize: '12px', color: '#9ad79a' } }, 'Click map cell to paint selected tile index.'),
                      tileEditorSelectedMapCell && e('div', { className: 'hex-status' }, `Selected map cell: (${tileEditorSelectedMapCell.x}, ${tileEditorSelectedMapCell.y})`)
                    )
                  )
                ),
                e('div', { className: `tiletools-column center panel-shell${isPanelMinimized('tile-center') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('tile-center') }, isPanelMinimized('tile-center') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'panel-content' },
                    e('div', { className: 'tiletools-center-grid' },
                      e('div', { className: 'workspace-subpanel' },
                        e('div', { className: 'hex-section-title' }, 'Tile Sheet'),
                        e('div', { className: 'hex-status' }, 'Click tile to select. Use paint panel to edit pixel data.'),
                        e('div', { style: { maxHeight: '62vh', overflow: 'auto', border: '1px solid #2d2d2d', borderRadius: '6px' } },
                          e('canvas', { ref: tileSheetCanvasRef, className: 'scene-preview-canvas', style: { width: '100%', imageRendering: 'pixelated', cursor: 'pointer' }, onClick: handleTileSheetClick })
                        )
                      ),
                      e('div', { className: 'workspace-subpanel' },
                        e('div', { className: 'hex-section-title' }, 'Tilemap View'),
                        e('div', { className: 'hex-status' }, tileMapData ? 'Click cell to place selected tile index into map entry.' : 'Provide map offset and render to enable tilemap editing.'),
                        e('div', { style: { maxHeight: '62vh', overflow: 'auto', border: '1px solid #2d2d2d', borderRadius: '6px' } },
                          e('canvas', { ref: tileMapCanvasRef, className: 'scene-preview-canvas', style: { width: '100%', imageRendering: 'pixelated', cursor: 'crosshair' }, onClick: handleTileMapClick })
                        )
                      )
                    )
                  )
                ),
                e('div', { className: `tiletools-column right panel-shell${isPanelMinimized('tile-right') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('tile-right') }, isPanelMinimized('tile-right') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'panel-content' },
                    e('div', { className: 'workspace-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Tile Paint'),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Selected Tile:'), e('input', { className: 'input', type: 'number', min: 0, max: Math.max(0, Number(tileEditorData?.tileCount || 0) - 1), value: tileEditorSelectedTile, onChange: ev => setTileEditorSelectedTile(Math.max(0, parseInt(ev.target.value, 10) || 0)), style: { width: '110px' } })),
                      e('div', { className: 'option-row' }, e('span', { className: 'option-label' }, 'Paint Color:'), e('input', { className: 'input', type: 'number', min: 0, max: Number(tileEditorData?.bpp) === 2 ? 3 : 15, value: tileEditorPaintColor, onChange: ev => setTileEditorPaintColor(Math.max(0, Math.min(Number(tileEditorData?.bpp) === 2 ? 3 : 15, parseInt(ev.target.value, 10) || 0))), style: { width: '110px' } })),
                      e('div', { className: 'hex-status' }, 'Click pixel in Selected Tile canvas for real-time ROM write.'),
                      e('canvas', { ref: tileSelectedCanvasRef, className: 'scene-preview-canvas', style: { width: '220px', height: '220px', imageRendering: 'pixelated', border: '1px solid #2d2d2d', cursor: 'crosshair' }, onClick: handleTileSelectedCanvasClick })
                    )
                  )
                )
              )
            )
          ),
          e('div', { className: `tab-content ${activeTab === 'hex' ? 'active' : ''}` },
            e('div', { className: 'terminal-card workspace-card' },
              e('h3', null, 'Hex Editor & Pointer'),
              e('div', { className: 'hex-layout', style: getHexLayoutStyle() },
                e('div', { className: `panel-shell${isPanelMinimized('hex-left') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('hex-left') }, isPanelMinimized('hex-left') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'hex-controls-panel panel-content' },
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'View Window'),
                      e('div', { className: 'hex-toolbar' },
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Start Offset'),
                          e('input', {
                            className: 'input',
                            value: hexViewStart,
                            onChange: ev => setHexViewStart(ev.target.value),
                            placeholder: '0x000000'
                          })
                        ),
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Window Length (bytes)'),
                          e('input', {
                            className: 'input',
                            type: 'number',
                            min: HEX_MIN_WINDOW_BYTES,
                            max: HEX_MAX_WINDOW_BYTES,
                            value: hexViewLength,
                            onChange: ev => setHexViewLength(parseInt(ev.target.value) || 4096)
                          })
                        ),
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Columns'),
                          e('input', {
                            className: 'input',
                            type: 'number',
                            min: HEX_MIN_COLUMNS,
                            max: HEX_MAX_COLUMNS,
                            value: hexViewColumns,
                            onChange: ev => setHexViewColumns(parseInt(ev.target.value) || 16)
                          })
                        ),
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Max Rows'),
                          e('input', {
                            className: 'input',
                            type: 'number',
                            min: HEX_MIN_ROWS,
                            max: HEX_MAX_ROWS,
                            value: hexRowLimit,
                            onChange: ev => setHexRowLimit(parseInt(ev.target.value) || 1024)
                          })
                        )
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', flexWrap: 'wrap' } },
                        e('button', { className: 'btn btn-small', onClick: () => runHexView(null, 0), disabled: isProcessing || !romData }, 'Start'),
                        e('button', { className: 'btn btn-small', onClick: () => moveHexWindow(-1), disabled: isProcessing || !romData }, 'Prev Window'),
                        renderTaskButton({
                          label: 'Render',
                          token: 'Rendering hex view',
                          onClick: () => runHexView(),
                          disabled: !romData,
                          className: 'btn btn-small'
                        }),
                        e('button', { className: 'btn btn-small', onClick: () => moveHexWindow(1), disabled: isProcessing || !romData }, 'Next Window'),
                        e('button', {
                          className: 'btn btn-small',
                          onClick: () => {
                            if (!romData) return;
                            const { viewLength } = getHexViewConfig();
                            runHexView(null, Math.max(0, romData.data.length - viewLength));
                          },
                          disabled: isProcessing || !romData
                        }, 'End')
                      )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Search'),
                      e('input', {
                        className: 'input',
                        value: hexSearchHex,
                        onChange: ev => setHexSearchHex(ev.target.value),
                        placeholder: 'Find Hex (supports ??), e.g. 08 00 ?? FF'
                      }),
                      e('div', { className: 'flex', style: { justifyContent: 'space-between', marginTop: '8px' } },
                        e('button', {
                          className: 'btn btn-small',
                          onClick: () => runHexView(),
                          disabled: isProcessing || !romData
                        }, 'Search In Window'),
                        e('button', {
                          className: 'btn btn-small',
                          onClick: () => {
                            setHexSearchHex('');
                            setHexMatches([]);
                            setHexStatus('Hex filter cleared.');
                          },
                          disabled: isProcessing
                        }, 'Clear')
                      ),
                      e('div', { className: 'hex-status' }, `Current matches: ${hexMatches.length}`)
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'ASCII/Text Decode'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Decode Mode:'),
                        e('select', { className: 'select', value: hexAsciiMode, onChange: ev => setHexAsciiMode(ev.target.value), style: { width: '170px' } },
                          e('option', { value: 'ascii' }, 'Raw ASCII'),
                          e('option', { value: 'project_table' }, 'Project Table (.tbl)'),
                          e('option', { value: 'custom_table' }, 'Custom Table (.tbl)')
                        )
                      ),
                      hexAsciiMode === 'custom_table' && e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '6px', flexWrap: 'wrap' } },
                        e('button', { className: 'btn btn-small', onClick: () => hexCustomTableInputRef.current?.click(), disabled: isProcessing }, 'Load Custom Table'),
                        e('button', {
                          className: 'btn btn-small',
                          onClick: () => {
                            setHexCustomTableData(null);
                            setHexCustomTableName('');
                          },
                          disabled: isProcessing || !hexCustomTableData
                        }, 'Clear')
                      ),
                      e('div', { className: 'hex-status' },
                        hexAsciiMode === 'ascii'
                          ? 'ASCII column uses raw byte-to-ASCII.'
                          : hexAsciiMode === 'project_table'
                            ? `ASCII column follows active project table: ${tableData?.name || 'N/A'}`
                            : `ASCII column follows custom table: ${hexCustomTableName || 'not loaded'}`
                      )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Byte Editor'),
                      e('div', { className: 'hex-toolbar', style: { marginBottom: '6px' } },
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Selected Offset'),
                          e('input', { className: 'input', value: Number.isFinite(hexSelectedOffset) ? `0x${hexSelectedOffset.toString(16).toUpperCase().padStart(6, '0')}` : '', readOnly: true, placeholder: 'Click a byte' })
                        ),
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Selected Byte (Hex)'),
                          e('input', {
                            className: 'input',
                            value: hexSelectedValue,
                            onChange: ev => {
                              const cleaned = ev.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 2);
                              setHexSelectedValue(cleaned);
                              if (cleaned.length === 2 && Number.isFinite(hexSelectedOffset)) {
                                applyHexByteAtOffset(hexSelectedOffset, cleaned, false);
                              }
                            },
                            placeholder: '00-FF'
                          })
                        ),
                        e('div', null,
                          e('div', { className: 'option-label', style: { marginBottom: '4px' } }, 'Selected Byte (ASCII)'),
                          e('input', {
                            className: 'input',
                            value: Number.isFinite(hexSelectedOffset) && romData?.data
                              ? decodeHexViewChar(romData.data[hexSelectedOffset]).ch
                              : '',
                            onChange: ev => {
                              if (!Number.isFinite(hexSelectedOffset)) return;
                              const inputValue = String(ev.target.value || '');
                              if (!inputValue) return;
                              const nextChar = inputValue[inputValue.length - 1];
                              applyHexByteAtOffset(hexSelectedOffset, formatHexByte(nextChar.charCodeAt(0) & 0xFF), false);
                            },
                            maxLength: 1,
                            placeholder: '.'
                          })
                        )
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', flexWrap: 'wrap' } },
                        e('button', { className: 'btn btn-small', onClick: undoHexEdit, disabled: isProcessing || hexUndoStack.length === 0 }, 'Undo (Ctrl+Z)'),
                        e('button', { className: 'btn btn-small', onClick: redoHexEdit, disabled: isProcessing || hexRedoStack.length === 0 }, 'Redo (Ctrl+Y)'),
                        e('button', { className: 'btn btn-small', onClick: addHexBookmark, disabled: !Number.isFinite(hexSelectedOffset) }, 'Add Bookmark'),
                        e('button', { className: 'btn btn-small', onClick: scanPointersForSelection, disabled: isProcessing || !Number.isFinite(hexSelectedOffset) }, 'Scan Pointers')
                      ),
                      e('div', { className: 'hex-status' }, `Realtime edit${hexNibbleBuffer ? ' | Key buffer: ' + hexNibbleBuffer : ''}`),
                      e('div', { className: 'hex-status' }, `History: Undo ${hexUndoStack.length} | Redo ${hexRedoStack.length}`)
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, `Bookmarks (${hexBookmarks.length})`),
                      hexBookmarks.length === 0
                        ? e('div', { style: { color: '#666', fontSize: '11px' } }, 'No bookmarks yet.')
                        : e('div', { className: 'hex-side-list' },
                          ...hexBookmarks.map((bookmark, idx) =>
                            e('div', {
                              key: `bookmark-${bookmark.offset}-${idx}`,
                              className: `hex-side-item${Number.isFinite(hexSelectedOffset) && bookmark.offset === hexSelectedOffset ? ' active' : ''}`,
                              onClick: () => jumpToHexOffset(bookmark.offset)
                            },
                              `Offset ${bookmark.label || `0x${bookmark.offset.toString(16).toUpperCase().padStart(6, '0')}`}`,
                              e('button', {
                                className: 'btn btn-small',
                                style: { float: 'right', margin: '-2px 0 -2px 8px' },
                                onClick: ev => {
                                  ev.stopPropagation();
                                  removeHexBookmark(bookmark.offset);
                                }
                              }, 'Remove')
                            )
                          )
                        )
                    ),

                  )),
                e('div', { className: `panel-shell${isPanelMinimized('hex-center') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('hex-center') }, isPanelMinimized('hex-center') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'hex-view-panel panel-content' },
                    e('div', { className: 'hex-status' }, hexStatus),
                    romData && e('div', { className: 'hex-status' }, `Window Range: 0x${hexWindowStart.toString(16).toUpperCase().padStart(6, '0')} - 0x${Math.max(0, hexWindowEnd - 1).toString(16).toUpperCase().padStart(6, '0')} of 0x${Math.max(0, (hexTotalBytes || 0) - 1).toString(16).toUpperCase().padStart(6, '0')}`),
                    e('div', { className: 'hex-viewer' },
                      shouldRenderHexRows
                        ? (hexRows.length > 0
                          ? hexRows.map((row, idx) =>
                            e('div', { className: 'hex-row', key: `hex-row-${row.offset}-${idx}` },
                              e('span', { className: 'hex-offset' }, `0x${row.offset.toString(16).toUpperCase().padStart(6, '0')}`),
                              e('span', {
                                className: 'hex-bytes',
                                style: { gridTemplateColumns: `repeat(${Math.max(1, row.length || (row.bytes ? row.bytes.length : 1))}, 28px)` }
                              },
                                ...(Array.isArray(row.bytes) ? row.bytes : []).map((byteVal, byteIdx) => {
                                  const byteOffset = row.offset + byteIdx;
                                  const isSelected = Number.isFinite(hexSelectedOffset) && byteOffset === hexSelectedOffset;
                                  const isMatched = hexMatchCoverage.has(byteOffset);
                                  const isPointerLinked = hexPointerHighlightSet.has(byteOffset);
                                  const className = `hex-byte${isSelected ? ' selected' : ''}${isMatched ? ' matched' : ''}${isPointerLinked ? ' ptr-highlight' : ''}`;
                                  return e('span', {
                                    key: `hex-byte-${byteOffset}`,
                                    className,
                                    onClick: () => selectHexByte(byteOffset, byteVal),
                                    title: `Offset 0x${byteOffset.toString(16).toUpperCase().padStart(6, '0')}`
                                  }, byteVal.toString(16).toUpperCase().padStart(2, '0'));
                                })
                              ),
                              e('span', {
                                className: 'hex-ascii',
                                style: { gridTemplateColumns: `repeat(${Math.max(1, row.length || (row.bytes ? row.bytes.length : 1))}, 18px)` }
                              },
                                ...(Array.isArray(row.bytes) ? row.bytes : []).map((byteVal, byteIdx) => {
                                  const byteOffset = row.offset + byteIdx;
                                  const isSelected = Number.isFinite(hexSelectedOffset) && byteOffset === hexSelectedOffset;
                                  const isMatched = hexMatchCoverage.has(byteOffset);
                                  const isPointerLinked = hexPointerHighlightSet.has(byteOffset);
                                  const className = `hex-char${isSelected ? ' selected' : ''}${isMatched ? ' matched' : ''}${isPointerLinked ? ' ptr-highlight' : ''}`;
                                  const decoded = decodeHexViewChar(byteVal);
                                  return e('span', {
                                    key: `hex-char-${byteOffset}`,
                                    className,
                                    onClick: () => selectHexByte(byteOffset, byteVal),
                                    title: `Offset 0x${byteOffset.toString(16).toUpperCase().padStart(6, '0')} | ${decoded.label}`
                                  }, decoded.ch);
                                })
                              )
                            )
                          )
                          : e('div', { style: { color: '#666' } }, romData ? 'No hex rows yet. Click "Render".' : 'Load a ROM first to inspect bytes.'))
                        : e('div', { style: { color: '#666' } }, 'Hex view suspended while tab is inactive.')
                    ),
                    hexMatches.length > 0 && e('div', { className: 'hex-matches' },
                      ...hexMatches.slice(0, 300).map((matchOffset, idx) =>
                        e('div', {
                          key: `hex-match-${matchOffset}-${idx}`,
                          className: 'hex-match-item',
                          onClick: () => jumpToHexOffset(matchOffset)
                        }, `Match at 0x${matchOffset.toString(16).toUpperCase().padStart(6, '0')} (click to jump)`)
                      )
                    ))
                ),
                e('div', { className: `panel-shell${isPanelMinimized('hex-right') ? ' minimized' : ''}` },
                  e('div', { className: 'panel-min-wrap' },
                    e('button', { className: 'panel-min-btn', onClick: () => togglePanelMinimized('hex-right') }, isPanelMinimized('hex-right') ? String.fromCharCode(9650) : String.fromCharCode(9660))
                  ),
                  e('div', { className: 'hex-pointer-panel panel-content' },
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, `Pointer Scan (${pointerMatchesValidated.length})`),
                      e('div', { className: 'hex-status' }, pointerStatus),
                      pointerMatchesValidated.length === 0
                        ? e('div', { style: { color: '#666', fontSize: '11px' } }, 'No pointer results yet.')
                        : e('div', { className: 'hex-side-list' },
                          ...pointerMatchesValidated.slice(0, 300).map((ptr, idx) =>
                            e('div', {
                              key: `ptr-right-${ptr.ptrOffset}-${idx}`,
                              className: 'hex-side-item',
                              onClick: () => {
                                jumpToHexOffset(ptr.ptrOffset, true);
                                openTextEntryByTargetOffset(pointerTargetOffset);
                              }
                            },
                              `0x${ptr.ptrOffset.toString(16).toUpperCase().padStart(6, '0')} -> ${ptr.valueHex || ''} | conf ${Number(ptr.confidence || 0).toFixed(2)}`,
                              e('span', { className: 'hex-badge' }, ptr.type || 'pointer'),
                              e('span', { className: 'hex-badge', style: { color: ptr.valid ? '#9ad79a' : '#ff8a8a', borderColor: ptr.valid ? '#2b2b2b' : '#5a2a2a' } }, ptr.valid ? 'valid' : 'invalid')
                            )
                          )
                        )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Pointer Target'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Text ID:'),
                        e('input', { className: 'input', value: pointerLabTextId, onChange: ev => setPointerLabTextId(ev.target.value), placeholder: 'e.g. 18300' })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Offset:'),
                        e('input', { className: 'input', value: pointerLabOffsetInput, onChange: ev => setPointerLabOffsetInput(ev.target.value), placeholder: '0x00EA860' })
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px' } },
                        renderTaskButton({
                          label: 'Scan Pointers',
                          token: 'Scanning pointers',
                          onClick: scanPointersFromPointerLab,
                          disabled: !romData,
                          className: 'btn btn-small'
                        }),
                        renderTaskButton({
                          label: 'Scan Selected Byte',
                          token: 'Scanning pointers',
                          onClick: scanPointersForSelection,
                          disabled: !Number.isFinite(hexSelectedOffset),
                          className: 'btn btn-small'
                        })
                      )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Pointer Rule Templates'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Template:'),
                        e('select', { className: 'select', value: pointerRuleTemplateKey, onChange: ev => setPointerRuleTemplateKey(ev.target.value), style: { width: '170px' } },
                          e('option', { value: 'Auto' }, `Auto (${getSystemRuleKey()})`),
                          ...Object.keys(POINTER_RULE_TEMPLATES).filter(k => k !== 'Auto').map(k => e('option', { key: `ptr-rule-${k}`, value: k }, k))
                        )
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Min Pointers:'),
                        e('input', { className: 'input', value: pointerRuleOverride.minPointers, onChange: ev => setPointerRuleOverride(prev => ({ ...prev, minPointers: ev.target.value })), placeholder: String(activePointerRule.minPointers) })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Min Confidence:'),
                        e('input', { className: 'input', value: pointerRuleOverride.minConfidence, onChange: ev => setPointerRuleOverride(prev => ({ ...prev, minConfidence: ev.target.value })), placeholder: String(activePointerRule.minConfidence) })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Container Gap:'),
                        e('input', { className: 'input', value: pointerRuleOverride.containerGap, onChange: ev => setPointerRuleOverride(prev => ({ ...prev, containerGap: ev.target.value })), placeholder: `0x${activePointerRule.containerGap.toString(16).toUpperCase()}` })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Gate %:'),
                        e('input', { className: 'input', value: pointerRuleOverride.coverageThreshold, onChange: ev => setPointerRuleOverride(prev => ({ ...prev, coverageThreshold: ev.target.value })), placeholder: String(activePointerRule.coverageThreshold) })
                      )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Pointer Group Manager'),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Group Name:'),
                        e('input', { className: 'input', value: pointerGroupName, onChange: ev => setPointerGroupName(ev.target.value), placeholder: 'Pointer group name' })
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Notes:'),
                        e('input', { className: 'input', value: pointerGroupNotes, onChange: ev => setPointerGroupNotes(ev.target.value), placeholder: 'Optional notes' })
                      ),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' } },
                        e('button', { className: 'btn btn-small', onClick: buildPointerGroupFromCurrentScan, disabled: !pointerMatchesValidated.length }, 'Save Group'),
                        e('button', { className: 'btn btn-small', onClick: () => exportPointerGroups('json'), disabled: !pointerGroups.length }, 'Export JSON'),
                        e('button', { className: 'btn btn-small', onClick: () => exportPointerGroups('csv'), disabled: !pointerGroups.length }, 'Export CSV'),
                        e('button', { className: 'btn btn-small', onClick: () => pointerImportRef.current?.click(), disabled: isProcessing }, 'Import Group'),
                        e('button', {
                          className: 'btn btn-small btn-danger',
                          onClick: () => {
                            if (!selectedPointerGroupId) return;
                            setPointerGroups(prev => prev.filter(g => g.id !== selectedPointerGroupId));
                            setSelectedPointerGroupId('');
                          },
                          disabled: !selectedPointerGroupId
                        }, 'Delete Selected')
                      ),
                      e('div', { style: { fontSize: '10px', color: '#9ad79a', marginTop: '6px' } }, `Saved groups: ${pointerGroups.length}`)
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, 'Pre-Build Validation Gate'),
                      e('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9ad79a' } },
                        e('input', { type: 'checkbox', checked: pointerGateEnabled, onChange: ev => setPointerGateEnabled(ev.target.checked) }),
                        'Enable gate before build'
                      ),
                      e('div', { className: 'option-row' },
                        e('span', { className: 'option-label' }, 'Mode:'),
                        e('select', { className: 'select', value: pointerGateMode, onChange: ev => setPointerGateMode(ev.target.value), style: { width: '130px' } },
                          e('option', { value: 'advisory' }, 'Advisory'),
                          e('option', { value: 'strict' }, 'Strict Block')
                        )
                      ),
                      e('div', { className: 'qa-warn' }, `Rule: ${activePointerRule.key} | Required coverage >= ${activePointerRule.coverageThreshold}%`),
                      e('div', { className: 'flex', style: { justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' } },
                        e('button', {
                          className: 'btn btn-small',
                          onClick: runPointerGateCheck,
                          disabled: !romData || !allTexts.length
                        }, 'Run Gate Check'),
                        renderTaskButton({
                          label: 'Pointer Replay',
                          token: 'pointer replay test',
                          onClick: runPointerReplayTest,
                          disabled: !romData || !allTexts.length || pointerReplayRunning,
                          className: 'btn btn-small'
                        })
                      )
                    ),
                    pointerValidationReport && pointerValidationVisible && e('div', { className: 'hex-subpanel translation-validation-report' },
                      e('div', { className: 'qa-panel-header' },
                        e('div', { className: 'hex-section-title', style: { marginBottom: 0 } }, 'Validation Report'),
                        e('button', {
                          className: 'qa-close-btn',
                          title: 'Close report',
                          onClick: () => setPointerValidationVisible(false)
                        }, '×')
                      ),
                      e('div', { className: 'qa-report-body' },
                        e('pre', null, pointerValidationReport)
                      )
                    ),
                    e('div', { className: 'hex-subpanel' },
                      e('div', { className: 'hex-section-title' }, `Saved Pointer Groups (${pointerGroups.length})`),
                      pointerGroups.length === 0
                        ? e('div', { style: { color: '#666', fontSize: '10px' } }, 'No saved pointer groups yet.')
                        : e('div', { className: 'hex-side-list' },
                          ...pointerGroups.map(group =>
                            e('div', {
                              key: `ptr-group-${group.id}`,
                              className: `hex-side-item${selectedPointerGroupId === group.id ? ' active' : ''}`,
                              onClick: () => selectPointerGroup(group)
                            },
                              `${group.name} | text ${group.textId ?? '-'} | target 0x${Number(group.targetOffset || 0).toString(16).toUpperCase()} | valid ${group.validCount || 0}/${group.pointerCount || 0}`
                            )
                          )
                        )
                    ))
                )
              )
            )
          ),
          e('div', { className: `tab-content ${activeTab === 'patching' ? 'active' : ''}` },
            e('div', { className: 'terminal-card' }, e('h3', null, 'Patch Management'), e('div', { className: 'grid grid-responsive' }, e('div', { className: 'patch-card' }, e('div', { className: 'patch-title' }, 'Apply Patch to ROM'), e('div', { className: 'patch-desc' }, 'Apply an existing patch (e.g., IPS) to the original ROM. This will overwrite any unsaved changes and reload the project.'), renderTaskButton({ label: 'Upload & Apply Patch', token: 'Applying patch', onClick: () => patchInputRef.current?.click(), disabled: !originalRomData, className: 'btn' })), e('div', { className: 'patch-card' }, e('div', { className: 'patch-title' }, 'Restore Original ROM'), e('div', { className: 'patch-desc' }, 'Revert all modifications, including applied patches, and restore the ROM to its initial state.'), e('button', { onClick: restoreOriginalRom, className: 'btn btn-danger', disabled: !originalRomData || isProcessing }, 'Restore Original')))),
            e('div', { className: 'terminal-card mt-6' }, e('h3', null, 'Generate Patches'), e('p', { style: { fontSize: 10, color: '#888', marginBottom: 15, textAlign: 'center' } }, 'Create a small file containing only the differences between the original and modified ROM. This is ideal for distribution.'),
              e('div', { className: 'grid grid-responsive' },
                e('div', { className: 'patch-card' },
                  e('div', { className: 'patch-title' }, 'Generate IPS'),
                  e('div', { className: 'patch-desc' }, 'International Patching System. A classic, widely compatible format suitable for most emulators and patching tools.'),
                  renderTaskButton({ label: 'Generate IPS', token: 'Generating IPS', onClick: () => exportPatchedFile('ips'), disabled: !modifiedRom, className: 'btn' })
                ),
                e('div', { className: 'patch-card' },
                  e('div', { className: 'patch-title' }, 'Generate BPS'),
                  e('div', { className: 'patch-desc' }, 'Beat Patching System. A modern alternative to IPS with better handling of large files and metadata. (Coming Soon)'),
                  e('button', { disabled: true, className: 'btn' }, 'Generate BPS')
                ),
                e('div', { className: 'patch-card' },
                  e('div', { className: 'patch-title' }, 'Generate Xdelta'),
                  e('div', { className: 'patch-desc' }, 'A powerful delta encoding system that can handle any file type and produce very small patches. (Coming Soon)'),
                  e('button', { disabled: true, className: 'btn' }, 'Generate Xdelta')
                )
              )
            ),
            e('div', { className: 'terminal-card mt-6' }, e('h3', null, 'Export Translated ROM'), e('p', { style: { fontSize: 10, color: '#888', marginBottom: 15, textAlign: 'center' } }, 'Save the complete, modified ROM file with all your translations directly applied.'), e('div', { style: { textAlign: "center" } }, renderTaskButton({ label: 'Export Full ROM File', token: 'Exporting ROM', onClick: () => exportPatchedFile('rom'), disabled: !modifiedRom, className: 'btn' })))
          ),
          e('div', { className: `tab-content ${activeTab === 'tests' ? 'active' : ''}` },
            e('div', { className: 'terminal-card' },
              e('h3', null, 'Unit Test Suite'),
              e('div', { className: 'hex-status' }, 'Runs parser/encoding/decompression/system-detection checks in dedicated worker.'),
              e('div', { className: 'flex', style: { justifyContent: 'center', flexWrap: 'wrap', marginBottom: '10px' } },
                renderTaskButton({
                  label: 'Run Full Suite',
                  token: 'Running unit tests',
                  onClick: runUnitTestSuite,
                  className: 'btn'
                }),
                renderTaskButton({
                  label: 'Run Preview Pipeline',
                  token: 'Running preview pipeline tests',
                  onClick: runPreviewPipelineTest,
                  className: 'btn'
                })
              ),
              e('div', { className: 'hex-status' }, unitTestStatus),
              unitTestSummary && e('div', { className: 'hex-status' }, `Passed ${unitTestSummary.passed}/${unitTestSummary.total} | Failed ${unitTestSummary.failed}`),
              e('div', { className: 'hex-status' }, previewPipelineStatus),
              previewPipelineResults.length > 0 && e('div', { className: 'hex-side-list', style: { maxHeight: '18vh', marginBottom: '10px' } },
                ...previewPipelineResults.map((t, idx) => e('div', { key: `pt-prev-${idx}`, className: 'hex-side-item', style: { color: t.pass ? '#9ad79a' : '#ff8a8a' } }, `${t.pass ? 'PASS' : 'FAIL'} - ${t.name}${t.info ? ': ' + t.info : ''}`))
              ),
              unitTestResults.length > 0 && e('div', { className: 'hex-side-list', style: { maxHeight: '56vh' } },
                ...unitTestResults.map((t, idx) => e('div', { key: `ut-tab-${idx}`, className: 'hex-side-item', style: { color: t.pass ? '#9ad79a' : '#ff8a8a' } }, `${t.pass ? 'PASS' : 'FAIL'} - ${t.name}${t.info ? ': ' + t.info : ''}`))
              )
            )
          ),
          modalReport && e('div', {
            className: 'report-modal-overlay',
            onClick: () => {
              if (modalReport.type === 'error') setError('');
              else setSuccess('');
            }
          },
            e('div', { className: `report-modal ${modalReport.type === 'error' ? 'error' : ''}`, onClick: (ev) => ev.stopPropagation() },
              e('pre', null, modalReport.text),
              e('div', { className: 'flex', style: { justifyContent: 'center' } },
                e('button', {
                  className: 'btn btn-small',
                  onClick: () => {
                    if (modalReport.type === 'error') setError('');
                    else setSuccess('');
                  }
                }, 'OK')
              )
            )
          )
        ),
        e('div', {
          className: 'footer'
        }, 'PocketTranslate v0.0.1-Beta', e('br'), 'Created by ', e('strong', null, 'Ikhwan Ketor'))
      );
    };

    class AppErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, errorText: '' };
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, errorText: String(error?.message || error || 'Unknown render error') };
      }
      componentDidCatch(error, info) {
        console.error('AppErrorBoundary:', error, info);
      }
      render() {
        if (this.state.hasError) {
          return e('div', { className: 'terminal-card', style: { margin: '16px' } },
            e('h3', null, 'Application Error'),
            e('div', { className: 'error-box' }, `ERROR: ${this.state.errorText}`),
            e('div', { style: { fontSize: '11px', color: '#9ad79a' } }, 'Try refreshing the page. If issue persists, reload ROM and table file.')
          );
        }
        return this.props.children;
      }
    }

    const App = () => e(AppErrorBoundary, null, e(PocketTranslate, null));
    const root = createRoot(document.getElementById('root'));
    root.render(e(App, null));

