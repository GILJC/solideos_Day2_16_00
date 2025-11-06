/**
 * 시스템 리소스 모니터링 서버
 * Express + Socket.IO로 실시간 시스템 정보 전송
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const si = require('systeminformation');
const cors = require('cors');
const path = require('path');

// Express 앱 초기화
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 포트 설정
const PORT = process.env.PORT || 3000;

// 이전 네트워크 통계를 저장 (속도 계산용)
let previousNetworkStats = null;
let previousDiskIO = null;

/**
 * 시스템 정보 수집 함수
 */
async function getSystemInfo() {
  try {
    // 모든 시스템 정보를 병렬로 가져오기
    const [
      cpuData,
      cpuTemp,
      memData,
      diskLayout,
      fsSize,
      networkStats,
      diskIO,
      processes,
      gpuData,
      currentLoad
    ] = await Promise.all([
      si.cpu(),
      si.cpuTemperature(),
      si.mem(),
      si.diskLayout(),
      si.fsSize(),
      si.networkStats(),
      si.disksIO(),
      si.processes(),
      si.graphics(),
      si.currentLoad()
    ]);

    // CPU 정보 처리
    const cpuInfo = {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      speed: cpuData.speed,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
      usage: currentLoad.currentLoad,
      coresLoad: currentLoad.cpus.map(cpu => ({
        load: cpu.load,
        loadUser: cpu.loadUser,
        loadSystem: cpu.loadSystem
      })),
      temperature: cpuTemp.main || 0
    };

    // 메모리 정보 처리
    const memoryInfo = {
      total: memData.total,
      used: memData.used,
      free: memData.free,
      active: memData.active,
      available: memData.available,
      usagePercent: (memData.used / memData.total) * 100,
      swapTotal: memData.swaptotal,
      swapUsed: memData.swapused,
      swapFree: memData.swapfree
    };

    // 디스크 정보 처리
    const diskInfo = {
      layout: diskLayout.map(disk => ({
        name: disk.name,
        type: disk.type,
        size: disk.size,
        interfaceType: disk.interfaceType
      })),
      filesystems: fsSize.map(fs => ({
        fs: fs.fs,
        type: fs.type,
        size: fs.size,
        used: fs.used,
        available: fs.available,
        usagePercent: fs.use,
        mount: fs.mount
      })),
      io: {
        read: diskIO.rIO,
        write: diskIO.wIO,
        readSpeed: 0,
        writeSpeed: 0
      }
    };

    // 디스크 I/O 속도 계산 (이전 값과 비교)
    if (previousDiskIO) {
      const timeDiff = 0.5; // 0.5초 간격
      diskInfo.io.readSpeed = (diskIO.rIO - previousDiskIO.rIO) / timeDiff;
      diskInfo.io.writeSpeed = (diskIO.wIO - previousDiskIO.wIO) / timeDiff;
    }
    previousDiskIO = diskIO;

    // 네트워크 정보 처리
    const networkInfo = networkStats.map((iface, index) => {
      let rxSpeed = 0;
      let txSpeed = 0;

      // 네트워크 속도 계산 (이전 값과 비교)
      if (previousNetworkStats && previousNetworkStats[index]) {
        const timeDiff = 0.5; // 0.5초 간격
        rxSpeed = (iface.rx_bytes - previousNetworkStats[index].rx_bytes) / timeDiff;
        txSpeed = (iface.tx_bytes - previousNetworkStats[index].tx_bytes) / timeDiff;
      }

      return {
        iface: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        operstate: iface.operstate,
        rxBytes: iface.rx_bytes,
        txBytes: iface.tx_bytes,
        rxSpeed: rxSpeed,
        txSpeed: txSpeed,
        rxErrors: iface.rx_errors,
        txErrors: iface.tx_errors
      };
    });
    previousNetworkStats = networkStats;

    // GPU 정보 처리
    const gpuInfo = gpuData.controllers.map(gpu => ({
      model: gpu.model,
      vendor: gpu.vendor,
      vram: gpu.vram,
      temperatureGpu: gpu.temperatureGpu || 0,
      utilizationGpu: gpu.utilizationGpu || 0,
      utilizationMemory: gpu.utilizationMemory || 0,
      memoryTotal: gpu.memoryTotal || 0,
      memoryUsed: gpu.memoryUsed || 0
    }));

    // 프로세스 정보 처리 (CPU/메모리 상위 10개)
    const sortedByCpu = [...processes.list]
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map(proc => ({
        pid: proc.pid,
        name: proc.name,
        cpu: proc.cpu,
        mem: proc.mem,
        memVsz: proc.memVsz,
        memRss: proc.memRss
      }));

    const sortedByMem = [...processes.list]
      .sort((a, b) => b.mem - a.mem)
      .slice(0, 10)
      .map(proc => ({
        pid: proc.pid,
        name: proc.name,
        cpu: proc.cpu,
        mem: proc.mem,
        memVsz: proc.memVsz,
        memRss: proc.memRss
      }));

    const processInfo = {
      all: processes.all,
      running: processes.running,
      blocked: processes.blocked,
      sleeping: processes.sleeping,
      topCpu: sortedByCpu,
      topMem: sortedByMem
    };

    // 전체 시스템 정보 반환
    return {
      timestamp: Date.now(),
      cpu: cpuInfo,
      memory: memoryInfo,
      disk: diskInfo,
      network: networkInfo,
      gpu: gpuInfo,
      processes: processInfo
    };

  } catch (error) {
    console.error('시스템 정보 수집 오류:', error);
    return {
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * REST API 엔드포인트
 */
app.get('/api/system-info', async (req, res) => {
  try {
    const systemInfo = await getSystemInfo();
    res.json(systemInfo);
  } catch (error) {
    console.error('API 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Socket.IO 연결 처리
 */
io.on('connection', (socket) => {
  console.log('클라이언트 연결됨:', socket.id);

  let monitoringInterval = null;

  // 모니터링 시작
  socket.on('start-monitoring', () => {
    console.log('모니터링 시작:', socket.id);

    // 기존 인터벌 정리
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }

    // 0.5초마다 시스템 정보 전송
    monitoringInterval = setInterval(async () => {
      try {
        const systemInfo = await getSystemInfo();
        socket.emit('system-data', systemInfo);
      } catch (error) {
        console.error('데이터 전송 오류:', error);
        socket.emit('error', { message: error.message });
      }
    }, 500);
  });

  // 모니터링 중지
  socket.on('stop-monitoring', () => {
    console.log('모니터링 중지:', socket.id);
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log('클라이언트 연결 해제:', socket.id);
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  });

  // 에러 처리
  socket.on('error', (error) => {
    console.error('Socket 오류:', error);
  });
});

/**
 * 서버 시작
 */
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   시스템 리소스 모니터링 서버 시작됨                    ║
║   포트: ${PORT}                                        ║
║   URL: http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// 프로세스 종료 시 정리
process.on('SIGTERM', () => {
  console.log('서버 종료 중...');
  server.close(() => {
    console.log('서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n서버 종료 중...');
  server.close(() => {
    console.log('서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
});

module.exports = { app, server, io };
