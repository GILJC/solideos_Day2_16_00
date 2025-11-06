/**
 * 시스템 리소스 모니터링 프론트엔드 로직
 * Chart.js + Socket.IO 실시간 대시보드
 */

// ========== 전역 변수 ==========
let socket = null;
let isMonitoring = false;
let monitoringStartTime = null;
let timerInterval = null;
let elapsedSeconds = 0;
const MAX_MONITORING_SECONDS = 300; // 5분
const MAX_DATA_POINTS = 600; // 최대 600개 데이터 포인트 저장

// 데이터 저장 배열
const dataHistory = {
    cpu: [],
    memory: [],
    network: { rx: [], tx: [] },
    disk: [],
    gpu: [],
    timestamps: []
};

// 차트 객체
let charts = {
    cpuLine: null,
    cpuCores: null,
    memDoughnut: null,
    memLine: null,
    diskBar: null,
    network: null,
    gpuGauge: null
};

// ========== DOM 요소 ==========
const elements = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    pdfBtn: document.getElementById('pdfBtn'),
    timerText: document.getElementById('timerText'),
    progressBar: document.getElementById('progressBar'),
    connectionStatus: document.getElementById('connectionStatus'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    timerCompleteModal: document.getElementById('timerCompleteModal'),
    closeTimerModalBtn: document.getElementById('closeTimerModalBtn'),
    generatePdfBtn: document.getElementById('generatePdfBtn')
};

// ========== 초기화 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('애플리케이션 초기화 중...');

    // Socket.IO 연결
    initializeSocket();

    // 차트 초기화
    initializeCharts();

    // 이벤트 리스너 등록
    setupEventListeners();

    // 로딩 오버레이 숨기기
    hideLoading();

    console.log('초기화 완료');
});

// ========== Socket.IO 초기화 ==========
function initializeSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('서버 연결됨');
        updateConnectionStatus(true);
    });

    socket.on('disconnect', () => {
        console.log('서버 연결 해제됨');
        updateConnectionStatus(false);
        if (isMonitoring) {
            stopMonitoring();
        }
    });

    socket.on('system-data', (data) => {
        handleSystemData(data);
    });

    socket.on('error', (error) => {
        console.error('Socket 오류:', error);
        alert('데이터 수신 오류: ' + error.message);
    });
}

// ========== 차트 초기화 ==========
function initializeCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#e0e0e0',
                    font: { size: 12 }
                }
            }
        },
        scales: {
            x: {
                grid: { color: '#3d3d3d' },
                ticks: { color: '#b0b0b0' }
            },
            y: {
                grid: { color: '#3d3d3d' },
                ticks: { color: '#b0b0b0' }
            }
        }
    };

    // CPU 라인 차트
    charts.cpuLine = new Chart(document.getElementById('cpuLineChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU 사용률 (%)',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 100 }
            }
        }
    });

    // CPU 코어 바 차트
    charts.cpuCores = new Chart(document.getElementById('cpuCoresChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '코어 사용률 (%)',
                data: [],
                backgroundColor: '#ff6b6b',
                borderColor: '#ff8787',
                borderWidth: 1
            }]
        },
        options: {
            ...commonOptions,
            indexAxis: 'y',
            scales: {
                x: { ...commonOptions.scales.x, min: 0, max: 100 }
            }
        }
    });

    // 메모리 도넛 차트
    charts.memDoughnut = new Chart(document.getElementById('memDoughnutChart'), {
        type: 'doughnut',
        data: {
            labels: ['사용중', '사용가능'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#4ecdc4', '#3d3d3d'],
                borderColor: ['#4ecdc4', '#3d3d3d'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e0e0e0',
                        font: { size: 11 }
                    }
                }
            }
        }
    });

    // 메모리 라인 차트
    charts.memLine = new Chart(document.getElementById('memLineChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '메모리 사용률 (%)',
                data: [],
                borderColor: '#4ecdc4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 100 }
            }
        }
    });

    // 디스크 바 차트
    charts.diskBar = new Chart(document.getElementById('diskBarChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '디스크 사용률 (%)',
                data: [],
                backgroundColor: '#ffe66d',
                borderColor: '#ffd43b',
                borderWidth: 1
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 100 }
            }
        }
    });

    // 네트워크 듀얼 라인 차트
    charts.network = new Chart(document.getElementById('networkChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '다운로드 (KB/s)',
                    data: [],
                    borderColor: '#51cf66',
                    backgroundColor: 'rgba(81, 207, 102, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '업로드 (KB/s)',
                    data: [],
                    borderColor: '#4dabf7',
                    backgroundColor: 'rgba(77, 171, 247, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: commonOptions
    });

    // GPU 게이지 차트 (도넛 차트로 구현)
    charts.gpuGauge = new Chart(document.getElementById('gpuGaugeChart'), {
        type: 'doughnut',
        data: {
            labels: ['사용중', '여유'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#ff9ff3', '#3d3d3d'],
                borderColor: ['#ff9ff3', '#3d3d3d'],
                borderWidth: 2,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// ========== 이벤트 리스너 ==========
function setupEventListeners() {
    elements.startBtn.addEventListener('click', startMonitoring);
    elements.stopBtn.addEventListener('click', stopMonitoring);
    elements.pdfBtn.addEventListener('click', () => {
        if (typeof generatePDF === 'function') {
            generatePDF(dataHistory);
        } else {
            alert('PDF 생성 기능을 불러올 수 없습니다.');
        }
    });

    elements.closeTimerModalBtn.addEventListener('click', () => {
        elements.timerCompleteModal.classList.remove('active');
    });

    elements.generatePdfBtn.addEventListener('click', () => {
        elements.timerCompleteModal.classList.remove('active');
        if (typeof generatePDF === 'function') {
            generatePDF(dataHistory);
        }
    });
}

// ========== 모니터링 시작 ==========
function startMonitoring() {
    console.log('모니터링 시작');
    isMonitoring = true;
    monitoringStartTime = Date.now();
    elapsedSeconds = 0;

    // 데이터 히스토리 초기화
    dataHistory.cpu = [];
    dataHistory.memory = [];
    dataHistory.network.rx = [];
    dataHistory.network.tx = [];
    dataHistory.disk = [];
    dataHistory.gpu = [];
    dataHistory.timestamps = [];

    // 버튼 상태 업데이트
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    elements.pdfBtn.disabled = true;

    // 타이머 시작
    startTimer();

    // 서버에 모니터링 시작 신호
    socket.emit('start-monitoring');

    showLoading();
    setTimeout(hideLoading, 1000);
}

// ========== 모니터링 중지 ==========
function stopMonitoring() {
    console.log('모니터링 중지');
    isMonitoring = false;

    // 버튼 상태 업데이트
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    elements.pdfBtn.disabled = false;

    // 타이머 중지
    stopTimer();

    // 서버에 모니터링 중지 신호
    socket.emit('stop-monitoring');

    // 로컬 스토리지에 데이터 저장
    saveDataToLocalStorage();
}

// ========== 타이머 ==========
function startTimer() {
    timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimerDisplay();

        // 5분 경과 시 자동 중지
        if (elapsedSeconds >= MAX_MONITORING_SECONDS) {
            stopMonitoring();
            showTimerCompleteModal();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const totalMinutes = Math.floor(MAX_MONITORING_SECONDS / 60);

    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} / ${String(totalMinutes).padStart(2, '0')}:00`;
    elements.timerText.textContent = timeStr;

    // 프로그레스 바 업데이트
    const progress = (elapsedSeconds / MAX_MONITORING_SECONDS) * 100;
    elements.progressBar.style.width = `${progress}%`;
}

// ========== 시스템 데이터 처리 ==========
function handleSystemData(data) {
    if (!isMonitoring || !data || data.error) {
        return;
    }

    // 타임스탬프 생성
    const timestamp = new Date().toLocaleTimeString();

    // 데이터 히스토리에 추가
    dataHistory.timestamps.push(timestamp);
    dataHistory.cpu.push(data.cpu.usage);
    dataHistory.memory.push(data.memory.usagePercent);

    // 네트워크 데이터 (첫 번째 인터페이스 사용)
    if (data.network && data.network.length > 0) {
        const primaryInterface = data.network.find(iface => iface.operstate === 'up') || data.network[0];
        dataHistory.network.rx.push(primaryInterface.rxSpeed / 1024); // KB/s
        dataHistory.network.tx.push(primaryInterface.txSpeed / 1024); // KB/s
    } else {
        dataHistory.network.rx.push(0);
        dataHistory.network.tx.push(0);
    }

    // GPU 데이터
    if (data.gpu && data.gpu.length > 0) {
        dataHistory.gpu.push(data.gpu[0].utilizationGpu || 0);
    } else {
        dataHistory.gpu.push(0);
    }

    // 최대 데이터 포인트 유지
    if (dataHistory.timestamps.length > MAX_DATA_POINTS) {
        dataHistory.timestamps.shift();
        dataHistory.cpu.shift();
        dataHistory.memory.shift();
        dataHistory.network.rx.shift();
        dataHistory.network.tx.shift();
        dataHistory.gpu.shift();
    }

    // UI 업데이트
    updateCPU(data.cpu);
    updateMemory(data.memory);
    updateDisk(data.disk);
    updateNetwork(data.network);
    updateGPU(data.gpu);
    updateProcesses(data.processes);
    updateFooter(data);
}

// ========== CPU 업데이트 ==========
function updateCPU(cpuData) {
    // CPU 사용률 숫자
    animateNumber('cpuUsage', cpuData.usage);

    // CPU 브랜드 및 온도
    document.getElementById('cpuBrand').textContent = cpuData.brand || 'Unknown CPU';
    document.getElementById('cpuTemp').textContent = cpuData.temperature.toFixed(1);

    // CPU 라인 차트 업데이트
    const lineChart = charts.cpuLine;
    lineChart.data.labels = dataHistory.timestamps.slice(-60); // 최근 60개
    lineChart.data.datasets[0].data = dataHistory.cpu.slice(-60);
    lineChart.update('none');

    // CPU 코어 차트 업데이트
    const coresChart = charts.cpuCores;
    coresChart.data.labels = cpuData.coresLoad.map((_, i) => `코어 ${i + 1}`);
    coresChart.data.datasets[0].data = cpuData.coresLoad.map(core => core.load);
    coresChart.update('none');
}

// ========== 메모리 업데이트 ==========
function updateMemory(memData) {
    // 메모리 사용률 숫자
    animateNumber('memUsage', memData.usagePercent);

    // 메모리 사용량 (GB)
    const usedGB = (memData.used / (1024 ** 3)).toFixed(2);
    const totalGB = (memData.total / (1024 ** 3)).toFixed(2);
    document.getElementById('memUsed').textContent = usedGB;
    document.getElementById('memTotal').textContent = totalGB;

    // 메모리 도넛 차트 업데이트
    const doughnutChart = charts.memDoughnut;
    doughnutChart.data.datasets[0].data = [
        memData.usagePercent,
        100 - memData.usagePercent
    ];
    doughnutChart.update('none');

    // 메모리 라인 차트 업데이트
    const lineChart = charts.memLine;
    lineChart.data.labels = dataHistory.timestamps.slice(-60);
    lineChart.data.datasets[0].data = dataHistory.memory.slice(-60);
    lineChart.update('none');
}

// ========== 디스크 업데이트 ==========
function updateDisk(diskData) {
    // 디스크 정보 텍스트
    const diskInfo = document.getElementById('diskInfo');
    if (diskData.filesystems && diskData.filesystems.length > 0) {
        const mainDisk = diskData.filesystems[0];
        const sizeGB = (mainDisk.size / (1024 ** 3)).toFixed(2);
        const usedGB = (mainDisk.used / (1024 ** 3)).toFixed(2);
        diskInfo.innerHTML = `
            <strong>${mainDisk.fs}</strong><br>
            ${usedGB} GB / ${sizeGB} GB (${mainDisk.usagePercent.toFixed(1)}%)
        `;
    }

    // 디스크 I/O 속도
    const readSpeedMB = (diskData.io.readSpeed / (1024 ** 2)).toFixed(2);
    const writeSpeedMB = (diskData.io.writeSpeed / (1024 ** 2)).toFixed(2);
    document.getElementById('diskReadSpeed').textContent = readSpeedMB;
    document.getElementById('diskWriteSpeed').textContent = writeSpeedMB;

    // 디스크 바 차트 업데이트
    if (diskData.filesystems && diskData.filesystems.length > 0) {
        const barChart = charts.diskBar;
        barChart.data.labels = diskData.filesystems.map(fs => fs.mount || fs.fs);
        barChart.data.datasets[0].data = diskData.filesystems.map(fs => fs.usagePercent);
        barChart.update('none');
    }
}

// ========== 네트워크 업데이트 ==========
function updateNetwork(networkData) {
    if (!networkData || networkData.length === 0) return;

    // 활성 인터페이스 찾기
    const activeInterface = networkData.find(iface => iface.operstate === 'up') || networkData[0];

    // 현재 속도 (KB/s)
    const rxSpeedKB = (activeInterface.rxSpeed / 1024).toFixed(2);
    const txSpeedKB = (activeInterface.txSpeed / 1024).toFixed(2);
    document.getElementById('downloadSpeed').textContent = rxSpeedKB;
    document.getElementById('uploadSpeed').textContent = txSpeedKB;

    // 총 전송량 (MB)
    const totalMB = ((activeInterface.rxBytes + activeInterface.txBytes) / (1024 ** 2)).toFixed(2);
    document.getElementById('totalTransfer').textContent = totalMB;

    // 네트워크 차트 업데이트
    const netChart = charts.network;
    netChart.data.labels = dataHistory.timestamps.slice(-60);
    netChart.data.datasets[0].data = dataHistory.network.rx.slice(-60);
    netChart.data.datasets[1].data = dataHistory.network.tx.slice(-60);
    netChart.update('none');
}

// ========== GPU 업데이트 ==========
function updateGPU(gpuData) {
    if (!gpuData || gpuData.length === 0) {
        document.getElementById('gpuUsage').textContent = '0';
        document.getElementById('gpuModel').textContent = '감지 안됨';
        document.getElementById('gpuTemp').textContent = '0';
        document.getElementById('gpuMemUsed').textContent = '0';
        document.getElementById('gpuMemTotal').textContent = '0';
        document.getElementById('gpuMemFill').style.width = '0%';
        return;
    }

    const gpu = gpuData[0];

    // GPU 사용률
    animateNumber('gpuUsage', gpu.utilizationGpu || 0);

    // GPU 모델 및 온도
    document.getElementById('gpuModel').textContent = gpu.model || 'Unknown GPU';
    document.getElementById('gpuTemp').textContent = (gpu.temperatureGpu || 0).toFixed(1);

    // GPU 메모리
    const memUsed = gpu.memoryUsed || 0;
    const memTotal = gpu.memoryTotal || 0;
    document.getElementById('gpuMemUsed').textContent = memUsed;
    document.getElementById('gpuMemTotal').textContent = memTotal;

    const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
    document.getElementById('gpuMemFill').style.width = `${memPercent}%`;

    // GPU 게이지 차트 업데이트
    const gaugeChart = charts.gpuGauge;
    const usage = gpu.utilizationGpu || 0;
    gaugeChart.data.datasets[0].data = [usage, 100 - usage];
    gaugeChart.update('none');
}

// ========== 프로세스 업데이트 ==========
function updateProcesses(processData) {
    if (!processData) return;

    // CPU 상위 5개
    const topCpuTable = document.getElementById('topCpuTable');
    topCpuTable.innerHTML = '';
    processData.topCpu.slice(0, 5).forEach(proc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${proc.pid}</td>
            <td>${proc.name}</td>
            <td>${proc.cpu.toFixed(1)}%</td>
            <td>${proc.mem.toFixed(1)}%</td>
        `;
        topCpuTable.appendChild(row);
    });

    // 메모리 상위 5개
    const topMemTable = document.getElementById('topMemTable');
    topMemTable.innerHTML = '';
    processData.topMem.slice(0, 5).forEach(proc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${proc.pid}</td>
            <td>${proc.name}</td>
            <td>${proc.cpu.toFixed(1)}%</td>
            <td>${proc.mem.toFixed(1)}%</td>
        `;
        topMemTable.appendChild(row);
    });
}

// ========== 푸터 업데이트 ==========
function updateFooter(data) {
    document.getElementById('footerCpu').textContent = `${data.cpu.usage.toFixed(1)}%`;
    document.getElementById('footerMem').textContent = `${data.memory.usagePercent.toFixed(1)}%`;

    if (data.disk.filesystems && data.disk.filesystems.length > 0) {
        document.getElementById('footerDisk').textContent = `${data.disk.filesystems[0].usagePercent.toFixed(1)}%`;
    }

    if (data.network && data.network.length > 0) {
        const activeInterface = data.network.find(iface => iface.operstate === 'up') || data.network[0];
        const speedKB = ((activeInterface.rxSpeed + activeInterface.txSpeed) / 1024).toFixed(2);
        document.getElementById('footerNetwork').textContent = `${speedKB} KB/s`;
    }

    document.getElementById('footerDataPoints').textContent = dataHistory.timestamps.length;
}

// ========== 숫자 애니메이션 ==========
function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseFloat(element.textContent) || 0;
    const diff = targetValue - currentValue;
    const steps = 10;
    const stepValue = diff / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
        currentStep++;
        const newValue = currentValue + (stepValue * currentStep);
        element.textContent = newValue.toFixed(1);

        if (currentStep >= steps) {
            clearInterval(interval);
            element.textContent = targetValue.toFixed(1);
        }
    }, 20);
}

// ========== 연결 상태 업데이트 ==========
function updateConnectionStatus(connected) {
    if (connected) {
        elements.connectionStatus.classList.add('connected');
        elements.connectionStatus.classList.remove('disconnected');
        elements.connectionStatus.querySelector('span').textContent = '연결됨';
    } else {
        elements.connectionStatus.classList.remove('connected');
        elements.connectionStatus.classList.add('disconnected');
        elements.connectionStatus.querySelector('span').textContent = '연결 해제됨';
    }
}

// ========== 로딩 오버레이 ==========
function showLoading() {
    elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}

// ========== 타이머 완료 모달 ==========
function showTimerCompleteModal() {
    elements.timerCompleteModal.classList.add('active');
}

// ========== 로컬 스토리지 ==========
function saveDataToLocalStorage() {
    try {
        localStorage.setItem('monitoringData', JSON.stringify({
            data: dataHistory,
            timestamp: Date.now(),
            duration: elapsedSeconds
        }));
        console.log('데이터 저장 완료');
    } catch (error) {
        console.error('로컬 스토리지 저장 오류:', error);
    }
}

function loadDataFromLocalStorage() {
    try {
        const saved = localStorage.getItem('monitoringData');
        if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.data;
        }
    } catch (error) {
        console.error('로컬 스토리지 로드 오류:', error);
    }
    return null;
}

// ========== 전역 함수 노출 (PDF 생성용) ==========
window.getDataHistory = () => dataHistory;
window.getCharts = () => charts;
window.getElapsedSeconds = () => elapsedSeconds;
window.getMonitoringStartTime = () => monitoringStartTime;
